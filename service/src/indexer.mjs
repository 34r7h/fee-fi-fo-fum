// The chain half of the castle stream v2 (miniapp/STREAM.md, with docs/SPEC.md's names). The indexer polls Sepolia
// (or an anvil fork of it) for the CastleVault's logs and the router's Swapped logs whose maker is the vault, and
// emits strategy.shipped, strategy.docked, cap.set, leverage.set, fill and hoard. Aqua is the ledger: a ship records
// a virtual balance per token (rawBalances), and a fill pulls one token and pushes the other. A fill whose taker is
// the hook (its tx also holds a PoolManager Swap) is route "v4", filled just in time from hen; otherwise "aqua".
// Reverted txs emit no logs: a reverted ship reaches the stream through fi's report (report.mjs), and a reverted
// fill through castle_fill {tx_hash}. Agent liveness is the later of each agent's last_seen on handoff.lol
// (agent_heartbeat) and its last signed beat to POST /report.
import { getAddress, decodeFunctionData, decodeAbiParameters, encodeAbiParameters, keccak256, sliceHex } from 'viem';
import { env, addr, addressBook, deployBlock, value, crewConfig, miniappConfig } from './config.mjs';
import { abi } from './abi.mjs';
import { client, head, blockTime, tryDecode, sameAddr, revertReason, revertError } from './chain.mjs';
import { open, emit, view, find, since, snapshotBody, cursorMeta, saveMeta } from './stream.mjs';
import { forgetHarp, findQuote, HARP_SLOT, HEN_SLOT } from './quote.mjs';

const CHUNK = 2000n;          // eth_getLogs block span per request (public Sepolia RPCs cap the range)
const STALE_MS = 90_000;      // an agent whose agent_heartbeat is older than this is shown as down

export const DECIMALS = { USDC: 6, WETH: 18 };
export const SLOT_NAMES = { [HARP_SLOT]: 'harp', [HEN_SLOT]: 'hen', 2: 'greedy' };
const OP_NAMES = { 17: 'XYCSwap', 21: 'XYCSwap + flatFee', 32: 'PriceExtruction' };
const henFees = new Map();   // strategy hash -> hen's flatFee in swap-vm's 1e9 scale
const symbolOf = (a) => (sameAddr(a, addr('usdc')) ? 'USDC' : sameAddr(a, addr('weth')) ? 'WETH' : null);
const str = (v) => (v == null ? null : v.toString());
const arg = (d, n) => d?.args?.[n];
const ORDER = [{ type: 'tuple', components: [{ name: 'maker', type: 'address' }, { name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] }];
const QUOTE_TUPLE = { type: 'tuple', components: [{ name: 'strategyHash', type: 'bytes32' }, { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'priceQ96', type: 'uint256' }, { name: 'maxAmountIn', type: 'uint256' }, { name: 'validUntil', type: 'uint64' }] };

let cursor = null;
let vaultKey = null;
const slotCaps = new Map();   // slot -> {WETH, USDC}
const slotOf = new Map();     // strategy hash -> slot
const leverage = {};          // symbol -> bps

// ---- chain reads -----------------------------------------------------------------------------------------
const at = (b) => (b != null ? { blockNumber: BigInt(b) } : {});
async function erc20(token, fn, args, b) {
  if (!token) return null;
  return client.readContract({ address: token, abi: abi('ERC20'), functionName: fn, args, ...at(b) }).catch(() => null);
}
export async function hoardAt(b) {
  const vault = addr('castle');
  const [u, w] = await Promise.all([erc20(addr('usdc'), 'balanceOf', [vault], b), erc20(addr('weth'), 'balanceOf', [vault], b)]);
  const bag = {};
  if (u != null) bag.USDC = u.toString();
  if (w != null) bag.WETH = w.toString();
  return bag;
}
// A strategy's Aqua allocation per token (its virtual balance), at a block.
export async function allocAt(hash, b) {
  const aqua = addr('aqua'), vault = addr('castle'), router = addr('router');
  const bag = {};
  for (const [sym, token] of [['USDC', addr('usdc')], ['WETH', addr('weth')]]) {
    if (!aqua || !token) continue;
    const r = await client.readContract({ address: aqua, abi: abi('Aqua'), functionName: 'rawBalances', args: [vault, router, hash, token], ...at(b) }).catch(() => null);
    if (r) bag[sym] = r[0].toString();
  }
  return bag;
}
async function vaultRead(fn, args = [], b) {
  return client.readContract({ address: addr('castle'), abi: abi('CastleVault'), functionName: fn, args, ...at(b) }).catch(() => null);
}
export async function committedAt(b) {
  const [u, w] = await Promise.all([vaultRead('committed', [addr('usdc')], b), vaultRead('committed', [addr('weth')], b)]);
  return { ...(u != null ? { USDC: u.toString() } : {}), ...(w != null ? { WETH: w.toString() } : {}) };
}
// The program's shape, from its first opcode: harp is Extruction(PriceExtruction), hen is flatFee + XYCSwap.
async function kindOf(hash, b) {
  const o = await vaultRead('orderOf', [hash], b);
  if (!o?.data || o.data.length < 4) return null;
  const op = parseInt(sliceHex(o.data, 0, 1), 16);
  if (op === 21) henFees.set(hash, BigInt(sliceHex(o.data, 2, 6)));
  return OP_NAMES[op] ?? 'program';
}
const crewId = (a) => { for (const [id, c] of Object.entries(crewConfig())) if (sameAddr(c.address, a)) return id; return null; };

// ---- names -----------------------------------------------------------------------------------------------
export function nameOf(a) {
  if (!a) return null;
  const cfg = miniappConfig();
  for (const [k, v] of Object.entries(cfg.names || {})) if (sameAddr(k, a)) return v;
  const id = crewId(a);
  return id ? `${id}.feefifofum.eth` : null;
}

// ---- links a fill to the quote or the routed order behind it --------------------------------------------
// A router.swap tx, decoded: the order's strategy hash, the tokens and amountIn, and the harp Quote in its takerData
// (instructionsArgs, the 8th slice) when there is one. null for any other tx.
function swapCall(txn) {
  if (!sameAddr(txn?.to, addr('router'))) return null;
  try {
    const d = decodeFunctionData({ abi: abi('SwapVM'), data: txn.input });
    const [order, tokenIn, tokenOut, amountIn, ttd] = d.args;
    const strategy = keccak256(encodeAbiParameters(ORDER, [order]));
    let quote = null;
    try {
      const flags = BigInt(ttd.slice(0, 2 + 44));
      const i8 = Number((flags >> 16n >> (8n * 16n)) & 0xffffn);
      [quote] = decodeAbiParameters([QUOTE_TUPLE, { type: 'bytes' }], `0x${ttd.slice(2 + 44 + i8 * 2)}`);
    } catch { /* no Quote: not a harp fill */ }
    return { strategy, tokenIn, tokenOut, amountIn, quote };
  } catch { return null; }
}
// A harp fill carries its Quote in the router.swap takerData: match it to the quote this service signed (through
// the gateway or castle_quote).
function quoteIdOf(txn) {
  const q = swapCall(txn)?.quote;
  if (!q) return null;
  return findQuote((r) => r.strategyHash === q.strategyHash && String(r.validUntil) === String(q.validUntil) && r.priceQ96 === q.priceQ96.toString())?.id ?? null;
}
function intentIdOf(taker, route, amountIn) {
  const e = find((x) => x.type === 'intent.routed' && x.route === route && sameAddr(x.swapper, taker) && String(x.amountIn) === String(amountIn));
  return e?.id ?? null;
}

// ---- log scanning --------------------------------------------------------------------------------------
async function logsFor(address, from, to) {
  if (!address) return [];
  return client.getLogs({ address, fromBlock: from, toBlock: to });
}
const byPos = (a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);

async function scan(from, to) {
  const vault = addr('castle'), router = addr('router'), hook = addr('hook'), pm = addr('poolManager');
  const [vaultLogs, routerLogs] = await Promise.all([logsFor(vault, from, to), logsFor(router, from, to)]);
  // A fill is the router's Swapped with the vault as maker (a ship's Aqua Pushed logs are not fills).
  const swaps = routerLogs.filter((l) => { const d = tryDecode('SwapVM', l); return d?.eventName === 'Swapped' && sameAddr(arg(d, 'maker'), vault); });
  let lastFillBlock = null;
  for (const l of [...vaultLogs, ...swaps].sort(byPos)) {
    const block = Number(l.blockNumber), tx = l.transactionHash;
    const m = { block, tx, t: (await blockTime(l.blockNumber)) * 1000 };
    if (sameAddr(l.address, router)) {
      const d = tryDecode('SwapVM', l);
      const hash = arg(d, 'orderHash');
      const [txn, rc] = await Promise.all([client.getTransaction({ hash: tx }).catch(() => null), client.getTransactionReceipt({ hash: tx }).catch(() => null)]);
      const v4 = sameAddr(arg(d, 'taker'), hook) || !!rc?.logs?.some((x) => sameAddr(x.address, pm));
      const swap = v4 ? rc?.logs?.find((x) => sameAddr(x.address, pm) && tryDecode('PoolManager', x)?.eventName === 'Swap') : null;
      const amountIn = str(arg(d, 'amountIn'));
      emit('fill', {
        route: v4 ? 'v4' : 'aqua', strategy: hash, slot: slotOf.get(hash) ?? null,
        quoteId: v4 ? null : quoteIdOf(txn), intentId: intentIdOf(txn?.from, v4 ? 'v4' : 'aqua', amountIn),
        taker: txn?.from ?? arg(d, 'taker'), takerName: nameOf(txn?.from ?? arg(d, 'taker')),
        tokenIn: symbolOf(arg(d, 'tokenIn')), tokenOut: symbolOf(arg(d, 'tokenOut')), amountIn, amountOut: str(arg(d, 'amountOut')),
        fee: henFees.has(hash) ? { [symbolOf(arg(d, 'tokenIn'))]: ((BigInt(amountIn) * henFees.get(hash)) / 1_000_000_000n).toString() } : null,
        pool: swap ? tryDecode('PoolManager', swap).args.id : null, label: SLOT_NAMES[slotOf.get(hash)] ?? null,
        alloc: await allocAt(hash, block), status: 'success', revert: null,
      }, m);
      if (lastFillBlock !== block) { emit('hoard', { hoard: await hoardAt(block), reason: 'fill' }, m); lastFillBlock = block; }
      continue;
    }
    const d = tryDecode('CastleVault', l);
    switch (d?.eventName) {
      case 'Shipped': {
        const slot = Number(arg(d, 'slot')), hash = arg(d, 'strategyHash');
        slotOf.set(hash, slot);
        forgetHarp();
        emit('strategy.shipped', {
          hash, slot, label: SLOT_NAMES[slot] ?? `slot ${slot}`, kind: await kindOf(hash, block),
          alloc: { WETH: str(arg(d, 'weth')), USDC: str(arg(d, 'usdc')) }, cap: slotCaps.get(slot) ?? null, shippedBy: 'fi',
        }, m);
        break;
      }
      case 'Docked': {
        const by = crewId(arg(d, 'by')) ?? 'owner';
        forgetHarp();
        emit('strategy.docked', { hash: arg(d, 'strategyHash'), slot: slotOf.get(arg(d, 'strategyHash')) ?? null, by, reason: by === 'fum' ? 'risk: fills pushed committed past balance x leverage' : by === 'fi' ? 're-centre' : null }, m);
        break;
      }
      case 'CapSet': {
        const slot = Number(arg(d, 'slot'));
        const cap = { WETH: str(arg(d, 'wethCap')), USDC: str(arg(d, 'usdcCap')) };
        slotCaps.set(slot, cap);
        const hash = await vaultRead('strategyIn', [slot], block);
        emit('cap.set', { hash: hash && !/^0x0+$/.test(hash) ? hash : null, slot, label: SLOT_NAMES[slot] ?? `slot ${slot}`, cap, by: 'fum' }, m);
        break;
      }
      case 'LeverageSet': {
        const sym = symbolOf(arg(d, 'token'));
        leverage[sym] = Number(arg(d, 'bps'));
        // fum sets it; the constructor's 1x comes from the deploy tx.
        const from = (await client.getTransaction({ hash: l.transactionHash }).catch(() => null))?.from;
        emit('leverage.set', { token: sym, bps: Number(arg(d, 'bps')), by: crewId(from) ?? 'deploy' }, m);
        break;
      }
      default: break;
    }
  }
  // Deposits and withdrawals: any other change in the vault's balances by the end of the range.
  const now = await hoardAt(to);
  const prev = view().hoard || {};
  if ((now.USDC ?? null) !== (prev.USDC ?? null) || (now.WETH ?? null) !== (prev.WETH ?? null)) {
    const up = BigInt(now.USDC ?? 0) > BigInt(prev.USDC ?? 0) || BigInt(now.WETH ?? 0) > BigInt(prev.WETH ?? 0);
    emit('hoard', { hoard: now, reason: up ? 'deposit' : 'withdraw' }, { block: Number(to), tx: null, t: (await blockTime(to)) * 1000 });
  }
}

// ---- reverted txs (they emit no logs) --------------------------------------------------------------------
// fi's reverted ship, as fi reports it: checked against the chain, then told with the vault's own numbers.
export async function refusedShip(txHash) {
  const rc = await client.getTransactionReceipt({ hash: txHash });
  const txn = await client.getTransaction({ hash: txHash });
  if (rc.status !== 'reverted') throw Object.assign(new Error(`${txHash} did not revert`), { status: 400 });
  if (!sameAddr(txn.to, addr('castle'))) throw Object.assign(new Error(`${txHash} is not a vault call`), { status: 400 });
  const d = decodeFunctionData({ abi: abi('CastleVault'), data: txn.input });
  if (d.functionName !== 'ship') throw Object.assign(new Error(`${txHash} is ${d.functionName}, not ship`), { status: 400 });
  if (find((e) => e.type === 'allocation.refused' && e.tx === txHash)) return null;
  const [slot, , weth, usdc] = d.args;
  const b = rc.blockNumber - 1n;
  const [err, committed, balance, levU, levW] = await Promise.all([revertError(txHash), committedAt(b), hoardAt(b), vaultRead('leverageOf', [addr('usdc')], b), vaultRead('leverageOf', [addr('weth')], b)]);
  const lev = { USDC: BigInt(levU ?? 10_000), WETH: BigInt(levW ?? 10_000) };
  const limit = Object.fromEntries(Object.entries(balance).map(([k, v]) => [k, ((BigInt(v) * lev[k]) / 10_000n).toString()]));
  let errorArgs = null;
  if (err?.name === 'OverAllocated') errorArgs = { token: symbolOf(err.args[0]), committedAfter: str(err.args[1]), limit: str(err.args[2]) };
  else if (err?.name === 'OverCap') errorArgs = { slot: Number(err.args[0]), token: symbolOf(err.args[1]), amount: str(err.args[2]), cap: str(err.args[3]) };
  return emit('allocation.refused', {
    slot: Number(slot), label: SLOT_NAMES[Number(slot)] ?? `slot ${slot}`, hash: null,
    asked: { WETH: str(weth), USDC: str(usdc) }, committed, balance, limit,
    error: err?.name ?? err?.raw ?? 'reverted', errorArgs, by: crewId(txn.from) ?? 'fi', status: 'reverted',
  }, { block: Number(rc.blockNumber), tx: txHash, t: (await blockTime(rc.blockNumber)) * 1000, src: 'service' });
}
// A reverted fill relayed through castle_fill {tx_hash}.
export async function refusedFill(txHash, { quoteId = null } = {}) {
  const rc = await client.getTransactionReceipt({ hash: txHash });
  if (rc.status !== 'reverted') return null;
  if (find((e) => e.type === 'fill' && e.tx === txHash)) return null;
  const txn = await client.getTransaction({ hash: txHash });
  const { reason } = await revertReason(txHash);
  const route = sameAddr(txn.to, addr('router')) ? 'aqua' : 'v4';
  const c = swapCall(txn);
  const slot = c ? slotOf.get(c.strategy) ?? null : null;
  return emit('fill', {
    route, strategy: c?.strategy ?? null, slot, label: slot != null ? SLOT_NAMES[slot] ?? null : null, quoteId: quoteId ?? quoteIdOf(txn), intentId: null,
    taker: txn.from, takerName: nameOf(txn.from), tokenIn: symbolOf(c?.tokenIn), tokenOut: symbolOf(c?.tokenOut), amountIn: str(c?.amountIn),
    amountOut: null, fee: null, pool: null, alloc: null, status: 'reverted', revert: reason,
  }, { block: Number(rc.blockNumber), tx: txHash, t: (await blockTime(rc.blockNumber)) * 1000, src: 'service' });
}

// ---- agents (handoff.lol agent_heartbeat and the crew's signed beats) ----------------------------------
const ROLES = { fee: 'prices', fi: 'compiles and signs', fo: 'routes', fum: 'guards' };
export const beats = new Map();   // agent -> the t (unix ms) of its last signed beat (report.mjs)
async function pollAgents() {
  const crew = crewConfig();
  for (const id of ['fee', 'fi', 'fo', 'fum']) {
    let rec = null;
    try { const r = await fetch(`${env.handoffApi}/agents/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10_000) }); if (r.ok) { const j = await r.json(); rec = j.agent || j; } } catch { /* broker down: keep last */ }
    const prev = view().agents.get(id);
    const seen = [rec?.last_seen ? Date.parse(rec.last_seen) : null, beats.get(id), prev?.lastBeat].filter(Number.isFinite);
    const lastBeat = seen.length ? Math.max(...seen) : null;
    const alive = lastBeat != null && Date.now() - lastBeat < STALE_MS;
    if (!prev || prev.alive !== alive) emit('agent', { id, role: ROLES[id], alive, lastBeat, addr: crew[id]?.address ?? null, ens: `${id}.feefifofum.eth`, note: null }, { src: 'agent' });
  }
}

// ---- the loop ------------------------------------------------------------------------------------------
export let lastError = null;
export let lastScan = null;

async function tick() {
  const vault = addr('castle');
  if (!vault) { lastScan = { block: null, at: Date.now(), note: 'no CastleVault in the deployments file yet' }; return; }
  if (vaultKey !== vault.toLowerCase()) {
    vaultKey = vault.toLowerCase();
    open(vaultKey, { vault });
    cursor = cursorMeta().next != null ? BigInt(cursorMeta().next) : null;
    // A restart resumes from the saved cursor: rebuild what the indexer keeps beside the stream from its events.
    slotOf.clear(); slotCaps.clear(); henFees.clear();
    for (const k of Object.keys(leverage)) delete leverage[k];
    for (const e of since(0)) {
      if (e.type === 'strategy.shipped' && e.slot != null) slotOf.set(e.hash, e.slot);
      if (e.type === 'cap.set' && e.slot != null) slotCaps.set(e.slot, e.cap);
      if (e.type === 'leverage.set') leverage[e.token] = e.bps;
    }
    for (const x of view().strategies.values()) if (!x.docked && x.kind) await kindOf(x.hash).catch(() => null);
  }
  const h = await head();
  if (cursor == null) cursor = deployBlock('castle') ?? (h.number > 5000n ? h.number - 5000n : 0n);
  while (cursor <= h.number) {
    const to = cursor + CHUNK - 1n < h.number ? cursor + CHUNK - 1n : h.number;
    await scan(cursor, to);
    cursor = to + 1n;
    saveMeta({ next: cursor.toString() });
  }
  lastScan = { block: Number(h.number), at: Date.now() };
}

let running = false;
export function start() {
  if (running) return;
  running = true;
  const loop = async () => {
    try { await tick(); lastError = null; } catch (e) { lastError = String(e?.shortMessage || e?.message || e); }
    setTimeout(loop, env.pollMs);
  };
  const agentLoop = async () => {
    try { await pollAgents(); } catch { /* next round */ }
    setTimeout(agentLoop, 20_000);
  };
  loop();
  agentLoop();
}

// ---- reads for the routes ------------------------------------------------------------------------------
export function config() {
  const book = addressBook();
  return {
    chainId: env.chainId, explorer: 'https://sepolia.etherscan.io',
    name: 'castle.feefifofum.eth', quoteName: process.env.CASTLE_QUOTE_NAME || 'quote.feefifofum.eth',
    gateway: `${env.publicUrl || ''}/ccip/{sender}/{data}.json`,
    castle: book.castle, aqua: book.aqua, router: book.router, priceExtruction: book.priceExtruction, resolver: book.quoteResolver,
    hook: book.hook, poolManager: book.poolManager, poolSwapTest: book.poolSwapTest, poolId: value('poolId'),
    usdc: book.usdc, weth: book.weth, decimals: DECIMALS, slots: SLOT_NAMES, leverage,
  };
}
export const snapshot = () => {
  const body = snapshotBody({ config: config(), block: lastScan?.block ?? null });
  return { ...body, leverage: { ...leverage }, caps: Object.fromEntries([...slotCaps.entries()].map(([k, v]) => [String(k), v])) };
};
export const health = () => ({ lastScan, lastError, cursor: cursor != null ? Number(cursor) : null, vault: vaultKey });
export const liveStrategies = () => [...view().strategies.values()].filter((x) => !x.docked);
