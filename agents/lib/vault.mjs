// The crew's view of the CastleVault (docs/SPEC.md): reads of the hoard, the slots and the Aqua ledger, and the one
// way the crew writes to it. Every write is simulated first; a revert the simulation predicts is logged and not
// sent, unless the caller forces it (fi's greedy ship, whose OverAllocated revert is the point). Every tx goes out at
// a max fee of MAX_FEE_GWEI (1.8) with a TIP_GWEI (0.1) tip, and none goes out while the base fee is over that: the
// write is deferred, and the caller tries again on a later tick.
import { decodeErrorResult, encodeFunctionData, parseGwei, formatGwei, formatEther } from 'viem';
import { contractAddress, abi, txLink } from './chain.mjs';
import { env } from './env.mjs';

export const SLOTS = { harp: 0, hen: 1, greedy: 2 };
export const SLOT_NAMES = ['harp', 'hen', 'greedy'];
export const ZERO = `0x${'0'.repeat(64)}`;

export const tokens = () => ({ USDC: contractAddress('usdc'), WETH: contractAddress('weth') });
export const vaultAddress = () => contractAddress('castle');

export async function read(ctx, functionName, args = [], blockNumber) {
  return ctx.pc.readContract({ address: vaultAddress(), abi: abi('CastleVault'), functionName, args, ...(blockNumber != null ? { blockNumber } : {}) });
}
export async function balanceOf(ctx, token, who) {
  return ctx.pc.readContract({ address: token, abi: abi('ERC20'), functionName: 'balanceOf', args: [who] });
}
export async function rawBalance(ctx, hash, token) {
  const [bal] = await ctx.pc.readContract({ address: contractAddress('aqua'), abi: abi('Aqua'), functionName: 'rawBalances', args: [vaultAddress(), contractAddress('router'), hash, token] });
  return bal;
}

// The whole ledger in one read: balances, committed, leverage and headroom per token; each slot's strategy, cap and
// Aqua allocation.
export async function ledger(ctx) {
  const t = tokens(), v = vaultAddress();
  const tok = {};
  for (const [sym, a] of Object.entries(t)) {
    const [balance, committed, headroom, leverageBps] = await Promise.all([balanceOf(ctx, a, v), read(ctx, 'committed', [a]), read(ctx, 'headroom', [a]), read(ctx, 'leverageOf', [a])]);
    tok[sym] = { balance, committed, headroom, leverageBps: Number(leverageBps) };
  }
  const slots = [];
  for (let slot = 0; slot < SLOT_NAMES.length; slot++) {
    const [hash, [capW, capU]] = await Promise.all([read(ctx, 'strategyIn', [slot]), read(ctx, 'capOf', [slot])]);
    const row = { slot, name: SLOT_NAMES[slot], hash: hash === ZERO ? null : hash, cap: { WETH: capW, USDC: capU }, alloc: null };
    if (row.hash) row.alloc = { WETH: await rawBalance(ctx, row.hash, t.WETH), USDC: await rawBalance(ctx, row.hash, t.USDC) };
    slots.push(row);
  }
  return { tokens: tok, slots };
}

export function decodeVaultError(e) {
  const data = e?.walk?.((x) => typeof x?.data === 'string')?.data;
  if (data) {
    try { const d = decodeErrorResult({ abi: abi('CastleVault'), data }); return `${d.errorName}(${(d.args || []).map(String).join(',')})`; } catch { /* not a vault error */ }
  }
  return e?.shortMessage || e?.message || String(e);
}

// Simulate, then send and wait. {ok, hash, receipt, reason, mined}, or {ok: false, deferred: true} over the fee cap.
export async function send(ctx, functionName, args, { force = false, gas } = {}) {
  const address = vaultAddress();
  let expected = null;
  try { await ctx.pc.simulateContract({ address, abi: abi('CastleVault'), functionName, args, account: ctx.account }); }
  catch (e) { expected = decodeVaultError(e); }
  if (expected && !force) { ctx.log('tx-skipped', { fn: functionName, reason: expected }); return { ok: false, reason: expected, mined: false }; }
  const data = encodeFunctionData({ abi: abi('CastleVault'), functionName, args });
  const maxFee = parseGwei(env('MAX_FEE_GWEI', '1.8'));
  const tip = [parseGwei(env('TIP_GWEI', '0.1')), maxFee].reduce((a, b) => (a < b ? a : b));
  const base = (await ctx.pc.getBlock()).baseFeePerGas ?? 0n;
  if (base + tip > maxFee) {
    const reason = `the base fee is ${formatGwei(base)} gwei: with the ${formatGwei(tip)} tip that is over the ${formatGwei(maxFee)} gwei cap`;
    ctx.logChange(`defer-${functionName}`, 'tx-deferred', { fn: functionName, reason });
    return { ok: false, deferred: true, reason, mined: false };
  }
  const hash = await ctx.wallet.sendTransaction({ to: address, data, maxFeePerGas: maxFee, maxPriorityFeePerGas: tip, ...(expected ? { gas: gas ?? 400_000n } : {}) });
  ctx.log('tx-sent', { fn: functionName, hash, link: txLink(hash) });
  const receipt = await ctx.pc.waitForTransactionReceipt({ hash, timeout: 300_000 });
  const ok = receipt.status === 'success';
  ctx.log(ok ? 'tx' : 'tx-reverted', { fn: functionName, hash, link: txLink(hash), block: receipt.blockNumber, gasUsed: receipt.gasUsed, gasPriceGwei: formatGwei(receipt.effectiveGasPrice), costEth: formatEther(receipt.gasUsed * receipt.effectiveGasPrice), ...(ok ? {} : { reason: expected }) });
  return { ok, hash, receipt, reason: ok ? null : expected, mined: true };
}

// USDC per WETH (as a Number, for logs and drift) from raw amounts.
export const usdcPerWeth = (usdcRaw, wethRaw) => (BigInt(wethRaw) === 0n ? null : Number((BigInt(usdcRaw) * 10n ** 14n) / BigInt(wethRaw)) / 100);
