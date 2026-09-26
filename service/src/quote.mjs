// harp's firm quotes (docs/SPEC.md "The quote"). fee's latest price sets priceQ96 for the direction asked, fi signs
// the Quote (lib/ccip-sign.mjs), and the router's own quote view checks the record before anyone sees it: a quote the
// service returns is one router.swap fills until validUntil. The gateway and castle_quote both serve harpQuote.
import * as C from '../lib/ccip-sign.mjs';
import { addr, env } from './config.mjs';
import { abi } from './abi.mjs';
import { client, decodeRevert, sameAddr } from './chain.mjs';
import { view } from './stream.mjs';
import { fiSigner, signQuote } from './fi.mjs';

export const DECIMALS = { USDC: 6, WETH: 18 };
export const HARP_SLOT = Number(process.env.CASTLE_HARP_SLOT ?? 0);
export const HEN_SLOT = Number(process.env.CASTLE_HEN_SLOT ?? 1);
const TTL_S = Number(process.env.CASTLE_QUOTE_TTL_S || 30);
const FEE_STALE_MS = Number(process.env.CASTLE_FEE_STALE_S || 60) * 1000;
const Q96 = 1n << 96n;

export const tokenAddr = (sym) => (String(sym).toUpperCase() === 'USDC' ? addr('usdc') : String(sym).toUpperCase() === 'WETH' ? addr('weth') : null);
export const symbolOf = (a) => (sameAddr(a, addr('usdc')) ? 'USDC' : sameAddr(a, addr('weth')) ? 'WETH' : null);

// "2412.50" -> 241250000000n (USDC per WETH, 8 decimals).
export function toE8(s) {
  const [i, f = ''] = String(s).split('.');
  return BigInt(i) * 10n ** 8n + BigInt((f + '00000000').slice(0, 8));
}
// USDC per WETH as a 2-decimal string, from a trade's two legs.
export function priceOf(symIn, amountIn, amountOut) {
  const usdc = symIn === 'USDC' ? BigInt(amountIn) : BigInt(amountOut);
  const weth = symIn === 'USDC' ? BigInt(amountOut) : BigInt(amountIn);
  if (weth === 0n) return null;
  const cents = (usdc * 10n ** 12n * 100n) / weth;
  const s = cents.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}
// priceQ96 = raw tokenOut per raw tokenIn, times 2^96, at fee's mid widened by the spread against the solver.
// USDC in (the solver buys WETH): the Castle asks mid * (1 + s). WETH in (the solver sells): it bids mid * (1 - s).
export function priceQ96For(symIn, mid, spreadBps) {
  const m = toE8(mid), s = BigInt(spreadBps);
  if (symIn === 'USDC') return (Q96 * 10n ** 12n * 10n ** 8n * 10_000n) / (m * (10_000n + s));
  return (Q96 * m * (10_000n - s)) / (10n ** 20n * 10_000n);
}

// fee's price, as fee last reported it (signed). Stale means fee is down, and the harp stays silent.
export function feePrice() {
  const p = view().price;
  if (!p || !p.mid) return { ok: false, error: 'fee has not reported a price yet' };
  const age = Date.now() - (p.t ?? 0);
  if (age > FEE_STALE_MS) return { ok: false, error: `fee's price is ${Math.round(age / 1000)}s old (fee is silent; limit ${FEE_STALE_MS / 1000}s)` };
  return { ok: true, ...p };
}

let harpCache = { at: 0, hash: null, order: null };
export function forgetHarp() { harpCache = { at: 0, hash: null, order: null }; }
export async function harp() {
  if (harpCache.hash && Date.now() - harpCache.at < 10_000) return harpCache;
  const vault = addr('castle');
  if (!vault) throw Object.assign(new Error('no CastleVault in the deployments file yet'), { status: 503 });
  const hash = await client.readContract({ address: vault, abi: abi('CastleVault'), functionName: 'strategyIn', args: [HARP_SLOT] });
  if (/^0x0+$/.test(hash)) throw Object.assign(new Error(`harp is not shipped (vault slot ${HARP_SLOT} is empty)`), { status: 503 });
  const order = await client.readContract({ address: vault, abi: abi('CastleVault'), functionName: 'orderOf', args: [hash] });
  harpCache = { at: Date.now(), hash, order };
  return harpCache;
}

const recent = new Map();   // quote id -> the record, for castle_fill {quoteId} and for linking fills to quotes
export const quoteById = (id) => recent.get(id) || null;
// The newest quote this service signed that matches `pred`, or null.
export function findQuote(pred) {
  for (const r of [...recent.values()].reverse()) if (pred(r)) return r;
  return null;
}
let n = 0;

// One firm harp quote: {ok, quote (the record), text (its JSON line), symIn, symOut, price} or {ok: false, status, error}.
export async function harpQuote({ tokenIn: symIn, tokenOut: symOut, amountIn }) {
  symIn = String(symIn).toUpperCase(); symOut = String(symOut).toUpperCase();
  const tokenIn = tokenAddr(symIn), tokenOut = tokenAddr(symOut);
  if (!tokenIn || !tokenOut || tokenIn === tokenOut) return { ok: false, status: 400, error: 'tokens must be USDC and WETH, one each way' };
  const amt = BigInt(amountIn);
  if (amt <= 0n) return { ok: false, status: 400, error: 'amountIn must be above zero' };
  const router = addr('router'), priceEx = addr('priceExtruction');
  if (!router || !priceEx) return { ok: false, status: 503, error: 'the router or PriceExtruction is not in the deployments file' };
  const s = fiSigner();
  if (!s) return { ok: false, status: 503, error: 'fi key not loaded on this host (CASTLE_FI_KEY_PATH)' };
  const p = feePrice();
  if (!p.ok) return { ok: false, status: 503, error: p.error };
  let h;
  try { h = await harp(); } catch (e) { return { ok: false, status: e.status || 502, error: e.shortMessage || e.message }; }

  const validUntil = BigInt(Math.floor(Date.now() / 1000) + TTL_S);
  const priceQ96 = priceQ96For(symIn, p.mid, p.spreadBps);
  const quote = { strategyHash: h.hash, tokenIn, tokenOut, priceQ96, maxAmountIn: amt, validUntil };
  const quoteSig = await signQuote(priceEx, quote);
  const amountOut = C.quoteAmountOut(amt, priceQ96);
  const id = `q-${validUntil}-${++n}`;
  const text = C.buildQuoteRecord({ id, chainId: env.chainId, router, order: h.order, quote, amountIn: amt, amountOut, signer: s.address, quoteSig });
  const record = JSON.parse(text);
  let checked;
  try {
    const [, out] = await client.readContract({ address: router, abi: abi('SwapVM'), functionName: 'quote', args: [h.order, tokenIn, tokenOut, amt, record.takerTraitsAndData] });
    checked = out;
  } catch (e) {
    const raw = e?.walk?.((x) => typeof x?.data === 'string')?.data;
    forgetHarp();
    return { ok: false, status: 422, error: `the router refuses this quote: ${raw ? decodeRevert(raw) : e?.shortMessage || e?.message}` };
  }
  if (checked !== amountOut) return { ok: false, status: 500, error: `router.quote pays ${checked}, the record says ${amountOut}` };
  // router.quote never touches the maker's wallet: a quote past harp's allocation or the hoard passes there and
  // reverts in swap. Refuse it now instead.
  const [[alloc], held] = await Promise.all([
    client.readContract({ address: addr('aqua'), abi: abi('Aqua'), functionName: 'rawBalances', args: [h.order.maker, router, h.hash, tokenOut] }),
    client.readContract({ address: tokenOut, abi: abi('ERC20'), functionName: 'balanceOf', args: [h.order.maker] }),
  ]);
  if (amountOut > alloc || amountOut > held) return { ok: false, status: 422, error: `harp can pay at most ${alloc < held ? alloc : held} ${symOut} (allocation ${alloc}, hoard ${held}); this quote needs ${amountOut}` };

  const price = priceOf(symIn, amt, amountOut);
  recent.set(id, { ...record, symIn, symOut, price });
  if (recent.size > 500) recent.delete(recent.keys().next().value);
  return { ok: true, quote: record, text, symIn, symOut, price, mid: p.mid, spreadBps: p.spreadBps };
}
