// fi, the hot standby (p3-feefi).
//
// fi acts on the lease, never on a missed heartbeat alone: Castle.claim() reverts while the lease is live, so
// fee's silence only shows in the logs. The moment block time passes expiry, fi takes the castle in one
// multicall: claim() (a new epoch, which fences the old shift's book), dock every strategy still on Aqua, and
// relink() castle.feefifofum.eth to fi's own crew name. From then on fi is the holder and runs the same loop as
// fee: renew with fo's seal, ship and re-centre the book on the ENS anchor.
import { readLease } from '../lib/lease.mjs';
import { renewIfDue, claimCastle, shipIfDue, openStrategies } from '../lib/shift.mjs';
import { abi } from '../lib/chain.mjs';
import { env } from '../lib/env.mjs';

// Demo only: leave the wind-down gap open this long after expiry, so a taker can fill reduce-only before the claim.
const CLAIM_DELAY_S = Number(env('FI_CLAIM_DELAY_S', 0));

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

    if (mine) {
      await renewIfDue(ctx, lease);
      await shipIfDue(ctx, lease);
      return;
    }
    if (lease.state !== 'EXPIRED' || lease.expiry === 0) return;   // expiry 0: never claimed, genesis is fee's
    if (lease.now - lease.expiry < CLAIM_DELAY_S) return ctx.logChange('gap', 'wind-down-gap', { expiredForS: lease.now - lease.expiry, claimAfterS: CLAIM_DELAY_S });
    // Castle v2 crew: an operator-set crew label AND that name owned, unexpired, in the agent registry.
    const isCrew = await ctx.pc.readContract({ address: lease.castle, abi: abi('Castle'), functionName: 'isCrew', args: [ctx.account.address] });
    if (!isCrew) return ctx.logChange('crew', 'not-crew', { note: 'Castle.isCrew(fi) is false: the operator must setCrew(fi, "fi") and fi must own fi.feefifofum.eth' });
    const stale = await openStrategies(ctx, lease);
    ctx.log('claiming', { expiredForS: lease.now - lease.expiry, docking: stale.length });
    const r = await claimCastle(ctx, { dock: stale });
    if (r.ok) {
      const after = await readLease(ctx.pc);
      ctx.log('claimed', { tx: r.hash, newEpoch: after.epoch, previousEpoch: lease.epoch, expiry: after.expiry, gapS: after.now - lease.expiry, docked: stale.length });
    }
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
