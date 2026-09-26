// A shift's on-chain moves, shared by fee and fi (whoever holds the castle runs the same loop), for Castle v2.
//
//   renewIfDue  holder + LIVE + due → ask fo for the seal → Castle.renew(expiry, deadline, sig)
//   claimCastle EXPIRED + crew → Castle.multicall([claim, dock(stale)…, relink]) in one tx
//   shipBook    holder + LIVE → Castle.ship(amounts, fee, band), or multicall([dock(open)…, ship]) to re-centre;
//               Castle builds the fenced program on the ENS anchor, and lib/book.mjs checks what it built
//
// Every write is simulated first, so an honest agent never burns gas on a revert. The one exception is
// `force`: a demo sends a call it believes in, so the chain itself rejects it with a mined tx.
import { encodeFunctionData, decodeErrorResult, maxUint256 } from 'viem';
import { abi, contractAddress, txLink } from './chain.mjs';
import { env } from './env.mjs';
import { CASTLE_EVENTS } from './replay.mjs';
import { shippedBook } from './book.mjs';
import { readLease } from './lease.mjs';

export const FO_URL = env('FO_URL', `http://127.0.0.1:${env('FO_PORT', 8711)}`);
export const RENEW_EVERY_S = Number(env('RENEW_EVERY_S', 40));
export const RESHIP_EVERY_S = Number(env('RESHIP_EVERY_S', 240));
// What the holder chooses when shipping (Castle clamps amounts to its balance and bounds fee and band).
export const SHIP_PARAMS = () => ({
  maxWeth: BigInt(env('SHIP_MAX_WETH', maxUint256)),
  maxUsdc: BigInt(env('SHIP_MAX_USDC', maxUint256)),
  feeBps: Number(env('SHIP_FEE_BPS', 3_000_000)),      // 0.3% (SwapVM units: 1e9 = 100%)
  rangeBps: Number(env('SHIP_RANGE_BPS', 50_000_000)), // band [P/1.05, P*1.05]
});
const LOOKBACK_BLOCKS = BigInt(env('SHIFT_LOOKBACK_BLOCKS', 900));

const castleAbi = () => abi('Castle');
const errName = (e) => e?.cause?.data?.errorName || e?.walk?.((x) => x?.data?.errorName)?.data?.errorName || e?.shortMessage || e?.message;
const call = (functionName, args = []) => encodeFunctionData({ abi: castleAbi(), functionName, args });

export async function send(ctx, functionName, args, { force = false, gas } = {}) {
  const address = contractAddress('castle');
  const req = { address, abi: castleAbi(), functionName, args, account: ctx.account };
  // The simulation names the revert; a forced send goes out anyway, so the chain records the rejection.
  let expected = null;
  try { await ctx.pc.simulateContract(req); }
  catch (e) {
    expected = errName(e);
    if (!force) { ctx.log('tx-skipped', { fn: functionName, reason: expected }); return { ok: false, reason: expected, mined: false }; }
  }
  const hash = await ctx.wallet.writeContract({ ...req, ...(force ? { gas: gas ?? 300_000n } : {}) });
  const receipt = await ctx.pc.waitForTransactionReceipt({ hash, timeout: 120_000 });
  const ok = receipt.status === 'success';
  ctx.log(ok ? 'tx' : 'tx-reverted', { fn: functionName, hash, link: txLink(hash), block: receipt.blockNumber, gasUsed: receipt.gasUsed, ...(ok ? {} : { reason: expected }) });
  return { ok, hash, receipt, mined: true, reason: ok ? null : expected };
}

// Ask fo for the seal on (live epoch, expiry = now + leasePeriod).
export async function requestSeal(ctx, lease) {
  const body = { epoch: String(lease.epoch), expiry: lease.now + lease.leasePeriod, requester: ctx.id };
  const r = await fetch(`${FO_URL}/attest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { sealed: true, ...j } : { sealed: false, reason: j.withheld || j.error || `http ${r.status}`, detail: j.detail };
}

const mine = (ctx, lease) => lease.holder?.toLowerCase() === ctx.account.address.toLowerCase();

// Renew when the lease has run RENEW_EVERY_S since its last renewal (a 120s lease renewed every 40s keeps 80s of slack).
export async function renewIfDue(ctx, lease) {
  if (!lease.deployed || !mine(ctx, lease) || lease.state !== 'LIVE') return { due: false };
  if (lease.secondsLeft > lease.leasePeriod - RENEW_EVERY_S) return { due: false };
  const seal = await requestSeal(ctx, lease).catch((e) => ({ sealed: false, reason: `fo unreachable: ${e.message}` }));
  if (!seal.sealed) {
    ctx.logChange('seal', 'seal-withheld', { reason: seal.reason, secondsLeft: lease.secondsLeft });
    return { due: true, renewed: false, reason: seal.reason };
  }
  ctx.logChange('seal', 'seal', { ok: true });
  const r = await send(ctx, 'renew', [BigInt(seal.expiry), BigInt(seal.deadline), seal.signature]);
  return { due: true, renewed: r.ok, tx: r.hash };
}

// Strategies Castle shipped that are still on Aqua (Shipped minus Docked), oldest first, with their epochs.
export async function openStrategies(ctx, lease) {
  const from = lease.block > LOOKBACK_BLOCKS ? lease.block - LOOKBACK_BLOCKS : 0n;
  const [shipped, docked] = await Promise.all([
    ctx.pc.getLogs({ address: lease.castle, event: CASTLE_EVENTS.Shipped, fromBlock: from, toBlock: 'latest' }),
    ctx.pc.getLogs({ address: lease.castle, event: CASTLE_EVENTS.Docked, fromBlock: from, toBlock: 'latest' }),
  ]);
  const gone = new Set(docked.map((l) => l.args.strategyHash));
  return shipped.filter((l) => !gone.has(l.args.strategyHash)).map((l) => ({ strategyHash: l.args.strategyHash, epoch: l.args.epoch, block: l.blockNumber }));
}

// Take the castle after expiry: claim, dock every strategy still on Aqua, and link castle.* to the new holder.
export async function claimCastle(ctx, { dock = [] } = {}) {
  return send(ctx, 'multicall', [[call('claim'), ...dock.map((s) => call('dock', [s.strategyHash])), call('relink')]]);
}

// Ship the book centred on the ENS anchor; with `dock`, re-centre: retire those strategies in the same tx.
export async function shipBook(ctx, { dock = [] } = {}) {
  const p = SHIP_PARAMS();
  const r = dock.length
    ? await send(ctx, 'multicall', [[...dock.map((s) => call('dock', [s.strategyHash])), call('ship', [p])]])
    : await send(ctx, 'ship', [p]);
  if (!r.ok) return r;
  const book = await shippedBook(ctx.pc, r.receipt, { aqua: contractAddress('aqua'), castle: contractAddress('castle'), weth: contractAddress('weth'), usdc: contractAddress('usdc') });
  ctx.log('shipped', { tx: r.hash, link: txLink(r.hash), docked: dock.length, ...book });
  return { ...r, book };
}

// The holder's book upkeep: ship if nothing of this epoch is on Aqua, re-centre every RESHIP_EVERY_S.
export async function shipIfDue(ctx, lease) {
  if (!lease.deployed || !mine(ctx, lease) || lease.state !== 'LIVE') return { due: false };
  const open = await openStrategies(ctx, lease);
  const ours = open.filter((s) => BigInt(s.epoch) === BigInt(lease.epoch));
  if (!ours.length && claimedAt && Date.now() - claimedAt < SHIP_HOLD_S * 1000) {
    ctx.logChange('hold', 'ship-held', { holdS: SHIP_HOLD_S, fencedOnAqua: open.map((x) => x.strategyHash) });
    return { due: false };
  }
  if (ours.length) {
    const b = await ctx.pc.getBlock({ blockNumber: ours.at(-1).block });
    if (lease.now - Number(b.timestamp) < RESHIP_EVERY_S) return { due: false };
  }
  return { due: true, ...(await shipBook(ctx, { dock: open })) };
}

// Demo only: after a standby claim, hold the new holder's first ship this long. The old book stays on Aqua,
// fenced by the new epoch, so a fill against it reverts FeeFiFoFum() in the fence (a docked strategy would
// revert earlier, in Aqua). The first ship then docks it (multicall([dock..., ship])).
const SHIP_HOLD_S = Number(env('SHIP_HOLD_S', 0));
let claimedAt = null;

// The standby's move (fi by default, fee with FEE_STANDBY=1): once block time passes expiry, and after `delayS` of
// wind-down gap, multicall([claim, relink]): a new epoch, which fences the old book, and castle.* linked to the
// claimer's crew name. The stale strategies are docked by the first ship (shipIfDue), not by the claim.
export async function standbyClaim(ctx, lease, { delayS = 0 } = {}) {
  if (lease.state !== 'EXPIRED' || lease.expiry === 0) return { claimed: false };   // expiry 0: genesis is fee's
  if (lease.now - lease.expiry < delayS) { ctx.logChange('gap', 'wind-down-gap', { expiredForS: lease.now - lease.expiry, claimAfterS: delayS }); return { claimed: false }; }
  // Castle crew: an operator-set crew label AND that name owned, unexpired, in the agent registry.
  const isCrew = await ctx.pc.readContract({ address: lease.castle, abi: castleAbi(), functionName: 'isCrew', args: [ctx.account.address] });
  if (!isCrew) { ctx.logChange('crew', 'not-crew', { note: `Castle.isCrew(${ctx.id}) is false: the operator must setCrew and ${ctx.id} must own its name` }); return { claimed: false }; }
  const stale = await openStrategies(ctx, lease);
  ctx.log('claiming', { expiredForS: lease.now - lease.expiry, staleOnAqua: stale.length });
  const r = await claimCastle(ctx);
  if (!r.ok) return { claimed: false, reason: r.reason };
  claimedAt = Date.now();
  const after = await readLease(ctx.pc);
  ctx.log('claimed', { tx: r.hash, newEpoch: after.epoch, previousEpoch: lease.epoch, expiry: after.expiry, gapS: after.now - lease.expiry, staleOnAqua: stale.map((x) => x.strategyHash) });
  return { claimed: true, tx: r.hash };
}

// A restart from stale state: the process believes it still holds the castle and sends one renew with whatever
// seal fo gives it (or an empty one), unsimulated, so the chain records the rejection (NotHolder, LeaseExpired).
export async function staleRenew(ctx, lease) {
  const seal = await requestSeal(ctx, lease).catch(() => ({ sealed: false }));
  const expiry = BigInt(lease.now + lease.leasePeriod);
  const r = await send(ctx, 'renew', [seal.sealed ? BigInt(seal.expiry) : expiry, seal.sealed ? BigInt(seal.deadline) : BigInt(lease.now + 30), seal.sealed ? seal.signature : '0x'], { force: true });
  ctx.log('stale-renew', { mined: r.mined, ok: r.ok, reason: r.reason ?? null, tx: r.hash || null });
  return r;
}

export { errName, decodeErrorResult };
