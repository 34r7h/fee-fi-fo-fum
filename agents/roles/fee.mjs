// fee, the pricing engine (docs/SPEC.md "The crew").
//
// Every new block fee reads Chainlink ETH/USD, keeps a short window of prices, and sets the mid and the spread:
// the spread is FEE_BASE_SPREAD_BPS widened by FEE_VOL_K times the realized volatility of the window (in bps), and
// clamped to [FEE_MIN_SPREAD_BPS, FEE_MAX_SPREAD_BPS]. It publishes `price` to the castle service, signed, whenever
// the price changes and at least every FEE_REPORT_S: the gateway prices every harp quote from fee's latest price and
// refuses to quote when it is stale. fee also reads hen's curve (the ratio of hen's Aqua balances) and, when the mid
// drifts more than FEE_DRIFT_BPS from it, asks fi to re-centre hen: the price it reports carries recentre: "hen".
// fee holds no on-chain role and sends no transactions.
//
// Fork runs can move the reference without touching Chainlink: FEE_SHIFT_FILE names a file holding a shift in bps
// (e.g. 80), applied to the Chainlink answer while it is there.
import fs from 'node:fs';
import { contractAddress, abi } from '../lib/chain.mjs';
import { env } from '../lib/env.mjs';
import { report } from '../lib/report.mjs';
import { read, rawBalance, tokens, ZERO, SLOTS } from '../lib/vault.mjs';

const BASE = Number(env('FEE_BASE_SPREAD_BPS', 10));
const K = Number(env('FEE_VOL_K', 2));
const MIN = Number(env('FEE_MIN_SPREAD_BPS', 5));
const MAX = Number(env('FEE_MAX_SPREAD_BPS', 200));
const WINDOW = Number(env('FEE_WINDOW', 30));
const DRIFT_BPS = Number(env('FEE_DRIFT_BPS', 50));
const REPORT_S = Number(env('FEE_REPORT_S', 20));
const SHIFT_FILE = env('FEE_SHIFT_FILE');

const window = [];     // recent mids (Number, USDC per WETH)
let lastBlock = null;
let lastShift = 0;
let last = { key: null, at: 0 };

function shiftBps() {
  if (!SHIFT_FILE || !fs.existsSync(SHIFT_FILE)) return 0;
  const v = Number(fs.readFileSync(SHIFT_FILE, 'utf8').trim());
  return Number.isFinite(v) ? v : 0;
}

// Realized volatility of the window: the standard deviation of successive log returns, in bps.
function sigmaBps(xs) {
  if (xs.length < 3) return 0;
  const r = [];
  for (let i = 1; i < xs.length; i++) r.push(Math.log(xs[i] / xs[i - 1]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * 10_000;
}

async function reference(ctx) {
  const feed = contractAddress('chainlink');
  if (!feed) throw new Error('no chainlink ETH/USD feed in the deployments file (external.chainlinkEthUsd)');
  const [dec, round] = await Promise.all([
    ctx.pc.readContract({ address: feed, abi: abi('Chainlink'), functionName: 'decimals' }),
    ctx.pc.readContract({ address: feed, abi: abi('Chainlink'), functionName: 'latestRoundData' }),
  ]);
  const answer = Number(round[1]) / 10 ** Number(dec);
  const shift = shiftBps();
  return { answer, mid: answer * (1 + shift / 10_000), updatedAt: Number(round[3]), round: round[0].toString(), shift };
}

// hen's curve price: the ratio of its Aqua balances (USDC per WETH), or null when hen is not shipped.
async function henMid(ctx) {
  const hash = await read(ctx, 'strategyIn', [SLOTS.hen]).catch(() => ZERO);
  if (hash === ZERO) return null;
  const t = tokens();
  const [u, w] = await Promise.all([rawBalance(ctx, hash, t.USDC), rawBalance(ctx, hash, t.WETH)]);
  return w === 0n ? null : Number((u * 10n ** 14n) / w) / 100;
}

export default {
  intervalMs: 3_000,
  async tick(ctx) {
    // A new block, a new fork shift, or REPORT_S of quiet (fee re-vouches for its price, so a quiet chain does
    // not make the gateway go silent).
    const block = await ctx.pc.getBlockNumber();
    const shift = shiftBps();
    const fresh = block !== lastBlock;
    if (!fresh && shift === lastShift && Date.now() - last.at < REPORT_S * 1000) return;
    lastBlock = block;
    lastShift = shift;
    const ref = await reference(ctx);
    if (fresh || !window.length) window.push(ref.mid);
    if (window.length > WINDOW) window.shift();
    const sigma = sigmaBps(window);
    const spreadBps = Math.round(Math.min(MAX, Math.max(MIN, BASE + K * sigma)));
    const mid = ref.mid.toFixed(2);
    const hen = await henMid(ctx).catch(() => null);
    const driftBps = hen ? Math.round((Math.abs(ref.mid - hen) / hen) * 10_000) : null;
    const recentre = driftBps != null && driftBps > DRIFT_BPS ? 'hen' : null;
    const key = `${mid}:${spreadBps}:${recentre}`;
    ctx.logChange('price', 'price', { block, mid, spreadBps, sigmaBps: Math.round(sigma), chainlink: ref.answer, round: ref.round, shiftBps: ref.shift, henMid: hen, driftBps, recentre });
    if (key === last.key && Date.now() - last.at < REPORT_S * 1000) return;
    last = { key, at: Date.now() };
    if (recentre) ctx.log('ask-recentre', { to: 'fi', strategy: 'hen', mid, henMid: hen, driftBps, limitBps: DRIFT_BPS });
    await report(ctx, 'price', { mid, spreadBps, block: Number(block), source: `chainlink ETH/USD round ${ref.round}${ref.shift ? ` shifted ${ref.shift} bps` : ''}`, henMid: hen, driftBps, sigmaBps: Math.round(sigma), recentre });
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
