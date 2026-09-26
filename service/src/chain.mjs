// Sepolia reads. One viem client over the RPC list from env (fallback transport, in order).
import { createPublicClient, fallback, http, decodeErrorResult, decodeEventLog, getAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { env, addr } from './config.mjs';
import { abi } from './abi.mjs';

export const client = createPublicClient({
  chain: sepolia,
  transport: fallback(env.rpcs.map((u) => http(u, { timeout: 15_000, retryCount: 1 })), { rank: false }),
});

export const Q96 = 2n ** 96n;
// A CCA/curve price in Q96 is currency-per-token in atomic units: USDC (6 dp) per WETH (18 dp).
// usdcPerWeth = q96 / 2^96 * 10^(18-6). Printed with 2 decimals, as a string.
export function priceView(q96) {
  if (q96 == null) return null;
  const v = BigInt(q96);
  const cents = (v * 10n ** 12n * 100n) / Q96;
  const s = cents.toString().padStart(3, '0');
  return { q96: v.toString(), usdcPerWeth: `${s.slice(0, -2)}.${s.slice(-2)}` };
}

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

// The lease, straight from Castle's ICastleLease views. `at` pins the read to a block.
export async function readLease(at) {
  const castle = addr('castle');
  if (!castle) return null;
  const opts = at != null ? { blockNumber: BigInt(at) } : {};
  const read = (fn) => client.readContract({ address: castle, abi: abi('Castle'), functionName: fn, ...opts }).catch(() => undefined);
  const [holder, epoch, expiry, fo, leasePeriod] = await Promise.all([read('holder'), read('epoch'), read('expiry'), read('fo'), read('leasePeriod')]);
  return {
    holder: holder ?? null,
    epoch: epoch != null ? epoch.toString() : null,
    expiry: expiry != null ? Number(expiry) : null,
    fo: fo ?? null,
    leasePeriod: leasePeriod != null ? Number(leasePeriod) : null,
  };
}

// The fence rule, identical to miniapp/STREAM.md and FeeFiFoFumExtruction: epoch first, then time.
export function fenceDecision(programEpoch, leaseEpoch, expiry, blockTimeSec) {
  if (programEpoch != null && leaseEpoch != null && String(programEpoch) !== String(leaseEpoch)) return 'fenced';
  if (expiry != null && blockTimeSec > expiry) return 'wind-down';
  return 'live';
}
export const leaseState = (lease, nowSec) =>
  !lease || lease.expiry == null ? null : nowSec > lease.expiry ? 'WIND-DOWN' : 'LIVE';

export async function inventory() {
  const castle = addr('castle');
  const [weth, usdc] = await Promise.all([
    tryRead(addr('weth'), 'ERC20', 'balanceOf', [castle]),
    tryRead(addr('usdc'), 'ERC20', 'balanceOf', [castle]),
  ]);
  return { weth: weth != null ? weth.toString() : null, usdc: usdc != null ? usdc.toString() : null };
}

export async function auctionView(auction) {
  if (!auction) return null;
  const r = (fn) => tryRead(auction, 'CCA', fn);
  const [clearing, graduated, currency, token, totalSupply, startBlock, endBlock, claimBlock, hook] = await Promise.all(
    ['clearingPrice', 'isGraduated', 'currency', 'token', 'totalSupply', 'startBlock', 'endBlock', 'claimBlock', 'validationHook'].map(r));
  const { number } = await head();
  const status = endBlock == null ? 'unknown' : number < BigInt(startBlock ?? 0) ? 'pending' : number <= endBlock ? 'open' : 'ended';
  return {
    auction, status, graduated: graduated ?? null,
    clearing: clearing != null ? priceView(clearing) : null,
    currency: currency ?? null, token: token ?? null, hook: hook ?? null,
    totalSupply: totalSupply != null ? totalSupply.toString() : null,
    startBlock: startBlock != null ? Number(startBlock) : null,
    endBlock: endBlock != null ? Number(endBlock) : null,
    claimBlock: claimBlock != null ? Number(claimBlock) : null,
    headBlock: Number(number),
  };
}

// Decode a revert from any ABI we know, so a fenced fill reads FeeFiFoFum() and a JackHook refusal reads as one.
const REVERT_ABIS = ['Castle', 'FeeFiFoFumExtruction', 'SwapVM', 'TakerTraits', 'CCA', 'JackHook', 'Aqua'];
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
    await client.call({ to: tx.to, data: tx.input, from: tx.from, value: tx.value, blockNumber: tx.blockNumber - 1n });
    return { tx, reason: null };
  } catch (e) {
    let data = e?.data ?? e?.cause?.data ?? e?.walk?.((x) => x?.data)?.data;
    if (typeof data === 'object' && data?.data) data = data.data;
    return { tx, reason: typeof data === 'string' ? decodeRevert(data) : (e?.shortMessage || 'reverted') };
  }
}

export function tryDecode(abiName, log) {
  const a = abi(abiName);
  if (!a) return null;
  try { return decodeEventLog({ abi: a, data: log.data, topics: log.topics }); } catch { return null; }
}
export const sameAddr = (a, b) => !!a && !!b && getAddress(a) === getAddress(b);
