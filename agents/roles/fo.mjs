// fo, the intent forwarder (docs/SPEC.md "The crew").
//
// fo takes UniswapX-format orders and routes each one to the better of two fills from the same Castle balance:
//   harp  a firm quote fi signed (the castle service's castle_quote), filled through router.swap;
//   v4    the Castle's v4 pool, whose hook fills the swap just in time from hen (the V4Quoter prices it).
// It answers POST /route {order} on 127.0.0.1:FO_PORT (the castle service's castle_route forwards here when it can
// reach fo, and otherwise hands the order to fo's signed poll of /fo/next), returns
// the chosen route with ready calldata, and reports intent.routed to the service, signed. There is no UniswapX
// reactor on Sepolia (docs/research.md), so the swapper signs and sends the calls itself. fo holds no on-chain role
// and sends no transactions.
//
// An order, in the UniswapX shape (amounts in base units; tokens as addresses or USDC/WETH):
//   { swapper, nonce, deadline, input: { token, amount | startAmount },
//     outputs: [{ token, amount | endAmount | startAmount (the minimum), recipient }] }
import http from 'node:http';
import { encodeAbiParameters, encodeFunctionData, getAddress, isAddress } from 'viem';
import { contractAddress, abi } from '../lib/chain.mjs';
import { env } from '../lib/env.mjs';
import { report, serviceBase, foMessage } from '../lib/report.mjs';

const PORT = Number(env('FO_PORT', 8731));
const MIN_SQRT = 4295128739n + 1n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
let server = null;
let n = 0;

const tokenOf = (t) => {
  const u = String(t || '').toUpperCase();
  if (u === 'USDC') return getAddress(contractAddress('usdc'));
  if (u === 'WETH') return getAddress(contractAddress('weth'));
  return isAddress(t || '') ? getAddress(t) : null;
};
const sym = (a) => (a === getAddress(contractAddress('usdc')) ? 'USDC' : a === getAddress(contractAddress('weth')) ? 'WETH' : a);

export function parseOrder(o) {
  const input = o?.input || {};
  const out = (o?.outputs || [])[0] || {};
  const tokenIn = tokenOf(input.token), tokenOut = tokenOf(out.token);
  const amountIn = BigInt(input.amount ?? input.startAmount ?? input.endAmount ?? 0);
  const minOut = BigInt(out.endAmount ?? out.amount ?? out.startAmount ?? 0);
  if (!tokenIn || !tokenOut || tokenIn === tokenOut) throw new Error('order needs input.token and outputs[0].token, which must be USDC and WETH, one of each');
  if (amountIn <= 0n) throw new Error('order input amount must be above zero');
  if (!isAddress(o?.swapper || '')) throw new Error('order needs a swapper address');
  const deadline = Number(o.deadline || 0);
  if (deadline && deadline < Date.now() / 1000) throw new Error(`order deadline ${deadline} has passed`);
  return { swapper: getAddress(o.swapper), recipient: isAddress(out.recipient || '') ? getAddress(out.recipient) : getAddress(o.swapper), tokenIn, tokenOut, amountIn, minOut, deadline, nonce: String(o.nonce ?? '') };
}

async function service(path, body) {
  const base = serviceBase();
  if (!base) throw new Error('no castle service: CASTLE_SERVICE_URL is unset (or remote while the RPC is a local fork)');
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `service ${path} answered ${r.status}`);
  return j;
}

// harp: fi's signed quote from the service, and the router.swap calls to fill it.
async function harpRoute(ctx, o) {
  const q = await service('/tools/castle_quote', { tokenIn: sym(o.tokenIn), tokenOut: sym(o.tokenOut), amountIn: o.amountIn.toString() });
  const fill = await service('/tools/castle_fill', { quoteId: q.id, taker: o.swapper });
  return { route: 'harp', strategy: q.strategyHash, amountOut: BigInt(q.amountOut), quoteId: q.id, validUntil: q.validUntil, calls: [fill.approve, fill.tx] };
}

// v4: the Castle's pool {USDC, WETH, fee 0, tickSpacing 60, hooks: CastleJITHook}, priced by the V4Quoter.
function poolKey() {
  const [usdc, weth] = [getAddress(contractAddress('usdc')), getAddress(contractAddress('weth'))];
  const [c0, c1] = BigInt(usdc) < BigInt(weth) ? [usdc, weth] : [weth, usdc];
  return { currency0: c0, currency1: c1, fee: 0, tickSpacing: 60, hooks: getAddress(contractAddress('hook')) };
}
async function v4Route(ctx, o) {
  const hook = contractAddress('hook'), quoter = contractAddress('v4Quoter'), swapTest = contractAddress('poolSwapTest');
  if (!hook || !quoter || !swapTest) throw new Error('the v4 hook, V4Quoter or PoolSwapTest is not in the deployments file');
  const key = poolKey();
  const zeroForOne = o.tokenIn === key.currency0;
  const hookData = o.minOut > 0n ? encodeAbiParameters([{ type: 'uint256' }], [o.minOut]) : '0x';
  const { result } = await ctx.pc.simulateContract({ address: quoter, abi: abi('V4Quoter'), functionName: 'quoteExactInputSingle', args: [{ poolKey: key, zeroForOne, exactAmount: o.amountIn, hookData }] });
  const amountOut = result[0];
  const approve = { to: o.tokenIn, data: encodeFunctionData({ abi: abi('ERC20'), functionName: 'approve', args: [swapTest, o.amountIn] }), value: '0' };
  const tx = {
    to: swapTest, value: '0',
    data: encodeFunctionData({ abi: abi('PoolSwapTest'), functionName: 'swap', args: [key, { zeroForOne, amountSpecified: -o.amountIn, sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT }, { takeClaims: false, settleUsingBurn: false }, hookData] }),
  };
  return { route: 'v4', strategy: null, amountOut, pool: key, calls: [approve, tx] };
}

export async function route(ctx, order) {
  const o = parseOrder(order);
  const id = `i-${Math.floor(Date.now() / 1000)}-${++n}`;
  const [h, v] = await Promise.allSettled([harpRoute(ctx, o), v4Route(ctx, o)]);
  const options = [h, v].filter((x) => x.status === 'fulfilled').map((x) => x.value).filter((x) => x.amountOut >= o.minOut && x.amountOut > 0n);
  const why = { harp: h.status === 'fulfilled' ? h.value.amountOut.toString() : String(h.reason?.message || h.reason), v4: v.status === 'fulfilled' ? v.value.amountOut.toString() : String(v.reason?.message || v.reason) };
  if (!options.length) {
    ctx.log('route-refused', { id, swapper: o.swapper, tokenIn: sym(o.tokenIn), amountIn: o.amountIn, minOut: o.minOut, harp: why.harp, v4: why.v4 });
    throw Object.assign(new Error(`no route pays at least ${o.minOut}: harp ${why.harp}; v4 ${why.v4}`), { status: 422 });
  }
  const best = options.reduce((a, b) => (b.amountOut > a.amountOut ? b : a));
  const other = best.route === 'harp' ? why.v4 : why.harp;
  ctx.log('routed', { id, swapper: o.swapper, tokenIn: sym(o.tokenIn), tokenOut: sym(o.tokenOut), amountIn: o.amountIn, minOut: o.minOut, route: best.route, amountOut: best.amountOut, harp: why.harp, v4: why.v4 });
  await report(ctx, 'intent.routed', {
    id, source: 'UniswapX', swapper: o.swapper, swapperName: null, tokenIn: sym(o.tokenIn), tokenOut: sym(o.tokenOut), amountIn: o.amountIn.toString(),
    route: best.route === 'harp' ? 'aqua' : 'v4', strategy: best.strategy, amountOut: best.amountOut.toString(), alternative: other,
  });
  return { id, route: best.route, amountIn: o.amountIn.toString(), amountOut: best.amountOut.toString(), minOut: o.minOut.toString(), quoteId: best.quoteId ?? null, validUntil: best.validUntil ?? null, compared: why, calls: best.calls, note: 'sign and send calls in order from the swapper; a harp quote lives 30 s' };
}

// castle_route reaches fo through the service: fo polls GET /fo/next (signed) and posts each route, or why there is
// none, to POST /fo/answer. This works wherever fo runs; a service with FO_URL set calls /route directly instead.
let polling = false;
async function poll(ctx) {
  const base = serviceBase();
  if (!base || env('FO_POLL', '1') === '0' || polling) return;
  polling = true;
  ctx.log('polling', { service: base });
  const signed = async (what, body) => { const t = Date.now(); return { t, sig: await ctx.account.signMessage({ message: foMessage({ what, t, body }) }) }; };
  while (polling) {
    try {
      const { t, sig } = await signed('next', {});
      const r = await fetch(`${base}/fo/next?wait=10000`, { headers: { 'x-fo-t': String(t), 'x-fo-sig': sig }, signal: AbortSignal.timeout(20_000) });
      if (r.status === 204) { ctx.logChange('poll', 'poll', { ok: true }); continue; }
      const job = await r.json().catch(() => null);
      if (r.status !== 200 || !job?.id) { ctx.logChange('poll', 'poll', { ok: false, status: r.status, error: job?.error }); await new Promise((z) => setTimeout(z, 5_000)); continue; }
      ctx.logChange('poll', 'poll', { ok: true });
      let result = null, error = null;
      try { result = JSON.parse(JSON.stringify(await route(ctx, job.order), (_k, x) => (typeof x === 'bigint' ? x.toString() : x))); }
      catch (e) { error = e.shortMessage || e.message; }
      const s = await signed('answer', { id: job.id, result, error });
      await fetch(`${base}/fo/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id, result, error, ...s }), signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      ctx.logChange('poll', 'poll', { ok: false, error: e.message });
      await new Promise((z) => setTimeout(z, 5_000));
    }
  }
}

export default {
  intervalMs: 30_000,
  async init(ctx) {
    poll(ctx);
    server = http.createServer(async (req, res) => {
      const send = (s, b) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(b, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))); };
      if (req.method !== 'POST' || new URL(req.url, 'http://x').pathname !== '/route') return send(404, { error: 'POST /route {order}' });
      let body = '';
      for await (const c of req) body += c;
      try { send(200, await route(ctx, JSON.parse(body || '{}').order)); }
      catch (e) { send(e.status || 400, { error: e.shortMessage || e.message }); }
    });
    server.listen(PORT, '127.0.0.1', () => ctx.log('listening', { route: `http://127.0.0.1:${PORT}/route` }));
  },
  async tick() {},
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
