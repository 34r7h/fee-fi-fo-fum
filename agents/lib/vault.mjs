// The crew's view of the CastleVault (docs/SPEC.md): reads of the hoard, the slots and the Aqua ledger, and the one
// way the crew writes to it. Every write is simulated first; a revert the simulation predicts is logged and not
// sent, unless the caller forces it (fi's greedy ship, whose OverAllocated revert is the point).
import { decodeErrorResult, encodeFunctionData } from 'viem';
import { contractAddress, abi, txLink } from './chain.mjs';

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

// Simulate, then send and wait. {ok, hash, receipt, reason, mined}.
export async function send(ctx, functionName, args, { force = false, gas } = {}) {
  const address = vaultAddress();
  let expected = null;
  try { await ctx.pc.simulateContract({ address, abi: abi('CastleVault'), functionName, args, account: ctx.account }); }
  catch (e) { expected = decodeVaultError(e); }
  if (expected && !force) { ctx.log('tx-skipped', { fn: functionName, reason: expected }); return { ok: false, reason: expected, mined: false }; }
  const data = encodeFunctionData({ abi: abi('CastleVault'), functionName, args });
  const hash = await ctx.wallet.sendTransaction({ to: address, data, ...(expected ? { gas: gas ?? 400_000n } : {}) });
  const receipt = await ctx.pc.waitForTransactionReceipt({ hash, timeout: 120_000 });
  const ok = receipt.status === 'success';
  ctx.log(ok ? 'tx' : 'tx-reverted', { fn: functionName, hash, link: txLink(hash), block: receipt.blockNumber, gasUsed: receipt.gasUsed, ...(ok ? {} : { reason: expected }) });
  return { ok, hash, receipt, reason: ok ? null : expected, mined: true };
}

// USDC per WETH (as a Number, for logs and drift) from raw amounts.
export const usdcPerWeth = (usdcRaw, wethRaw) => (BigInt(wethRaw) === 0n ? null : Number((BigInt(usdcRaw) * 10n ** 14n) / BigInt(wethRaw)) / 100);
