#!/usr/bin/env node
// Jack: the outside solver's moves (docs/SPEC.md: agy). Each command prints one JSON line with full tx hashes.
//
// On an anvil fork it acts as agy (0xDDf2…AE4c) by impersonation, so no key signs anything. With JACK_KEY_PATH (a file
// holding one 0x-prefixed key, mode 0600) it signs with that key instead, on a fork or on Sepolia. On Sepolia it sends
// nothing without --send (on a fork, --dry does the same): it resolves the quote (a free read), skips an approve the
// allowance already covers, simulates the rest, and prints each tx's gas estimate and cost at the cap. With --send
// every tx is simulated right before it goes out, at a max fee of MAX_FEE_GWEI (1.8), and not sent while the base fee
// is over that; a failed simulation stops it. Each tx's full hash and Etherscan link print as it is sent (stderr) and
// in the result line (stdout), and a failure after a tx went out still prints the hashes sent. A harp quote lives
// 30 s, so a quote (or a harp route) with less than MIN_LEFT_S (20) left after the approve is fetched again before
// the fill. The fork-only moves (stale, stress) refuse to run on Sepolia.
//
//   node scripts/jack.mjs quote USDC WETH 500000 [--save q.json] [--send]   resolve quote.feefifofum.eth by CCIP-Read
//                                                                            (UniversalResolverV2) and fill it (router.swap)
//   node scripts/jack.mjs v4 USDC 500000 [minOut] [--send]                  swap on the Castle's v4 pool (PoolSwapTest);
//                                                                            the hook fills it from hen
//   node scripts/jack.mjs route USDC WETH 500000 [minOut] [--send]          a UniswapX-format order through castle_route
//                                                                            (fo), then its calls
//   node scripts/jack.mjs stale q.json                                      fork: the same quote after validUntil, a mined
//                                                                            QuoteExpired revert, recorded via castle_fill
//   node scripts/jack.mjs stress                                            fork: a harp fill sized so committed WETH
//                                                                            passes balance x leverage by less than harp holds
// env: SEPOLIA_RPC_URL, DEPLOYMENTS_PATH, CASTLE_SERVICE_URL (route; a fork needs its local service), JACK_KEY_PATH,
//      MAX_FEE_GWEI (1.8), MIN_LEFT_S (20)
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, getAddress, encodeAbiParameters, encodeFunctionData, decodeFunctionData, decodeErrorResult, parseGwei, formatGwei, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { loadEnv, env, expandHome } from '../lib/env.mjs';
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

const KEY = env('JACK_KEY_PATH') ? expandHome(env('JACK_KEY_PATH')) : null;
const MAX_FEE = parseGwei(env('MAX_FEE_GWEI', '1.8'));
const TIP = parseGwei('0.1') < MAX_FEE ? parseGwei('0.1') : MAX_FEE;
const MIN_LEFT_S = Number(env('MIN_LEFT_S', 20));
let FORK = true, SEND = true, ME = AGY;
const sent = [];   // every tx this run sent: {hash, link}
const link = (hash) => `https://sepolia.etherscan.io/tx/${hash}`;
const left = (validUntil) => (validUntil == null ? Infinity : Number(validUntil) - Date.now() / 1000);
function keyAccount() {
  if ((fs.statSync(KEY).mode & 0o077) !== 0) throw new Error(`${KEY} must be mode 0600`);
  return privateKeyToAccount(fs.readFileSync(KEY, 'utf8').trim());
}
// The Jack's wallet: its own key when JACK_KEY_PATH is set, else agy impersonated (fork only).
async function asAgy(fn) {
  if (KEY) return fn(createWalletClient({ account: keyAccount(), chain, transport: http(RPC) }));
  await rpc('anvil_impersonateAccount', [AGY]);
  try { return await fn(createWalletClient({ account: AGY, chain, transport: http(RPC) })); }
  finally { await rpc('anvil_stopImpersonatingAccount', [AGY]); }
}
// Simulate, then (with SEND) send and wait. A manual gas limit skips the simulation: the revert is the point (stale).
async function call(w, to, data, gas) {
  const account = w.account.address;
  let estimate = null;
  if (!gas) {
    try { estimate = await pub.estimateGas({ account, to, data }); }
    catch (e) { throw new Error(`simulation of the tx to ${to} failed: ${e.shortMessage || e.message}`); }
  }
  if (!SEND) return { simulated: true, to, estimate, maxCostEth: formatEther(estimate * MAX_FEE) };
  let fees = {};
  if (!FORK) {
    const base = (await pub.getBlock()).baseFeePerGas ?? 0n;
    if (base + TIP > MAX_FEE) throw new Error(`the base fee is ${formatGwei(base)} gwei, over the ${formatGwei(MAX_FEE)} gwei cap: not sending`);
    fees = { maxFeePerGas: MAX_FEE, maxPriorityFeePerGas: TIP };
  }
  const hash = await w.sendTransaction({ to, data, ...(gas ? { gas } : { gas: (estimate * 12n) / 10n }), ...fees });
  sent.push({ hash, link: link(hash) });
  if (!FORK) console.error(JSON.stringify({ sent: hash, link: link(hash) }));
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 300_000 });
  return { hash, link: link(hash), status: rc.status, gasUsed: rc.gasUsed, block: rc.blockNumber, costEth: formatEther(rc.gasUsed * rc.effectiveGasPrice) };
}
async function service(tool, args) {
  const r = await fetch(`${SERVICE}/tools/${tool}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${tool}: ${j.error}`);
  return j;
}
const balances = async () => {
  const t = T();
  const [u, w] = await Promise.all([t.USDC, t.WETH].map((a) => pub.readContract({ address: a, abi: abi('ERC20'), functionName: 'balanceOf', args: [ME] })));
  return { USDC: u, WETH: w };
};

const [cmd, ...a] = process.argv.slice(2);
const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : null; };
const pos = a.filter((x, i) => !x.startsWith('--') && a[i - 1] !== '--save');   // the arguments without the flags
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, (e) => { out({ ok: false, error: e.shortMessage || e.message, sent }); process.exit(1); });
const version = await rpc('web3_clientVersion').catch(() => '');
FORK = /anvil/i.test(version);
if (FORK) SEND = !a.includes('--dry');
if (FORK && SERVICE && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(SERVICE)) throw new Error(`refusing: CASTLE_SERVICE_URL ${SERVICE} is not this fork's local service`);
if (!FORK) {
  if (!KEY) throw new Error(`${RPC} is not an anvil fork: set JACK_KEY_PATH to sign with your own key (and --send to send)`);
  if (cmd === 'stale' || cmd === 'stress') throw new Error(`${cmd} is a fork-only move`);
  if ((await pub.getChainId()) !== 11155111) throw new Error('not Sepolia');
  SEND = a.includes('--send');
}
if (KEY) ME = keyAccount().address;

// Approve `spender` for `amount` of `token` unless the allowance already covers it.
async function approve(w, token, spender, amount) {
  const have = await pub.readContract({ address: token, abi: abi('ERC20'), functionName: 'allowance', args: [ME, spender] });
  if (have >= amount) return { skipped: `allowance ${have} already covers ${amount}` };
  return call(w, token, encodeFunctionData({ abi: abi('ERC20'), functionName: 'approve', args: [spender, amount] }));
}
// The swap itself. Without --send on Sepolia, and before the approve is mined, it cannot be simulated: `expect`
// (a free view of what it pays) stands in.
async function swap(w, to, data, needs, expect) {
  if (!SEND && needs) return { simulated: false, note: 'simulated right before it is sent, once the approve is mined', expect: await expect().catch((e) => ({ error: e.shortMessage || e.message })) };
  return call(w, to, data);
}

// A gateway quote record as router.swap's calldata.
function fillOf(rec) {
  const order = { maker: rec.order.maker, traits: BigInt(rec.order.traits), data: rec.order.data };
  const args = [order, rec.tokenIn, rec.tokenOut, BigInt(rec.amountIn), rec.takerTraitsAndData];
  return { args, data: encodeFunctionData({ abi: abi('SwapVM'), functionName: 'swap', args }) };
}

// Resolve quote:<in>:<out>:<amt> through ENS (CCIP-Read) and fill it through the router.
async function harpFill(tin, tout, amt, save) {
  const key = `quote:${tin}:${tout}:${amt}`;
  const resolve = async () => {
    const text = await pub.getEnsText({ name: NAME, key, universalResolverAddress: contractAddress('universalResolver'), strict: true }).catch(async (e) => {
      // The resolver only says the gateway failed; the castle says why (fee silent, harp not shipped, too small).
      const why = SERVICE ? await service('castle_quote', { tokenIn: tin, tokenOut: tout, amountIn: amt }).then(() => null, (x) => x.message) : null;
      throw new Error(`${NAME} did not resolve ${key}: ${e.shortMessage || e.message}${why ? ` (the castle: ${why})` : ''}`);
    });
    return [text, JSON.parse(text)];
  };
  let [text, rec] = await resolve();
  const before = await balances();
  const res = await asAgy(async (w) => {
    const ap = await approve(w, rec.tokenIn, rec.router, BigInt(rec.amountIn));
    if (left(rec.validUntil) < MIN_LEFT_S) [text, rec] = await resolve();   // the approve took blocks: a fresh quote
    const { args, data } = fillOf(rec);
    const sw = await swap(w, rec.router, data, !ap.skipped, async () => (await pub.readContract({ address: rec.router, abi: abi('SwapVM'), functionName: 'quote', args }))[1]);
    return { approve: ap, swap: sw };
  });
  if (save) fs.writeFileSync(save, text);
  const after = await balances();
  return { key, via: 'getEnsText through UniversalResolverV2 (CCIP-Read)', from: ME, quoteId: rec.id, signer: rec.signer, amountIn: rec.amountIn, amountOut: rec.amountOut, validUntil: rec.validUntil, tx: res.swap.hash ?? null, status: res.swap.status ?? null, gasUsed: res.swap.gasUsed ?? null, txs: res, received: after[tout] - before[tout], paid: before[tin] - after[tin] };
}

if (cmd === 'quote') {
  const [tin, tout, amt] = pos;
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
  const rec = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
  // Wait out the quote in real time (the demo's "31 s later"). The fork's clock can trail the wall clock by a few
  // seconds; if it still has not passed validUntil, the next block is stamped just past it, never further.
  const wait = (Number(rec.validUntil) + 1) * 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if ((await pub.getBlock()).timestamp <= BigInt(rec.validUntil)) await rpc('evm_setNextBlockTimestamp', [`0x${(BigInt(rec.validUntil) + 1n).toString(16)}`]);
  const { data } = fillOf(rec);
  const res = await asAgy(async (w) => {
    await approve(w, rec.tokenIn, rec.router, BigInt(rec.amountIn));
    return call(w, rec.router, data, 300_000n);   // unsimulated: the revert is mined
  });
  let reason = null;
  try { await pub.call({ account: ME, to: rec.router, data, blockNumber: res.block - 1n }); } catch (e) {
    const raw = e?.walk?.((x) => typeof x?.data === 'string')?.data;
    try { const d = decodeErrorResult({ abi: abi('PriceExtruction'), data: raw }); reason = `${d.errorName}(${d.args.join(',')})`; } catch { reason = raw?.slice(0, 10) ?? e.shortMessage; }
  }
  const recorded = SERVICE ? await service('castle_fill', { tx_hash: res.hash, quoteId: rec.id }).catch((e) => ({ error: e.message })) : null;
  out({ jack: 'stale', quoteId: rec.id, validUntil: rec.validUntil, tx: res.hash, link: res.link, status: res.status, revert: reason, recorded });
} else if (cmd === 'v4') {
  const [tin, amt, minOut = '0'] = pos;
  const t = T();
  const tokenIn = t[tin], swapTest = getAddress(contractAddress('poolSwapTest'));
  const [c0, c1] = BigInt(t.USDC) < BigInt(t.WETH) ? [t.USDC, t.WETH] : [t.WETH, t.USDC];
  const key = { currency0: c0, currency1: c1, fee: 0, tickSpacing: 60, hooks: getAddress(contractAddress('hook')) };
  const zeroForOne = tokenIn === c0;
  const hookData = BigInt(minOut) > 0n ? encodeAbiParameters([{ type: 'uint256' }], [BigInt(minOut)]) : '0x';
  const data = encodeFunctionData({ abi: abi('PoolSwapTest'), functionName: 'swap', args: [key, { zeroForOne, amountSpecified: -BigInt(amt), sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT }, { takeClaims: false, settleUsingBurn: false }, hookData] });
  const before = await balances();
  const res = await asAgy(async (w) => {
    const ap = await approve(w, tokenIn, swapTest, BigInt(amt));
    const sw = await swap(w, swapTest, data, !ap.skipped, async () => (await pub.simulateContract({ address: getAddress(contractAddress('v4Quoter')), abi: abi('V4Quoter'), functionName: 'quoteExactInputSingle', args: [{ poolKey: key, zeroForOne, exactAmount: BigInt(amt), hookData }] })).result[0]);
    return { approve: ap, swap: sw };
  });
  const after = await balances();
  const tout = tin === 'USDC' ? 'WETH' : 'USDC';
  out({ jack: 'v4', from: ME, pool: key, amountIn: amt, tx: res.swap.hash ?? null, status: res.swap.status ?? null, gasUsed: res.swap.gasUsed ?? null, txs: res, received: after[tout] - before[tout], paid: before[tin] - after[tin] });
} else if (cmd === 'route') {
  const [tin, tout, amt, minOut = '1'] = pos;
  const now = Math.floor(Date.now() / 1000);
  const order = { info: { reactor: null, swapper: ME, nonce: String(now), deadline: now + 120 }, swapper: ME, nonce: String(now), deadline: now + 120, input: { token: tin, startAmount: amt, endAmount: amt }, outputs: [{ token: tout, startAmount: minOut, endAmount: minOut, recipient: ME }] };
  let r = await service('castle_route', { order });
  const before = await balances();
  const txs = await asAgy(async (w) => {
    const approvals = [];
    for (let i = 0; i < 2; i++) {
      const ap = r.calls[0];
      const approved = await approve(w, ap.to, decodeFunctionData({ abi: abi('ERC20'), data: ap.data }).args[0], BigInt(amt));
      approvals.push(approved);
      if (left(r.validUntil) >= MIN_LEFT_S) break;
      r = await service('castle_route', { order });   // the approve took blocks: route again for a fresh harp quote
    }
    const tx = r.calls[1];
    return { approve: approvals.length > 1 ? approvals : approvals[0], swap: await swap(w, tx.to, tx.data, !approvals.at(-1).skipped, async () => r.amountOut) };
  });
  const after = await balances();
  out({ jack: 'route', from: ME, intent: r.id, route: r.route, compared: r.compared, amountIn: amt, quotedOut: r.amountOut, tx: txs.swap.hash ?? null, status: txs.swap.status ?? null, txs, received: after[tout] - before[tout], paid: before[tin] - after[tin] });
} else {
  console.error('usage: jack.mjs quote|stale|v4|route|stress …');
  process.exit(2);
}
