// fee, the shift trader. Scaffold (p3-scaffold): watches the castle lease and reports it. The renew loop
// (fo's attestation + Castle.renew every 40s of a 120s lease) and the ship/re-ship via Castle.multicall land in
// p3-feefi.
import { readLease } from '../lib/lease.mjs';

export default {
  intervalMs: 10_000,
  async tick(ctx) {
    const lease = await readLease(ctx.pc);
    if (!lease.deployed) return ctx.logChange('lease', 'lease', { deployed: false, note: 'Castle not in contracts/deployments/sepolia.json yet (p1-deploy)' });
    ctx.logChange('lease', 'lease', { state: lease.state, holder: lease.holder, epoch: lease.epoch, mine: lease.holder.toLowerCase() === ctx.account.address.toLowerCase() });
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
