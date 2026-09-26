// The castle, as one ordered stream of events (miniapp/STREAM.md, v1). The indexer polls Sepolia for Castle,
// Aqua (maker = Castle) and CCA logs, derives lease.expired from block time, folds relayed fill attempts in
// (reverted txs emit no logs, so only this service can report a FeeFiFoFum() revert), and polls handoff.lol
// for the agents' agent_heartbeat liveness. Every event goes through one reducer that keeps the snapshot.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { env, addr, addressBook, deployBlock, miniappConfig, crewConfig, dataFile } from './config.mjs';
import { client, head, blockTime, readLease, inventory, auctionView, priceView, fenceDecision, leaseState, tryDecode, sameAddr } from './chain.mjs';
import { keccak256, toHex, getAddress } from 'viem';

const CHUNK = 2000n;          // eth_getLogs block span per request (public Sepolia RPCs cap the range)
const RING = 5000;            // events kept in memory for Last-Event-ID resume
const STALE_BEATS = 2;        // an agent is dead after this many renew periods without agent_heartbeat

export const bus = new EventEmitter();
bus.setMaxListeners(0);

const events = [];
let seq = 0;
let cursor = null;            // next block to scan
let lastExpiredEpoch = null;  // lease.expired is emitted once per epoch
const auctions = new Set();   // CCAs Castle opened (plus AUCTION env / tool-reported ones)
const clearedAuctions = new Set();
const leaseTimeline = [];     // [{block, epoch, expiry}] from Castle events, for replaying fills at their block
const strategies = new Map(); // hash -> strategy row
const agents = new Map();     // id -> {id, role, addr, ens, alive, lastBeat}
const strategyBytes = new Map(); // hash -> the full strategy bytes Aqua logged at ship (the encoded Order)

const state = {
  lease: null, strategies: [], inventory: { weth: null, usdc: null },
  price: null, auction: null, fills: [], crew: [],
};

// ---- persistence for what the chain cannot give back ---------------------------------------------------
function load(name, fallback) { try { return JSON.parse(fs.readFileSync(dataFile(name), 'utf8')); } catch { return fallback; } }
function save(name, v) { fs.writeFileSync(dataFile(name), JSON.stringify(v, null, 2)); }
const relayed = load('fills.json', []);       // fill attempts reported through castle_fill (success or revert)
state.crew = load('crew.json', []);

// ---- the reducer ---------------------------------------------------------------------------------------
function emit(type, data, meta = {}) {
  const ev = { v: 1, seq: ++seq, type, t: meta.t ?? Date.now(), block: meta.block ?? null, tx: meta.tx ?? null, src: meta.src ?? 'chain', ...data };
  events.push(ev);
  if (events.length > RING) events.shift();
  reduce(ev);
  bus.emit('event', ev);
  return ev;
}

function reduce(ev) {
  switch (ev.type) {
    case 'lease.renewed':
    case 'lease.claimed':
      state.lease = { holder: ev.holder, holderAgent: ev.holderAgent, epoch: ev.epoch, expiry: ev.expiry, state: 'LIVE' };
      break;
    case 'lease.expired':
      if (state.lease) state.lease.state = 'WIND-DOWN';
      break;
    case 'strategy.shipped':
      strategies.set(ev.hash, { hash: ev.hash, epoch: ev.epoch, shippedBy: ev.shippedBy, center: ev.center, docked: false });
      state.strategies = [...strategies.values()];
      break;
    case 'strategy.docked':
      if (strategies.has(ev.hash)) strategies.get(ev.hash).docked = true;
      state.strategies = [...strategies.values()];
      break;
    case 'price.written':
      state.price = { ...ev.price, block: ev.block, tx: ev.tx };
      break;
    case 'auction.opened':
      state.auction = { auction: ev.auction, kind: ev.kind, status: 'open', floor: ev.floor, clearing: null, endBlock: ev.endBlock };
      break;
    case 'auction.checkpoint':
      if (state.auction?.auction === ev.auction) state.auction.clearing = ev.clearing;
      break;
    case 'auction.cleared':
      if (state.auction?.auction === ev.auction) Object.assign(state.auction, { status: 'cleared', clearing: ev.clearing });
      break;
    case 'fill': {
      state.fills.push(ev);
      if (state.fills.length > 50) state.fills.shift();
      break;
    }
    case 'agent': {
      const a = agents.get(ev.id);
      if (a) Object.assign(a, { alive: ev.alive, lastBeat: ev.lastBeat });
      break;
    }
    default: break;
  }
}

// ---- names ---------------------------------------------------------------------------------------------
function agentByAddr(a) {
  if (!a) return null;
  for (const x of agents.values()) if (sameAddr(x.addr, a)) return x.id;
  for (const c of state.crew) if (sameAddr(c.addr, a)) return c.agent_id;
  return null;
}
const ensFor = (id) => agents.get(id)?.ens || state.crew.find((c) => c.agent_id === id)?.ens || null;

// DNS wire format -> dotted name (Castle's Relinked carries the holder's DNS-encoded name).
function dnsDecode(hex) {
  if (!hex || hex === '0x') return null;
  const b = Buffer.from(hex.slice(2), 'hex');
  const out = [];
  for (let i = 0; i < b.length && b[i] !== 0; i += b[i] + 1) out.push(b.subarray(i + 1, i + 1 + b[i]).toString('utf8'));
  return out.join('.') || null;
}
async function mcpOf(name) {
  const ur = addr('universalResolver');
  if (!ur) return null;
  try { return await client.getEnsText({ name, key: 'agent-endpoint[mcp]', universalResolverAddress: ur }); } catch { return null; }
}

function leaseAt(block) {
  let cur = null;
  for (const l of leaseTimeline) { if (l.block <= block) cur = l; else break; }
  return cur;
}

// ---- log scanning --------------------------------------------------------------------------------------
async function logsFor(address, from, to) {
  if (!address) return [];
  return client.getLogs({ address, fromBlock: from, toBlock: to });
}

const evName = (d) => d?.eventName || '';
const arg = (d, ...names) => { for (const n of names) if (d?.args?.[n] !== undefined) return d.args[n]; return undefined; };
const str = (v) => (v == null ? null : v.toString());

async function scan(from, to) {
  const castle = addr('castle');
  const aqua = addr('aqua');
  const [castleLogs, aquaLogs, ...ccaLogs] = await Promise.all([
    logsFor(castle, from, to), logsFor(aqua, from, to), ...[...auctions].map((a) => logsFor(a, from, to)),
  ]);
  const all = [...castleLogs, ...aquaLogs, ...ccaLogs.flat()]
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));

  // Group Aqua pull/push per tx: one router.swap is one fill.
  const fillTx = new Map();
  for (const log of all) {
    const block = Number(log.blockNumber);
    const t = (await blockTime(log.blockNumber)) * 1000;
    const meta = { block, tx: log.transactionHash, t };
    if (castle && sameAddr(log.address, castle)) {
      const d = tryDecode('Castle', log);
      const n = evName(d);
      if (/Renewed$/.test(n)) {
        const epoch = str(arg(d, 'epoch')); const expiry = Number(arg(d, 'expiry'));
        leaseTimeline.push({ block, epoch, expiry });
        const holder = arg(d, 'holder');
        emit('lease.renewed', { epoch, holder, holderAgent: agentByAddr(holder), expiry, attestor: 'fo', digest: str(arg(d, 'attestationDigest', 'digest')) }, meta);
      } else if (/Claimed$/.test(n)) {
        const epoch = str(arg(d, 'epoch')); const expiry = Number(arg(d, 'expiry'));
        const prevEpoch = str(arg(d, 'previousEpoch', 'prevEpoch'));
        const prev = leaseTimeline.at(-1);
        leaseTimeline.push({ block, epoch, expiry });
        const holder = arg(d, 'holder');
        emit('lease.claimed', { epoch, prevEpoch, holder, holderAgent: agentByAddr(holder), expiry, gapSeconds: prev ? t / 1000 - prev.expiry : null }, meta);
        const cfg = miniappConfig();
        const shift = (cfg.shifts || []).find((s) => s.agent === agentByAddr(holder));
        emit('shift.changed', { from: prev ? agentByAddr(state.lease?.holder) : null, to: agentByAddr(holder), city: shift?.city ?? null, auction: null }, { ...meta, src: 'service' });
      } else if (/Relinked$/.test(n)) {
        const holderName = dnsDecode(arg(d, 'holderName'));
        emit('castle.relinked', { node: arg(d, 'node'), holderNode: arg(d, 'holderNode'), holderName, mcpEndpoint: holderName ? await mcpOf(holderName) : null }, meta);
      } else if (n === 'Docked') {
        emit('strategy.docked', { hash: arg(d, 'strategyHash'), epoch: str(arg(d, 'epoch')), dockedBy: agentByAddr(arg(d, 'dockedBy')) }, meta);
      } else if (n === 'Shipped') {
        const hash = arg(d, 'strategyHash');
        emit('strategy.shipped', {
          hash, epoch: str(arg(d, 'epoch')), shippedBy: agentByAddr((await client.getTransaction({ hash: log.transactionHash })).from),
          center: (arg(d, 'anchorQ96', 'centerQ96') ?? 0n) > 0n ? priceView(arg(d, 'anchorQ96', 'centerQ96')) : null, weth: str(arg(d, 'weth')), usdc: str(arg(d, 'usdc')),
        }, meta);
      } else if (/AuctionOpened$/.test(n)) {
        const auction = getAddress(arg(d, 'auction'));
        auctions.add(auction);
        emit('auction.opened', {
          auction, kind: Number(arg(d, 'kind')) === 1 ? 'dissolution' : 'shift-change', amount: str(arg(d, 'amount')),
          floor: arg(d, 'floorQ96') != null ? priceView(arg(d, 'floorQ96')) : null,
          startBlock: Number(arg(d, 'startBlock') ?? 0), endBlock: Number(arg(d, 'endBlock') ?? 0), hook: addr('jackHook'),
        }, meta);
      } else if (/PriceWritten$/.test(n)) {
        const q = arg(d, 'priceQ96');
        emit('price.written', { key: 'handoff-price', value: toHex(q ?? 0n, { size: 32 }), price: priceView(q) }, meta);
      } else if (/Dissolved$/.test(n)) {
        emit('castle.dissolved', { caller: arg(d, 'caller'), auction: arg(d, 'auction') ?? null }, meta);
      }
      continue;
    }
    if (aqua && sameAddr(log.address, aqua)) {
      const d = tryDecode('Aqua', log);
      if (!d || !sameAddr(arg(d, 'maker'), castle)) continue;
      const n = evName(d);
      if (n === 'Shipped') {
        strategyBytes.set(arg(d, 'strategyHash'), arg(d, 'strategy'));
        // Castle's own Shipped carries the epoch; if Castle's ABI has none, emit from Aqua with the epoch at ship time.
        if (!castleLogs.some((l) => l.transactionHash === log.transactionHash && evName(tryDecode('Castle', l)) === 'Shipped')) {
          const hash = arg(d, 'strategyHash');
          emit('strategy.shipped', { hash, epoch: leaseAt(block)?.epoch ?? null, shippedBy: agentByAddr((await client.getTransaction({ hash: log.transactionHash })).from), center: null, weth: null, usdc: null }, meta);
        }
      } else if (n === 'Docked') {
        if (castleLogs.some((l) => l.transactionHash === log.transactionHash && evName(tryDecode('Castle', l)) === 'Docked')) continue;
        emit('strategy.docked', { hash: arg(d, 'strategyHash'), epoch: strategies.get(arg(d, 'strategyHash'))?.epoch ?? null, dockedBy: agentByAddr((await client.getTransaction({ hash: log.transactionHash })).from) }, meta);
      } else if (n === 'Pulled' || n === 'Pushed') {
        const f = fillTx.get(log.transactionHash) || { meta, legs: [] };
        f.legs.push({ kind: n, token: arg(d, 'token'), amount: arg(d, 'amount'), hash: arg(d, 'strategyHash') });
        fillTx.set(log.transactionHash, f);
      }
      continue;
    }
    // A CCA Castle opened.
    const d = tryDecode('CCA', log);
    const n = evName(d);
    const auction = getAddress(log.address);
    if (n === 'BidSubmitted') {
      const owner = arg(d, 'owner');
      emit('auction.bid', { auction, bidId: str(arg(d, 'id')), owner, ownerName: ensFor(agentByAddr(owner)), maxPrice: priceView(arg(d, 'priceQ96')), amount: str(arg(d, 'amount')) }, meta);
    } else if (n === 'CheckpointUpdated' || n === 'ClearingPriceUpdated') {
      emit('auction.checkpoint', { auction, clearing: priceView(arg(d, 'clearingPriceQ96')), sold: null, raised: null }, meta);
    } else if (/Swept/.test(n)) {
      emit('auction.swept', { auction, currency: 'USDC', amount: str(arg(d, 'amount', 'currencyAmount')) }, meta);
    }
  }

  // One fill per swap tx.
  const usdc = addr('usdc'); const weth = addr('weth');
  const sym = (tk) => (sameAddr(tk, usdc) ? 'USDC' : sameAddr(tk, weth) ? 'WETH' : tk);
  for (const [txHash, f] of fillTx) {
    const pulled = f.legs.find((l) => l.kind === 'Pulled'); const pushed = f.legs.find((l) => l.kind === 'Pushed');
    const tx = await client.getTransaction({ hash: txHash });
    const lease = leaseAt(f.meta.block);
    const programEpoch = strategies.get((pulled || pushed)?.hash)?.epoch ?? null;
    emitFill({
      id: `${txHash}:0`, taker: tx.from, takerName: ensFor(agentByAddr(tx.from)),
      tokenIn: pushed ? sym(pushed.token) : null, tokenOut: pulled ? sym(pulled.token) : null,
      amountIn: str(pushed?.amount), amountOut: str(pulled?.amount), strategy: (pulled || pushed)?.hash ?? null,
      programEpoch, leaseEpoch: lease?.epoch ?? null, expiry: lease?.expiry ?? null,
      decision: fenceDecision(programEpoch, lease?.epoch, lease?.expiry, f.meta.t / 1000), status: 'success', revert: null,
    }, f.meta);
  }
}

const seenFills = new Set();
function emitFill(fill, meta) {
  if (seenFills.has(fill.id)) return;
  seenFills.add(fill.id);
  emit('fill', fill, meta);
}

// A fill attempt reported through castle_fill. Successful ones also arrive via Aqua logs; reverted ones only here.
export async function recordRelayedFill(entry) {
  if (relayed.some((r) => r.id === entry.id)) return relayed.find((r) => r.id === entry.id);
  relayed.push(entry);
  save('fills.json', relayed);
  if (entry.status === 'reverted') {
    emitFill(entry, { block: entry.block, tx: entry.tx, t: entry.t, src: 'service' });
  }
  return entry;
}
export const relayedFills = () => relayed;

// ---- crew ----------------------------------------------------------------------------------------------
export function joinCrew(row) {
  const i = state.crew.findIndex((c) => c.agent_id === row.agent_id);
  if (i >= 0) state.crew[i] = { ...state.crew[i], ...row }; else state.crew.push(row);
  save('crew.json', state.crew);
  return row;
}
export const crew = () => state.crew;
export function watchAuction(a) { auctions.add(getAddress(a)); }

// ---- agents (handoff.lol agent_heartbeat) --------------------------------------------------------------
function agentList() {
  const cfg = miniappConfig();
  const roles = { fee: 'shift trader', fi: 'hot standby', fo: 'fencer and witness', fum: 'auctioneer', castle: 'castle service' };
  const crewCfg = crewConfig();
  const rows = cfg.agents?.length ? cfg.agents : (Object.keys(crewCfg).length ? Object.keys(crewCfg) : ['fee', 'fi', 'fo', 'fum']).map((id) => ({ id }));
  return rows.map((r) => ({ id: r.id, role: r.role || crewCfg[r.id]?.role || roles[r.id] || null, addr: r.addr || crewCfg[r.id]?.address || null, ens: r.ens || `${r.id}.feefifofum.eth`, handoffId: r.handoffId || r.id }));
}
async function pollAgents(renewEvery) {
  for (const a of agentList()) {
    let rec = null;
    try { const r = await fetch(`${env.handoffApi}/agents/${encodeURIComponent(a.handoffId)}`); if (r.ok) { const j = await r.json(); rec = j.agent || j; } } catch { /* broker down: keep last */ }
    const prev = agents.get(a.id);
    const lastBeat = rec?.last_seen ? Date.parse(rec.last_seen) : prev?.lastBeat ?? null;
    const alive = lastBeat != null && Date.now() - lastBeat < STALE_BEATS * renewEvery * 1000 + 30_000;
    const row = { ...a, addr: a.addr || rec?.wallet_address || prev?.addr || null, ens: rec?.ens_name && /feefifofum/.test(rec.ens_name) ? rec.ens_name : a.ens, alive, lastBeat };
    agents.set(a.id, { ...(prev || {}), ...row });
    if (!prev || prev.alive !== alive) emit('agent', { id: a.id, role: row.role, alive, lastBeat, addr: row.addr, ens: row.ens }, { src: 'agent' });
  }
}

// ---- the loop ------------------------------------------------------------------------------------------
let running = false;
export let lastError = null;
export let lastScan = null;

async function tick() {
  const h = await head();
  if (cursor == null) cursor = deployBlock('castle') ?? (h.number > 5000n ? h.number - 5000n : 0n);
  const extraAuction = process.env.CASTLE_AUCTION;
  if (extraAuction) watchAuction(extraAuction);
  while (cursor <= h.number) {
    const to = cursor + CHUNK - 1n < h.number ? cursor + CHUNK - 1n : h.number;
    await scan(cursor, to);
    cursor = to + 1n;
  }
  const lease = await readLease();
  if (lease?.epoch != null) {
    const holderAgent = agentByAddr(lease.holder);
    state.lease = { holder: lease.holder, holderAgent, epoch: lease.epoch, expiry: lease.expiry, state: leaseState(lease, h.timestamp) };
    if (!leaseTimeline.length) leaseTimeline.push({ block: Number(deployBlock('castle') ?? 0n), epoch: lease.epoch, expiry: lease.expiry });
    if (h.timestamp > lease.expiry && lastExpiredEpoch !== lease.epoch) {
      lastExpiredEpoch = lease.epoch;
      emit('lease.expired', { epoch: lease.epoch, expiry: lease.expiry }, { block: Number(h.number), tx: null, t: h.timestamp * 1000, src: 'derived' });
    }
  }
  state.inventory = await inventory();
  for (const a of auctions) {
    const v = await auctionView(a);
    if (state.auction?.auction === a) Object.assign(state.auction, { status: v.status, clearing: v.clearing ?? state.auction.clearing, endBlock: v.endBlock });
    if (v.status === 'ended' && !clearedAuctions.has(a)) {
      clearedAuctions.add(a);
      emit('auction.cleared', { auction: a, clearing: v.clearing, sold: null, raised: null }, { block: v.endBlock, tx: null, src: 'derived' });
    }
  }
  lastScan = { block: Number(h.number), at: Date.now() };
}

export function start() {
  if (running) return;
  running = true;
  const cfg = () => miniappConfig();
  const loop = async () => {
    try { await tick(); lastError = null; } catch (e) { lastError = String(e?.shortMessage || e?.message || e); }
    setTimeout(loop, env.pollMs);
  };
  const agentLoop = async () => {
    try { await pollAgents(cfg().renewEverySeconds || 40); } catch { /* next round */ }
    setTimeout(agentLoop, 20_000);
  };
  loop();
  agentLoop();
}

// ---- reads for the routes ------------------------------------------------------------------------------
export function snapshot() {
  const cfg = miniappConfig();
  const book = addressBook();
  const name = cfg.name || 'castle.feefifofum.eth';
  return {
    v: 1, seq, type: 'snapshot', t: Date.now(), block: lastScan?.block ?? null, tx: null, src: 'service',
    config: {
      chainId: 11155111, explorer: 'https://sepolia.etherscan.io', name, labelhash: keccak256(toHex(name.split('.')[0])),
      ...book, leaseSeconds: cfg.leaseSeconds ?? 120, renewEverySeconds: cfg.renewEverySeconds ?? 40, graceSeconds: cfg.graceSeconds ?? 0,
    },
    shifts: cfg.shifts || [],
    agents: [...agents.values()].map(({ id, role, addr: a, ens, alive, lastBeat }) => ({ id, role, addr: a, ens, alive, lastBeat })),
    lease: state.lease, strategies: state.strategies, inventory: state.inventory, price: state.price, auction: state.auction,
    fills: state.fills,
  };
}
export const since = (n) => events.filter((e) => e.seq > n);
export function fillsFrom(fromBlock) {
  const chainFills = events.filter((e) => e.type === 'fill' && (e.block ?? 0) >= fromBlock);
  const reverted = relayed.filter((r) => r.status === 'reverted' && (r.block ?? 0) >= fromBlock && !chainFills.some((c) => c.id === r.id));
  return [...chainFills, ...reverted].sort((a, b) => (a.block ?? 0) - (b.block ?? 0));
}
export const health = () => ({ lastScan, lastError, cursor: cursor != null ? Number(cursor) : null, events: seq, auctions: [...auctions] });
export const liveStrategies = () => state.strategies.filter((x) => !x.docked).map((x) => ({ ...x, strategy: strategyBytes.get(x.hash) ?? null }));
export const currentLease = () => state.lease;
