// Sepolia reads (or an anvil fork's). One viem client over the RPC list from env (fallback transport, in order).
import { createPublicClient, fallback, http, decodeErrorResult, decodeEventLog, getAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { env } from './config.mjs';
import { abi } from './abi.mjs';

export const client = createPublicClient({
  chain: sepolia,
  transport: fallback(env.rpcs.map((u) => http(u, { timeout: 15_000, retryCount: 1 })), { rank: false }),
});

async function tryRead(address, abiName, functionName, args = []) {
  if (!address) return undefined;
  try { return await client.readContract({ address, abi: abi(abiName), functionName, args }); }
  catch { return undefined; }
}

export async function head() {
  const b = await client.getBlock({ blockTag: 'latest' });
  return { number: b.number, timestamp: Number(b.timestamp) };
}

const blockTimes = new Map();
export async function blockTime(n) {
  const k = BigInt(n);
  if (blockTimes.has(k)) return blockTimes.get(k);
  const b = await client.getBlock({ blockNumber: k });
  const t = Number(b.timestamp);
  blockTimes.set(k, t);
  if (blockTimes.size > 5000) blockTimes.delete(blockTimes.keys().next().value);
  return t;
}

// Decode a revert from any ABI we know, so a refused ship reads OverAllocated(...) and a stale quote QuoteExpired(...).
const REVERT_ABIS = ['CastleVault', 'PriceExtruction', 'OffchainQuoteResolver', 'CastleJITHook', 'SwapVM', 'TakerTraits', 'Aqua'];
export function decodeRevert(data) {
  if (!data || data === '0x') return null;
  for (const n of REVERT_ABIS) {
    const a = abi(n);
    if (!a) continue;
    try {
      const d = decodeErrorResult({ abi: a, data });
      return `${d.errorName}(${(d.args || []).map(String).join(',')})`;
    } catch { /* try the next abi */ }
  }
  return data.slice(0, 10);
}

// Replay a mined tx as a call at its parent block to recover the revert data (reverted txs emit no logs).
export async function revertReason(txHash) {
  const tx = await client.getTransaction({ hash: txHash });
  try {
    await client.call({ account: tx.from, to: tx.to, data: tx.input, value: tx.value, blockNumber: tx.blockNumber - 1n });
    return { tx, reason: null };
  } catch (e) {
    let data = e?.data ?? e?.cause?.data ?? e?.walk?.((x) => x?.data)?.data;
    if (typeof data === 'object' && data?.data) data = data.data;
    return { tx, reason: typeof data === 'string' ? decodeRevert(data) : (e?.shortMessage || 'reverted') };
  }
}

// A reverted tx's error, decoded: {name, args} from the first ABI that knows it, or {raw} (the selector).
export async function revertError(txHash) {
  const tx = await client.getTransaction({ hash: txHash });
  try {
    await client.call({ account: tx.from, to: tx.to, data: tx.input, value: tx.value, blockNumber: tx.blockNumber - 1n });
    return null;
  } catch (e) {
    let data = e?.data ?? e?.cause?.data ?? e?.walk?.((x) => x?.data)?.data;
    if (typeof data === 'object' && data?.data) data = data.data;
    if (typeof data !== 'string' || data === '0x') return { raw: e?.shortMessage || 'reverted' };
    for (const n of REVERT_ABIS) {
      const a = abi(n);
      if (!a) continue;
      try { const d = decodeErrorResult({ abi: a, data }); return { name: d.errorName, args: d.args || [] }; } catch { /* next */ }
    }
    return { raw: data.slice(0, 10) };
  }
}

export function tryDecode(abiName, log) {
  const a = abi(abiName);
  if (!a) return null;
  try { return decodeEventLog({ abi: a, data: log.data, topics: log.topics }); } catch { return null; }
}
export const sameAddr = (a, b) => !!a && !!b && getAddress(a) === getAddress(b);
