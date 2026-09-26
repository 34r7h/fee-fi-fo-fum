// fum, the auctioneer. Scaffold (p3-scaffold): reports the lease. Opening the shift-change and dissolution
// CCAs, checkpoint, sweepCurrency and the setData write-back of the clearing price land in p3-fum.
import { readLease } from '../lib/lease.mjs';

export default {
  intervalMs: 15_000,
  async tick(ctx) {
    const lease = await readLease(ctx.pc);
    ctx.logChange('lease', 'lease', lease.deployed ? { state: lease.state, epoch: lease.epoch } : { deployed: false });
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
