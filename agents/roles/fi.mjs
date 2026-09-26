// fi, the hot standby (p3-feefi).
//
// fi acts on the lease, never on a missed heartbeat alone: Castle.claim() reverts while the lease is live, so
// fee's silence only shows in the logs. The moment block time passes expiry, fi takes the castle in one
// multicall: claim() (a new epoch, which fences the old shift's book), dock every strategy still on Aqua, and
// relink() castle.feefifofum.eth to fi's own crew name. From then on fi is the holder and runs the same loop as
// fee: renew with fo's seal, ship and re-centre the book on the ENS anchor.
//
// Demo switches (env): FI_CLAIM_DELAY_S holds the wind-down gap open that long after expiry, so a taker can fill
// reduce-only before the claim; FI_STALE=1 is a restart from stale state (fi was the holder, was killed, and fee
// took over): one unsimulated renew, which the chain rejects with a mined NotHolder.
import { readLease } from '../lib/lease.mjs';
import { renewIfDue, shipIfDue, standbyClaim, staleRenew } from '../lib/shift.mjs';
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
    if (mine) {
      await renewIfDue(ctx, lease);
      await shipIfDue(ctx, lease);
      return;
    }
    await standbyClaim(ctx, lease, { delayS: CLAIM_DELAY_S });
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
