// fi, the hot standby. Scaffold (p3-scaffold): watches fee's handoff heartbeat and the castle lease. The claim,
// dock, relink and re-ship on expiry land in p3-feefi. The lease is the authority: a missing heartbeat alone
// never triggers a claim, because Castle.claim() only succeeds after expiry anyway.
import { readLease } from '../lib/lease.mjs';

export default {
  intervalMs: 5_000,
  async tick(ctx) {
    const fee = await ctx.h.getAgent('fee').then((j) => j.agent || j);
    const lastSeen = fee.last_seen ? Date.parse(fee.last_seen) : NaN;
    const ageS = Number.isFinite(lastSeen) ? Math.round((Date.now() - lastSeen) / 1000) : null;
    ctx.logChange('fee-liveness', 'fee-liveness', { feeAlive: ageS !== null && ageS < 60 });
    const lease = await readLease(ctx.pc);
    if (!lease.deployed) return ctx.logChange('lease', 'lease', { deployed: false });
    ctx.logChange('lease', 'lease', { state: lease.state, holder: lease.holder, epoch: lease.epoch });
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
