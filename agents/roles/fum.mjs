// fum, inventory and risk (docs/SPEC.md "The crew").
//
// fum bounds what fi's key can give away. On start it sets the vault's leverage (FUM_LEVERAGE_BPS, 20000 = promises
// may total 2x the balance) and each slot's cap (FUM_CAP_BPS of the hoard per slot, so harp and hen may each promise
// the whole hoard). After that it keeps the allocation ledger: after every change it reads each token's balance,
// committed, limit (balance x leverage) and headroom, and each live strategy's Aqua allocation. Only when fills have
// pushed committed(token) past limit(token) does it dock, lowest priority first (FUM_DOCK_ORDER: greedy, then harp,
// then hen), one strategy per tick until the Castle is back under. A single promise larger than the balance is not a
// reason to dock: that is shared liquidity. The chain's CapSet, LeverageSet and Docked events carry what fum did to
// the stream (docs/SPEC.md 09caa66).
import { env } from '../lib/env.mjs';
import { ledger, send, tokens, SLOTS } from '../lib/vault.mjs';

const LEVERAGE = Number(env('FUM_LEVERAGE_BPS', 20_000));
const CAP_BPS = BigInt(env('FUM_CAP_BPS', 10_000));
const GREEDY_CAP = env('FUM_GREEDY_CAP', 'hoard');   // greedy's cap: the hoard, so its ship fails on leverage (OverAllocated), not the cap
const DOCK_ORDER = env('FUM_DOCK_ORDER', 'greedy,harp,hen').split(',').map((s) => s.trim());
const fmt = (x) => (typeof x === 'bigint' ? x.toString() : x);

let configured = false;
let lastKey = null;

// Sends what differs from the vault's settings; true once nothing is left to send (a deferred or failed write is
// sent again on a later tick).
async function configure(ctx, l) {
  const t = tokens();
  let done = true;
  for (const [sym, a] of Object.entries(t)) {
    if (l.tokens[sym].leverageBps !== LEVERAGE) done = (await send(ctx, 'setLeverage', [a, LEVERAGE])).ok && done;
  }
  for (const [name, slot] of Object.entries(SLOTS)) {
    const base = name === 'greedy' && GREEDY_CAP === 'hoard' ? 10_000n : CAP_BPS;
    const want = { WETH: (l.tokens.WETH.balance * base) / 10_000n, USDC: (l.tokens.USDC.balance * base) / 10_000n };
    const have = l.slots[slot].cap;
    if (want.WETH === 0n && want.USDC === 0n) continue;
    if (have.WETH !== want.WETH || have.USDC !== want.USDC) {
      ctx.log('cap', { strategy: name, slot, weth: want.WETH, usdc: want.USDC, leverageBps: LEVERAGE });
      done = (await send(ctx, 'setCap', [slot, want.WETH, want.USDC])).ok && done;
    }
  }
  return done;
}

// Have fills pushed what is promised past the leverage limit (limit = balance x leverage)? The first token over and
// the live strategy to dock for it, lowest priority first; null when the Castle is inside its limits. A promise larger
// than the balance is not over: only the total against balance x leverage counts.
export function overLimit(l, order = DOCK_ORDER) {
  const live = l.slots.filter((s) => s.hash);
  if (!live.length) return null;
  for (const token of ['WETH', 'USDC']) {
    const tk = l.tokens[token];
    const limit = (tk.balance * BigInt(tk.leverageBps)) / 10_000n;
    if (tk.committed <= limit) continue;
    const victim = [...live].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))[0];
    return { token, committed: tk.committed, limit, victim };
  }
  return null;
}

export default {
  intervalMs: 4_000,
  async tick(ctx) {
    let l = await ledger(ctx);
    if (!configured) {
      if (l.tokens.WETH.balance === 0n && l.tokens.USDC.balance === 0n) return ctx.logChange('wait', 'waiting', { for: 'the hoard to be funded' });
      configured = await configure(ctx, l);
      if (!configured) return;
      l = await ledger(ctx);
    }
    const live = l.slots.filter((s) => s.hash);
    const view = {
      tokens: Object.fromEntries(Object.entries(l.tokens).map(([k, v]) => [k, { balance: fmt(v.balance), committed: fmt(v.committed), headroom: fmt(v.headroom), leverageBps: v.leverageBps }])),
      strategies: live.map((s) => ({ strategy: s.name, slot: s.slot, alloc: { WETH: fmt(s.alloc.WETH), USDC: fmt(s.alloc.USDC) } })),
    };
    const key = JSON.stringify(view);
    if (key === lastKey) return;
    lastKey = key;
    ctx.log('ledger', view);

    const over = overLimit(l);
    if (!over) return;
    const { token, committed, limit, victim } = over;
    ctx.log('over-limit', { token, committed, limit, balance: l.tokens[token].balance, leverageBps: l.tokens[token].leverageBps, dock: victim.name });
    const r = await send(ctx, 'dock', [victim.hash]);
    if (r.ok) ctx.log('docked', { strategy: victim.name, slot: victim.slot, hash: victim.hash, tx: r.hash, reason: `${token} committed ${committed} > limit ${limit}` });
    lastKey = null;
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
