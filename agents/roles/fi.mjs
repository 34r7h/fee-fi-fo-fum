// fi, the SwapVM compiler (docs/SPEC.md "The crew" and "The two strategies").
//
// fi compiles harp (Extruction(PriceExtruction): an RFQ priced by fi's signed quotes) and hen (flatFee + XYCSwap: a
// curve over its own Aqua balances), and ships both from the one vault balance into slots 0 and 1. It waits for
// fum's caps first, and sizes each promise at the most its slot's cap, the token's headroom (fum's leverage) and
// FI_PROMISE_BPS of the hoard allow (80%: harp and hen promise 1.6x under fum's 2x); hen's two sides are
// value-balanced at fee's mid, so the curve starts at the price.
// When fee reports that the mid has drifted past its limit from hen's curve (price.recentre = "hen"), fi re-centres:
// dock hen, then ship it again at the new mid. A strategy fum docked for risk stays docked: fi does not overrule fum.
//
// fi's other half, signing every Quote (EIP-712) and every gateway response, runs in the castle service, on the host
// that holds fi's key (docs/SPEC.md: "Its key lives only on the service host").
//
// Demo switch: FI_GREEDY=1 ships `greedy` into slot 2 once both are live, asking for FI_GREEDY_BPS (0.5x) of the
// hoard on top, past the leverage limit. It goes out unsimulated with a manual gas limit (FI_GREEDY_GAS, 90k:
// estimateGas fails on a revert), so the vault's OverAllocated revert is mined; fi then reports the reverted tx.
import { contractAddress } from '../lib/chain.mjs';
import { env } from '../lib/env.mjs';
import { report, serviceState } from '../lib/report.mjs';
import { harp, hen, kindOf } from '../lib/programs.mjs';
import { ledger, send, read, SLOTS, ZERO } from '../lib/vault.mjs';

const HEN_FEE_BPS = Number(env('FI_HEN_FEE_BPS', 30));
const PROMISE_BPS = BigInt(env('FI_PROMISE_BPS', 8_000));
const GREEDY_BPS = BigInt(env('FI_GREEDY_BPS', 5_000));
const GREEDY = env('FI_GREEDY') === '1';
const SHIP = (env('FI_SHIP', 'harp,hen')).split(',').map((s) => s.trim()).filter(Boolean);
const E8 = 10n ** 8n;

const fumDocked = new Set();   // slots someone else (fum, the owner) docked: fi leaves them docked
const shipped = new Map();     // slot -> the hash fi shipped there
const selfDocked = new Set();  // hashes fi docked itself (re-centres)
let greedyDone = false;
let recentring = false;
let lastRecentreAt = 0;

const min = (...xs) => xs.reduce((a, b) => (b < a ? b : a));
const toE8 = (s) => { const [i, f = ''] = String(s).split('.'); return BigInt(i) * E8 + BigInt((f + '00000000').slice(0, 8)); };

// The most a slot may promise: its cap, the token's headroom (leverage minus what is already promised), and
// PROMISE_BPS of the balance.
export function room(l, slot) {
  const s = l.slots[slot];
  const one = (sym) => min(s.cap[sym], l.tokens[sym].headroom, (l.tokens[sym].balance * PROMISE_BPS) / 10_000n);
  return { WETH: one('WETH'), USDC: one('USDC') };
}

// hen's two sides value-balanced at the mid: weth * mid = usdc (raw: usdc = weth * midE8 / 1e20).
export function balanced(r, midE8) {
  let weth = r.WETH;
  let usdc = (weth * midE8) / 10n ** 20n;
  if (usdc > r.USDC) { usdc = r.USDC; weth = (usdc * 10n ** 20n) / midE8; }
  return { WETH: weth, USDC: usdc };
}

async function price(ctx) {
  const s = await serviceState();
  return s?.price?.mid ? s.price : null;
}

async function shipSlot(ctx, name, l, p) {
  const slot = SLOTS[name];
  const r = room(l, slot);
  let amounts = r;
  let program;
  if (name === 'harp') program = harp(contractAddress('priceExtruction'));
  else {
    if (!p) { ctx.logChange(`wait-${name}`, 'waiting', { for: "fee's price", strategy: name }); return null; }
    program = hen(HEN_FEE_BPS);
    amounts = balanced(r, toE8(p.mid));
  }
  if (amounts.WETH === 0n && amounts.USDC === 0n) { ctx.logChange(`wait-${name}`, 'waiting', { for: "fum's caps or headroom", strategy: name, cap: l.slots[slot].cap }); return null; }
  ctx.log('compiled', { strategy: name, slot, kind: kindOf(program), program, bytes: (program.length - 2) / 2, weth: amounts.WETH, usdc: amounts.USDC, ...(name === 'hen' ? { mid: p.mid, feeBps: HEN_FEE_BPS } : {}) });
  const res = await send(ctx, 'ship', [slot, program, amounts.WETH, amounts.USDC]);
  if (res.ok) {
    const hash = await read(ctx, 'strategyIn', [slot]);
    shipped.set(slot, hash);
    ctx.log('shipped', { strategy: name, slot, hash, tx: res.hash, weth: amounts.WETH, usdc: amounts.USDC });
  }
  return res;
}

export default {
  intervalMs: 4_000,
  async init(ctx) {
    const onchainFi = await read(ctx, 'fi').catch(() => null);
    ctx.log('vault', { vault: contractAddress('castle'), fi: onchainFi, me: ctx.account.address, isFi: onchainFi?.toLowerCase() === ctx.account.address.toLowerCase() });
  },
  async tick(ctx) {
    if (!contractAddress('castle')) return ctx.logChange('vault', 'waiting', { for: 'a CastleVault in the deployments file' });
    const l = await ledger(ctx);
    const p = await price(ctx);
    ctx.logChange('slots', 'slots', { harp: l.slots[0].hash, hen: l.slots[1].hash, greedy: l.slots[2].hash, mid: p?.mid ?? null, recentre: p?.recentre ?? null });
    // A slot fi shipped that is now empty, without fi docking it, was docked by fum (risk) or the owner: stand down.
    for (const [slot, hash] of shipped) {
      if (!l.slots[slot].hash && !selfDocked.has(hash) && !fumDocked.has(slot)) {
        fumDocked.add(slot);
        ctx.log('stand-down', { slot, hash, note: 'docked by fum or the owner; fi does not re-ship it' });
      }
    }

    for (const name of SHIP) {
      const slot = SLOTS[name];
      if (l.slots[slot].hash || fumDocked.has(slot)) continue;
      const res = await shipSlot(ctx, name, l, p);
      if (res) return;   // one tx per tick; the next tick reads the new ledger
    }

    // fee asked for a re-centre: dock hen and ship it again at the new mid.
    // Only a price fee reported after the last re-centre counts: the one before it described the old curve.
    if (p?.recentre === 'hen' && l.slots[SLOTS.hen].hash && !recentring && (p.t ?? 0) > lastRecentreAt) {
      recentring = true;
      lastRecentreAt = Date.now();
      try {
        ctx.log('recentre', { strategy: 'hen', mid: p.mid, henMid: p.henMid, driftBps: p.driftBps });
        selfDocked.add(l.slots[SLOTS.hen].hash);
        const d = await send(ctx, 'dock', [l.slots[SLOTS.hen].hash]);
        if (d.ok) await shipSlot(ctx, 'hen', await ledger(ctx), p);
      } finally { recentring = false; }
      return;
    }

    if (GREEDY && !greedyDone && l.slots[SLOTS.harp].hash && l.slots[SLOTS.hen].hash) {
      greedyDone = true;
      // Ask for another GREEDY_BPS of the hoard on top of what harp and hen promise: past the leverage limit.
      const ask = { WETH: (l.tokens.WETH.balance * GREEDY_BPS) / 10_000n, USDC: (l.tokens.USDC.balance * GREEDY_BPS) / 10_000n };
      ctx.log('compiled', { strategy: 'greedy', slot: SLOTS.greedy, kind: 'hen', weth: ask.WETH, usdc: ask.USDC, headroom: { WETH: l.tokens.WETH.headroom, USDC: l.tokens.USDC.headroom } });
      const res = await send(ctx, 'ship', [SLOTS.greedy, hen(HEN_FEE_BPS), ask.WETH, ask.USDC], { force: true, gas: BigInt(env('FI_GREEDY_GAS', 90_000)) });
      ctx.log(res.ok ? 'greedy-shipped' : 'greedy-refused', { tx: res.hash, reason: res.reason });
      if (res.mined && !res.ok) await report(ctx, 'allocation.refused', { tx: res.hash });
    }
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
