// fi, the hot standby (p3-feefi).
//
// fi acts on the lease. On v2, Castle.claim() reverts while the lease is live, so fee's silence only shows in the
// logs until block time passes expiry. On v3 the lease is a day long and liveness is the co-signed heartbeat: once
// the holder's heartbeat has been expired CHALLENGE_SILENT_S, fi calls challenge(), and if the holder does not
// respond() within 60s the castle is claimable early. Either way fi takes it in one multicall: claim() (a new epoch,
// which fences the old shift's book), dock every strategy still on Aqua, and relink() castle.feefifofum.eth to fi's
// own crew name. From then on fi is the holder and runs the same loop as fee: heartbeat, renew with fo's seal, ship
// and re-centre the book on the ENS anchor.
//
// Demo switches (env): FI_CLAIM_DELAY_S holds the wind-down gap open that long after expiry, so a taker can fill
// reduce-only before the claim; FI_STALE=1 is a restart from stale state (fi was the holder, was killed, and fee
// took over): one unsimulated renew, which the chain rejects with a mined NotHolder.
import { readLease } from '../lib/lease.mjs';
import { renewIfDue, shipIfDue, standbyClaim, staleRenew, heartbeatIfDue, respondIfChallenged, challengeIfSilent } from '../lib/shift.mjs';
import { env } from '../lib/env.mjs';

const CLAIM_DELAY_S = Number(env('FI_CLAIM_DELAY_S', 0));
const STALE = env('FI_STALE') === '1';
let staleShot = false;

export default {
  intervalMs: 3_000,
  async tick(ctx) {
    const lease = await readLease(ctx.pc);
    if (!lease.deployed) return ctx.logChange('lease', 'lease', { deployed: false });
    const mine = lease.holder.toLowerCase() === ctx.account.address.toLowerCase();
    ctx.logChange('lease', 'lease', { state: lease.state, epoch: lease.epoch, mine, holder: lease.holder });

    const fee = await ctx.h.getAgent('fee').then((j) => j.agent || j).catch(() => null);
    const ageS = fee?.last_seen ? Math.round((Date.now() - Date.parse(fee.last_seen)) / 1000) : null;
    ctx.logChange('fee-liveness', 'fee-liveness', { feeAlive: ageS !== null && ageS < 60 });

    if (STALE && !staleShot) { staleShot = true; await staleRenew(ctx, lease); return; }
    if (mine && lease.state === 'LIVE') {
      // v3: answer a challenge first (60s window), then keep the heartbeat current.
      await respondIfChallenged(ctx, lease);
      await heartbeatIfDue(ctx, lease);
      // Re-centre before renewing: fo withholds the seal from a book the ENS anchor has moved off.
      await shipIfDue(ctx, lease);
      await renewIfDue(ctx, lease);
      return;
    }
    // Standby, or back after its own lease lapsed: challenge a silent v3 holder, and claim once the castle is claimable.
    await challengeIfSilent(ctx, lease);
    await standbyClaim(ctx, lease, { delayS: CLAIM_DELAY_S });
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
