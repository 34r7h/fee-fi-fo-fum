// A shift's on-chain moves, shared by fee and fi (whoever holds the castle runs the same loop), for Castle v2 and v3.
//
//   renewIfDue          holder + LIVE + due → ask fo for the seal → Castle.renew(expiry, deadline, sig)
//   claimCastle         claimable + crew → Castle.multicall([claim, dock(stale)…, relink]) in one tx
//   shipBook            holder + LIVE → Castle.ship(amounts, fee, band), or multicall([dock(open)…, ship]) to re-centre;
//                       Castle builds the fenced program on the ENS anchor, and lib/book.mjs checks what it built
//   heartbeatIfDue      v3 holder: sign Heartbeat(epoch, validUntil), get fo's co-signature, publish the 138 bytes
//   respondIfChallenged v3 holder: answer a challenge() with respond() inside its 60s window
//   challengeIfSilent   v3 standby: challenge() a holder whose heartbeats stopped; unanswered, claim() opens early
//
// Every write is simulated first, so an honest agent never burns gas on a revert. The one exception is
// `force`: a demo sends a call it believes in, so the chain itself rejects it with a mined tx.
import fs from 'node:fs';
import path from 'node:path';
import { encodeFunctionData, decodeErrorResult, maxUint256 } from 'viem';
import { abi, contractAddress, txLink } from './chain.mjs';
import { env, AGENTS_ROOT } from './env.mjs';
import { CASTLE_EVENTS } from './replay.mjs';
import { shippedBook } from './book.mjs';
import { readLease } from './lease.mjs';
import { signHeartbeat, packHeartbeat, MAX_HEARTBEAT_TTL } from './heartbeat.mjs';

export const FO_URL = env('FO_URL', `http://127.0.0.1:${env('FO_PORT', 8711)}`);
// v2 renews 90s into its 120s lease. v3's lease is a day long (heartbeats carry liveness), so it renews with an hour left.
const renewEveryS = (lease) => Number(env('RENEW_EVERY_S', lease.leasePeriod > 7200 ? lease.leasePeriod - 3600 : 90));
// v3: where the co-signed heartbeat is published for takers (the castle service), 'off' for none; the holder also
// writes it to logs/heartbeat.json, which crew on this machine read when the service is out of reach.
export const CASTLE_SERVICE_URL = env('CASTLE_SERVICE_URL', 'https://handoff.lol/t/castle').replace(/\/$/, '');
export const HEARTBEAT_FILE = path.join(AGENTS_ROOT, 'logs', 'heartbeat.json');
const HB_TTL_S = Math.min(Number(env('HEARTBEAT_TTL_S', 90)), MAX_HEARTBEAT_TTL);   // validUntil = block time + this
const HB_REFRESH_S = Number(env('HEARTBEAT_REFRESH_S', 60));   // re-sign once the current beat has less than this left
const SILENT_AFTER_S = Number(env('CHALLENGE_SILENT_S', 30));  // challenge once the last beat expired this long ago
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

// Renew when the lease has run RENEW_EVERY_S since its last renewal: a v2 lease (120s) renewed at 90s keeps 30s of
// slack (about two Sepolia blocks); a v3 lease (1 day) is renewed with an hour left, once a day.
export async function renewIfDue(ctx, lease) {
  if (!lease.deployed || !mine(ctx, lease) || lease.state !== 'LIVE') return { due: false };
  if (lease.secondsLeft > lease.leasePeriod - renewEveryS(lease)) return { due: false };
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
  return shipped.filter((l) => !gone.has(l.args.strategyHash)).map((l) => ({ strategyHash: l.args.strategyHash, epoch: l.args.epoch, block: l.blockNumber, anchorQ96: l.args.anchorQ96 }));
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

// The holder's book upkeep: ship when nothing of this epoch is on Aqua, and re-centre only when the ENS anchor has
// moved off the live book (a CCA settled and wrote a new price; fo withholds the seal from an off-market book).
// There is no timer: a book centred on the current anchor is current, and every re-ship costs gas.
export async function shipIfDue(ctx, lease) {
  if (!lease.deployed || !mine(ctx, lease) || lease.state !== 'LIVE') return { due: false };
  const open = await openStrategies(ctx, lease);
  const ours = open.filter((s) => BigInt(s.epoch) === BigInt(lease.epoch));
  if (!ours.length && claimedAt && Date.now() - claimedAt < SHIP_HOLD_S * 1000) {
    ctx.logChange('hold', 'ship-held', { holdS: SHIP_HOLD_S, fencedOnAqua: open.map((x) => x.strategyHash) });
    return { due: false };
  }
  if (ours.length) {
    const last = ours.at(-1);
    const anchor = await ctx.pc.readContract({ address: lease.castle, abi: castleAbi(), functionName: 'anchorPriceQ96' });
    if (anchor === last.anchorQ96) return { due: false };
    ctx.log('anchor-moved', { bookAnchorQ96: last.anchorQ96, ensAnchorQ96: anchor, strategy: last.strategyHash });
  }
  return { due: true, ...(await shipBook(ctx, { dock: open })) };
}

// Demo only: after a standby claim, hold the new holder's first ship this long. The old book stays on Aqua,
// fenced by the new epoch, so a fill against it reverts FeeFiFoFum() in the fence (a docked strategy would
// revert earlier, in Aqua). The first ship then docks it (multicall([dock..., ship])).
const SHIP_HOLD_S = Number(env('SHIP_HOLD_S', 0));
let claimedAt = null;

// The standby's move (fi by default, fee with FEE_STANDBY=1): once the castle is claimable (block time past expiry,
// or on v3 past the deadline of a challenge the holder left unanswered), and after `delayS` of wind-down gap,
// multicall([claim, relink]): a new epoch, which fences the old book, and castle.* linked to the claimer's crew name.
// The stale strategies are docked by the first ship (shipIfDue), not by the claim.
export async function standbyClaim(ctx, lease, { delayS = 0 } = {}) {
  if (!lease.claimable) return { claimed: false };   // expiry 0 is never claimable here: genesis is fee's
  const openedAt = lease.state === 'EXPIRED' ? lease.expiry : lease.challenge.deadline;
  if (lease.now - openedAt < delayS) { ctx.logChange('gap', 'wind-down-gap', { claimableForS: lease.now - openedAt, claimAfterS: delayS, early: lease.state !== 'EXPIRED' }); return { claimed: false }; }
  // Castle crew: an operator-set crew label AND that name owned, unexpired, in the agent registry.
  const isCrew = await ctx.pc.readContract({ address: lease.castle, abi: castleAbi(), functionName: 'isCrew', args: [ctx.account.address] });
  if (!isCrew) { ctx.logChange('crew', 'not-crew', { note: `Castle.isCrew(${ctx.id}) is false: the operator must setCrew and ${ctx.id} must own its name` }); return { claimed: false }; }
  const stale = await openStrategies(ctx, lease);
  const early = lease.state !== 'EXPIRED';
  ctx.log('claiming', { claimableForS: lease.now - openedAt, early, staleOnAqua: stale.length });
  const r = await claimCastle(ctx);
  if (!r.ok) return { claimed: false, reason: r.reason };
  claimedAt = Date.now();
  const after = await readLease(ctx.pc);
  ctx.log('claimed', { tx: r.hash, newEpoch: after.epoch, previousEpoch: lease.epoch, expiry: after.expiry, early, gapS: after.now - openedAt, staleOnAqua: stale.map((x) => x.strategyHash) });
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

// ---- Castle v3: heartbeats, challenge and respond ----

let beat = null;   // the holder's current co-signed heartbeat: { epoch, validUntil, heartbeat }

// The holder's liveness, off-chain: sign Heartbeat(epoch, validUntil = block time + HEARTBEAT_TTL_S), ask fo to
// co-sign it (fo withholds from a hung or off-market holder, and then fills wind down), and publish the 138 bytes to
// the castle service and logs/heartbeat.json. Re-signed once the current beat has less than HEARTBEAT_REFRESH_S left.
export async function heartbeatIfDue(ctx, lease) {
  if (lease.version !== 3 || !mine(ctx, lease) || lease.state !== 'LIVE' || lease.challenge.unanswered) return { due: false };
  if (beat && beat.epoch === String(lease.epoch) && beat.validUntil - lease.now >= HB_REFRESH_S) return { due: false };
  const hb = { chainId: await ctx.pc.getChainId(), castle: lease.castle, epoch: lease.epoch, validUntil: lease.now + HB_TTL_S };
  const holderSig = await signHeartbeat(ctx.account, hb);
  const fo = await fetch(`${FO_URL}/heartbeat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ epoch: String(hb.epoch), validUntil: hb.validUntil, holderSig, requester: ctx.id }),
  }).then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }), (e) => ({ ok: false, withheld: `fo unreachable: ${e.message}` }));
  if (!fo.ok || !fo.signature) {
    ctx.logChange('cosign', 'heartbeat-withheld', { reason: fo.withheld || fo.error || 'no signature', detail: fo.detail ?? null });
    return { due: true, beat: false, reason: fo.withheld || fo.error };
  }
  const heartbeat = packHeartbeat(hb.validUntil, holderSig, fo.signature);
  beat = { epoch: String(hb.epoch), validUntil: hb.validUntil, heartbeat };
  fs.mkdirSync(path.dirname(HEARTBEAT_FILE), { recursive: true });
  fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({ castle: lease.castle, holder: ctx.account.address, ...beat }));
  let published = 'off';
  if (CASTLE_SERVICE_URL !== 'off') {
    published = await fetch(`${CASTLE_SERVICE_URL}/heartbeat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ heartbeat, epoch: String(hb.epoch) }),
    }).then(async (r) => (r.ok ? 'ok' : `http ${r.status}: ${(await r.text()).slice(0, 160)}`), (e) => `unreachable: ${e.message}`);
  }
  ctx.logChange('cosign', 'heartbeat-cosigned', { ok: true });
  ctx.logChange('published', 'heartbeat-published', { published });
  ctx.log('heartbeat', { epoch: beat.epoch, validUntil: beat.validUntil, ttlS: HB_TTL_S, published });
  return { due: true, beat: true, validUntil: beat.validUntil, published };
}

// The latest co-signed heartbeat anyone can see: the castle service's, or this machine's logs/heartbeat.json when the
// service is off or out of reach. undefined when neither answers (then nobody should be challenged on it).
export async function heartbeatStatus() {
  if (CASTLE_SERVICE_URL !== 'off') {
    const j = await fetch(`${CASTLE_SERVICE_URL}/heartbeat`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null), () => null);
    if (j && j.epoch !== undefined) return { source: 'service', epoch: j.epoch === null ? null : String(j.epoch), validUntil: j.validUntil ?? null, heartbeat: j.heartbeat ?? null };
  }
  try { const j = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8')); return { source: 'file', epoch: String(j.epoch), validUntil: j.validUntil, heartbeat: j.heartbeat }; }
  catch { return undefined; }
}

// The holder answers a challenge on-chain: respond() before the deadline keeps the castle (and a 600s cooldown).
export async function respondIfChallenged(ctx, lease) {
  if (lease.version !== 3 || !mine(ctx, lease) || !lease.challenge.open) return { responded: false };
  ctx.log('challenged', { deadline: lease.challenge.deadline, secondsLeft: lease.challenge.deadline - lease.now });
  const r = await send(ctx, 'respond', []);
  if (r.ok) ctx.log('responded', { tx: r.hash, link: txLink(r.hash), deadline: lease.challenge.deadline });
  return { responded: r.ok, tx: r.hash };
}

const seenEpoch = { epoch: null, at: 0 };

// The standby's watch on a v3 holder: once the holder's last co-signed heartbeat expired CHALLENGE_SILENT_S ago (or
// none of this epoch appeared that long after its TTL), challenge(). The holder then has 60s to respond(); if it
// does not, standbyClaim takes the castle early. No challenge while the heartbeat source is unreachable.
export async function challengeIfSilent(ctx, lease) {
  if (lease.version !== 3 || lease.state !== 'LIVE' || mine(ctx, lease) || lease.expiry === 0) return { challenged: false };
  if (lease.challenge.deadline !== 0 || lease.now < lease.challenge.cooldownUntil) return { challenged: false };
  if (seenEpoch.epoch !== String(lease.epoch)) Object.assign(seenEpoch, { epoch: String(lease.epoch), at: lease.now });
  const hb = await heartbeatStatus();
  if (hb === undefined) { ctx.logChange('silence', 'heartbeat-unknown', { note: 'no heartbeat source reachable; not challenging' }); return { challenged: false }; }
  const lastValidUntil = hb.epoch === String(lease.epoch) && hb.validUntil ? Number(hb.validUntil) : seenEpoch.at + HB_TTL_S;
  const silentForS = lease.now - lastValidUntil;
  ctx.logChange('silence', 'holder-heartbeat', { silent: silentForS >= SILENT_AFTER_S, source: hb.source });
  if (silentForS < SILENT_AFTER_S) return { challenged: false };
  const isCrew = await ctx.pc.readContract({ address: lease.castle, abi: castleAbi(), functionName: 'isCrew', args: [ctx.account.address] });
  if (!isCrew) { ctx.logChange('crew', 'not-crew', { note: `Castle.isCrew(${ctx.id}) is false` }); return { challenged: false }; }
  const r = await send(ctx, 'challenge', []);
  if (!r.ok) return { challenged: false, reason: r.reason };
  const after = await readLease(ctx.pc);
  ctx.log('challenge-sent', { tx: r.hash, link: txLink(r.hash), holder: lease.holder, lastValidUntil, silentForS, deadline: after.challenge.deadline, source: hb.source });
  return { challenged: true, tx: r.hash, deadline: after.challenge.deadline };
}

export { errName, decodeErrorResult };
