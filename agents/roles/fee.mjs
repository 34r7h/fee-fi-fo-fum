// fee, the shift trader (p3-feefi).
//
// While fee holds a LIVE castle it renews every RENEW_EVERY_S (40s of a 120s lease) with fo's seal, and keeps
// the book on Aqua: it ships as soon as it holds the castle and re-centres on the ENS anchor every
// RESHIP_EVERY_S (Castle v2 builds the fenced program itself; lib/book.mjs checks the centre). If fo withholds,
// fee does not fight: the lease runs out, fills wind down, and fi claims.
//
// Demo switches (env):
//   FEE_STAGE_HANG=1   fee keeps its heartbeat and keeps asking for seals but stops shipping: a real hang, for
//                      fo to catch;
//   FEE_STALE=1        a restart from stale state: fee believes it still holds the castle and sends a renew
//                      without simulating it, so the chain rejects it with a mined, reverted tx;
//   FEE_FORCE_RENEW=1  when fo withholds the seal, fee signs the attestation itself and sends the renew anyway
//                      (once per epoch): Castle takes only fo's signature, so it reverts BadAttestation(fee);
//   FEE_STANDBY=1      fee is the standby for this shift (fi holds): it claims the castle once it has lapsed,
//                      FEE_CLAIM_DELAY_S after expiry, exactly as fi would.
import { readLease } from '../lib/lease.mjs';
import { renewIfDue, send, claimCastle, shipIfDue, standbyClaim, staleRenew } from '../lib/shift.mjs';
import { signAttestation } from '../lib/attest.mjs';
import { env } from '../lib/env.mjs';

const STALE = env('FEE_STALE') === '1';
const FORCE = env('FEE_FORCE_RENEW') === '1';
const HANG = env('FEE_STAGE_HANG') === '1';
const STANDBY = env('FEE_STANDBY') === '1';
const CLAIM_DELAY_S = Number(env('FEE_CLAIM_DELAY_S', 0));
let staleShot = false;
let forcedEpoch = null;

// Demo (p3-fo): fo withheld, so fee forges its own seal on the live epoch and sends it unsimulated.
async function forgedRenew(ctx, lease, withheld) {
  forcedEpoch = lease.epoch;
  const att = { chainId: await ctx.pc.getChainId(), castle: lease.castle, epoch: lease.epoch, expiry: lease.now + lease.leasePeriod, deadline: lease.now + 30 };
  const signature = await signAttestation(ctx.account, att);
  const r = await send(ctx, 'renew', [BigInt(att.expiry), BigInt(att.deadline), signature], { force: true });
  ctx.log('forced-renew', { withheld, mined: r.mined, ok: r.ok, reason: r.reason ?? null, tx: r.hash || null });
}

export default {
  intervalMs: 5_000,
  async init(ctx) {
    ctx.log('fee-mode', { stageHang: HANG, stale: STALE, forceRenew: FORCE, standby: STANDBY, claimDelayS: CLAIM_DELAY_S });
  },
  async tick(ctx) {
    const lease = await readLease(ctx.pc);
    if (!lease.deployed) return ctx.logChange('lease', 'lease', { deployed: false, note: 'Castle not in contracts/deployments/sepolia.json yet (p1-deploy)' });
    const mine = lease.holder.toLowerCase() === ctx.account.address.toLowerCase();
    ctx.logChange('lease', 'lease', { state: lease.state, epoch: lease.epoch, mine, holder: lease.holder });

    if (STALE && !staleShot) {
      // Demo (d): fee comes back believing it still holds the castle: one unsimulated renew, rejected on-chain.
      staleShot = true;
      await staleRenew(ctx, lease);
      return;
    }
    if (lease.expiry === 0) {
      // Genesis: the castle has never been claimed. The first shift is fee's (fi only claims after a real expiry).
      const r = await claimCastle(ctx);
      return ctx.log('genesis-claim', { ok: r.ok, tx: r.hash || null, reason: r.reason || null });
    }
    if (STANDBY && !mine) { await standbyClaim(ctx, lease, { delayS: CLAIM_DELAY_S }); return; }
    const r = await renewIfDue(ctx, lease);
    if (FORCE && r.due && !r.renewed && r.reason && lease.state === 'LIVE' && forcedEpoch !== lease.epoch) await forgedRenew(ctx, lease, r.reason);
    if (!HANG) await shipIfDue(ctx, lease);
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
