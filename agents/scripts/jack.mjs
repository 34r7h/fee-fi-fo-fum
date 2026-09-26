#!/usr/bin/env node
// Jack on a fork: the outside solver's moves, for rehearsals only (on Sepolia the Jack is agy, with its own tools).
// It refuses any RPC that is not anvil and acts as agy (0xDDf2…AE4c) by impersonation, so no key signs anything.
// Each command prints one JSON line.
//
//   node scripts/jack.mjs quote USDC WETH 1000000 [--save q.json]   resolve quote.feefifofum.eth by CCIP-Read and fill it
//   node scripts/jack.mjs stale q.json                                 the same quote after validUntil: a mined QuoteExpired revert,
//                                                                      recorded through castle_fill {tx_hash}
//   node scripts/jack.mjs v4 USDC 1000000 [minOut]                     swap on the Castle's v4 pool (the hook fills it from hen)
//   node scripts/jack.mjs stress                                       a harp fill sized so fills push committed WETH past
//                                                                      balance x leverage by less than harp holds: fum docks harp
//   node scripts/jack.mjs route USDC WETH 1000000 [minOut]             a UniswapX-format order through castle_route (fo), then its calls
// env: SEPOLIA_RPC_URL (the anvil fork), DEPLOYMENTS_PATH (the fork's deployments), CASTLE_SERVICE_URL
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, getAddress, encodeAbiParameters, encodeFunctionData, decodeErrorResult } from 'viem';
import { sepolia } from 'viem/chains';
import { loadEnv, env } from '../lib/env.mjs';
import { contractAddress, abi } from '../lib/chain.mjs';

loadEnv();
const AGY = '0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c';
const NAME = 'quote.feefifofum.eth';
const RPC = env('SEPOLIA_RPC_URL');
const SERVICE = (env('CASTLE_SERVICE_URL') || '').replace(/\/$/, '');
const MIN_SQRT = 4295128739n + 1n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
const chain = { ...sepolia, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const rpc = (method, params = []) => pub.request({ method, params });
const out = (o) => console.log(JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
const T = () => ({ USDC: getAddress(contractAddress('usdc')), WETH: getAddress(contractAddress('weth')) });

async function asAgy(fn) {
  await rpc('anvil_impersonateAccount', [AGY]);
  try { return await fn(createWalletClient({ account: AGY, chain, transport: http(RPC) })); }
  finally { await rpc('anvil_stopImpersonatingAccount', [AGY]); }
}
async function call(w, to, data, gas) {
  const hash = await w.sendTransaction({ to, data, ...(gas ? { gas } : {}) });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: rc.status, gasUsed: rc.gasUsed, block: rc.blockNumber };
}
async function service(tool, args) {
  const r = await fetch(`${SERVICE}/tools/${tool}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${tool}: ${j.error}`);
  return j;
}
const balances = async () => {
  const t = T();
  const [u, w] = await Promise.all([t.USDC, t.WETH].map((a) => pub.readContract({ address: a, abi: abi('ERC20'), functionName: 'balanceOf', args: [AGY] })));
  return { USDC: u, WETH: w };
};

const version = await rpc('web3_clientVersion');
if (!/anvil/i.test(version)) throw new Error(`refusing: ${RPC} is ${version}, not anvil (jack.mjs is for fork rehearsals)`);
if (SERVICE && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(SERVICE)) throw new Error(`refusing: CASTLE_SERVICE_URL ${SERVICE} is not this fork's local service`);
const [cmd, ...a] = process.argv.slice(2);
const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : null; };

// Resolve quote:<in>:<out>:<amt> through ENS (CCIP-Read) and fill it through the router.
async function harpFill(tin, tout, amt, save) {
  const key = `quote:${tin}:${tout}:${amt}`;
  const text = await pub.getEnsText({ name: NAME, key, universalResolverAddress: contractAddress('universalResolver'), strict: true });
  const rec = JSON.parse(text);
  if (save) fs.writeFileSync(save, text);
  const before = await balances();
  const res = await asAgy(async (w) => {
    const ap = await call(w, rec.tokenIn, encodeFunctionData({ abi: abi('ERC20'), functionName: 'approve', args: [rec.router, BigInt(rec.amountIn)] }));
    const order = { maker: rec.order.maker, traits: BigInt(rec.order.traits), data: rec.order.data };
    const sw = await call(w, rec.router, encodeFunctionData({ abi: abi('SwapVM'), functionName: 'swap', args: [order, rec.tokenIn, rec.tokenOut, BigInt(rec.amountIn), rec.takerTraitsAndData] }));
    return { approve: ap, swap: sw };
  });
  const after = await balances();
  return { key, via: 'getEnsText through UniversalResolverV2 (CCIP-Read)', quoteId: rec.id, signer: rec.signer, amountIn: rec.amountIn, amountOut: rec.amountOut, validUntil: rec.validUntil, tx: res.swap.hash, status: res.swap.status, gasUsed: res.swap.gasUsed, received: after[tout] - before[tout], paid: before[tin] - after[tin] };
}

if (cmd === 'quote') {
  const [tin, tout, amt] = a;
  out({ jack: 'quote', ...(await harpFill(tin, tout, amt, opt('save'))) });
} else if (cmd === 'stress') {
  // Buy WETH from harp until the vault promises more WETH than balance x leverage, but not so much that hen alone
  // is over too: fum should dock harp and stop. Selling x WETH moves committed to (h - x) + e and the limit to
  // lev (B - x), so x must pass (lev B - h - e) / (lev - 1) and stay under B - e / lev (h, e: harp's and hen's
  // WETH; B: the vault's WETH). The midpoint, priced in USDC at fee's mid.
  const t = T(), vault = getAddress(contractAddress('castle')), router = getAddress(contractAddress('router'));
  const V = abi('CastleVault');
  const rv = (fn, args = []) => pub.readContract({ address: vault, abi: V, functionName: fn, args });
  const alloc = async (slot) => {
    const hash = await rv('strategyIn', [slot]);
    if (/^0x0+$/.test(hash)) return 0n;
    const [bal] = await pub.readContract({ address: getAddress(contractAddress('aqua')), abi: abi('Aqua'), functionName: 'rawBalances', args: [vault, router, hash, t.WETH] });
    return bal;
  };
  const [B, lev, h, e] = await Promise.all([
    pub.readContract({ address: t.WETH, abi: abi('ERC20'), functionName: 'balanceOf', args: [vault] }),
    rv('leverageOf', [t.WETH]), alloc(0), alloc(1),
  ]);
  const L = BigInt(lev);
  const lo = (L * B - 10_000n * (h + e)) > 0n ? (L * B - 10_000n * (h + e)) / (L - 10_000n) : 0n;
  const hi = B - (e * 10_000n) / L;
  if (hi <= lo) throw new Error(`no fill docks harp alone: needs more than ${lo} WETH and at most ${hi} (B ${B}, harp ${h}, hen ${e})`);
  const x = (lo + hi) / 2n;
  if (x > h) throw new Error(`harp holds ${h} WETH, less than the ${x} this needs`);
  const s = await (await fetch(`${SERVICE}/state`)).json();
  const usdc = (x * BigInt(Math.round(Number(s.price.mid) * 100))) / 10n ** 14n;
  out({ jack: 'stress', wethOut: x, between: [lo, hi], vaultWeth: B, harpWeth: h, henWeth: e, leverageBps: Number(lev), ...(await harpFill('USDC', 'WETH', usdc.toString())) });
} else if (cmd === 'stale') {
  const rec = JSON.parse(fs.readFileSync(a[0], 'utf8'));
  // Wait out the quote in real time (the demo's "31 s later"). The fork's clock can trail the wall clock by a few
  // seconds; if it still has not passed validUntil, the next block is stamped just past it, never further.
  const wait = (Number(rec.validUntil) + 1) * 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if ((await pub.getBlock()).timestamp <= BigInt(rec.validUntil)) await rpc('evm_setNextBlockTimestamp', [`0x${(BigInt(rec.validUntil) + 1n).toString(16)}`]);
  const order = { maker: rec.order.maker, traits: BigInt(rec.order.traits), data: rec.order.data };
  const data = encodeFunctionData({ abi: abi('SwapVM'), functionName: 'swap', args: [order, rec.tokenIn, rec.tokenOut, BigInt(rec.amountIn), rec.takerTraitsAndData] });
  const res = await asAgy(async (w) => {
    await call(w, rec.tokenIn, encodeFunctionData({ abi: abi('ERC20'), functionName: 'approve', args: [rec.router, BigInt(rec.amountIn)] }));
    return call(w, rec.router, data, 300_000n);   // unsimulated: the revert is mined
  });
  let reason = null;
  try { await pub.call({ account: AGY, to: rec.router, data, blockNumber: res.block - 1n }); } catch (e) {
    const raw = e?.walk?.((x) => typeof x?.data === 'string')?.data;
    try { const d = decodeErrorResult({ abi: abi('PriceExtruction'), data: raw }); reason = `${d.errorName}(${d.args.join(',')})`; } catch { reason = raw?.slice(0, 10) ?? e.shortMessage; }
  }
  const recorded = SERVICE ? await service('castle_fill', { tx_hash: res.hash, quoteId: rec.id }).catch((e) => ({ error: e.message })) : null;
  out({ jack: 'stale', quoteId: rec.id, validUntil: rec.validUntil, tx: res.hash, status: res.status, revert: reason, recorded });
} else if (cmd === 'v4') {
  const [tin, amt, minOut = '0'] = a;
  const t = T();
  const tokenIn = t[tin], swapTest = getAddress(contractAddress('poolSwapTest'));
  const [c0, c1] = BigInt(t.USDC) < BigInt(t.WETH) ? [t.USDC, t.WETH] : [t.WETH, t.USDC];
  const key = { currency0: c0, currency1: c1, fee: 0, tickSpacing: 60, hooks: getAddress(contractAddress('hook')) };
  const zeroForOne = tokenIn === c0;
  const hookData = BigInt(minOut) > 0n ? encodeAbiParameters([{ type: 'uint256' }], [BigInt(minOut)]) : '0x';
  const before = await balances();
  const res = await asAgy(async (w) => {
    await call(w, tokenIn, encodeFunctionData({ abi: abi('ERC20'), functionName: 'approve', args: [swapTest, BigInt(amt)] }));
    return call(w, swapTest, encodeFunctionData({ abi: abi('PoolSwapTest'), functionName: 'swap', args: [key, { zeroForOne, amountSpecified: -BigInt(amt), sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT }, { takeClaims: false, settleUsingBurn: false }, hookData] }));
  });
  const after = await balances();
  const tout = tin === 'USDC' ? 'WETH' : 'USDC';
  out({ jack: 'v4', pool: key, amountIn: amt, tx: res.hash, status: res.status, gasUsed: res.gasUsed, received: after[tout] - before[tout], paid: before[tin] - after[tin] });
} else if (cmd === 'route') {
  const [tin, tout, amt, minOut = '1'] = a;
  const now = Math.floor(Date.now() / 1000);
  const order = { info: { reactor: null, swapper: AGY, nonce: String(now), deadline: now + 120 }, swapper: AGY, nonce: String(now), deadline: now + 120, input: { token: tin, startAmount: amt, endAmount: amt }, outputs: [{ token: tout, startAmount: minOut, endAmount: minOut, recipient: AGY }] };
  const r = await service('castle_route', { order });
  const before = await balances();
  const sent = await asAgy(async (w) => { const xs = []; for (const c of r.calls) xs.push(await call(w, c.to, c.data)); return xs; });
  const after = await balances();
  out({ jack: 'route', intent: r.id, route: r.route, compared: r.compared, amountIn: amt, quotedOut: r.amountOut, txs: sent.map((x) => ({ tx: x.hash, status: x.status })), received: after[tout] - before[tout], paid: before[tin] - after[tin] });
} else {
  console.error('usage: jack.mjs quote|stale|v4|route|stress …');
  process.exit(2);
}
