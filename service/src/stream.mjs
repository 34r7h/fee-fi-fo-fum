// The castle stream v2 (miniapp/STREAM.md): one ordered log of events, one reducer, one snapshot. Chain events come
// from the indexer, quote.served from the gateway, and price, intent.routed and refusals caught in simulation from
// the agents' signed reports. Every event is appended to data/events-<castle>.jsonl, so a restart keeps its seq
// numbers (Last-Event-ID resumes across restarts) and the off-chain events, which the chain cannot give back.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { dataFile } from './config.mjs';

const RING = 5000;
const KEEP = { quotes: 20, fills: 50, refusals: 10, intents: 20 };

export const bus = new EventEmitter();
bus.setMaxListeners(0);

let events = [];
let seq = 0;
let file = null;
let meta = {};
let state = fresh();

function fresh() {
  return { hoard: {}, hoardBlock: null, price: null, strategies: new Map(), quotes: [], fills: [], refusals: [], intents: [], agents: new Map() };
}
const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
const push = (arr, v, n) => { arr.push(v); if (arr.length > n) arr.shift(); };

function reduce(ev) {
  const s = state;
  switch (ev.type) {
    case 'hoard':
      s.hoard = ev.hoard; s.hoardBlock = ev.block;
      break;
    case 'price':
      s.price = { mid: ev.mid, spreadBps: ev.spreadBps, hookFeeBps: ev.hookFeeBps ?? null, by: ev.by, block: ev.block, tx: ev.tx, t: ev.t, source: ev.source ?? null, henMid: ev.henMid ?? null, driftBps: ev.driftBps ?? null, recentre: ev.recentre ?? null };
      break;
    case 'strategy.shipped':
      s.strategies.set(ev.hash, {
        slot: ev.slot ?? null, hash: ev.hash, label: ev.label ?? null, kind: ev.kind ?? null, shippedBy: ev.shippedBy ?? null,
        alloc: ev.alloc ?? {}, cap: ev.cap ?? null, docked: false, fills: 0, block: ev.block, tx: ev.tx,
      });
      break;
    case 'strategy.docked': {
      const x = s.strategies.get(ev.hash);
      if (x) Object.assign(x, { docked: true, dockedBy: ev.by ?? null, alloc: {} });
      break;
    }
    case 'cap.set': {
      const x = ev.hash && s.strategies.get(ev.hash);
      if (x) x.cap = ev.cap;
      break;
    }
    case 'allocation.refused':
      push(s.refusals, ev, KEEP.refusals);
      break;
    case 'quote.served':
      push(s.quotes, ev, KEEP.quotes);
      break;
    case 'fill': {
      push(s.fills, ev, KEEP.fills);
      const x = ev.strategy && s.strategies.get(ev.strategy);
      if (x && ev.status === 'success') { x.fills += 1; if (ev.alloc) x.alloc = ev.alloc; }
      break;
    }
    case 'intent.routed':
      push(s.intents, ev, KEEP.intents);
      break;
    case 'agent':
      s.agents.set(ev.id, { ...(s.agents.get(ev.id) || {}), id: ev.id, role: ev.role ?? s.agents.get(ev.id)?.role ?? null, alive: ev.alive, lastBeat: ev.lastBeat ?? null, addr: ev.addr ?? s.agents.get(ev.id)?.addr ?? null, ens: ev.ens ?? s.agents.get(ev.id)?.ens ?? null, note: ev.note ?? null });
      break;
    default: break;
  }
}

// Opens (or switches to) the log for one castle deployment. A new castle address starts a new stream at seq 0.
export function open(key, extra = {}) {
  const f = dataFile(`events-${String(key || 'none').toLowerCase()}.jsonl`);
  if (f === file) return;
  file = f; events = []; seq = 0; state = fresh(); meta = { key, ...extra };
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.type === '_meta') { meta = { ...meta, ...ev }; continue; }
        seq = Math.max(seq, ev.seq); events.push(ev); if (events.length > RING) events.shift(); reduce(ev);
      } catch { /* a torn last line from a crash: skip it */ }
    }
  }
}
export const cursorMeta = () => meta;
// Persists indexer bookkeeping (the next block to scan) next to the events it produced.
export function saveMeta(fields) {
  meta = { ...meta, ...fields };
  if (file) fs.appendFileSync(file, json({ type: '_meta', ...fields }) + '\n');
}

export function emit(type, data, m = {}) {
  const ev = { v: 2, seq: ++seq, type, t: m.t ?? Date.now(), block: m.block ?? null, tx: m.tx ?? null, src: m.src ?? 'chain', ...data };
  events.push(ev);
  if (events.length > RING) events.shift();
  reduce(ev);
  if (file) fs.appendFileSync(file, json(ev) + '\n');
  bus.emit('event', ev);
  return ev;
}

export const since = (n) => events.filter((e) => e.seq > n);
export const currentSeq = () => seq;
export const find = (pred) => { for (let i = events.length - 1; i >= 0; i--) if (pred(events[i])) return events[i]; return null; };
export const view = () => state;

// strategies: every live one, plus docked ones that still have fills in the fills list.
export function snapshotBody({ config, block }) {
  const s = state;
  const filled = new Set(s.fills.map((f) => f.strategy));
  const strategies = [...s.strategies.values()].filter((x) => !x.docked || filled.has(x.hash));
  return {
    type: 'snapshot', v: 2, seq, t: Date.now(), block: block ?? s.hoardBlock ?? null, config,
    agents: [...s.agents.values()],
    hoard: s.hoard, price: s.price, strategies,
    quotes: s.quotes, fills: s.fills, refusals: s.refusals, intents: s.intents,
  };
}
