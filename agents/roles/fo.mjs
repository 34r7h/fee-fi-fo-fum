// fo, the fencer and witness. agy owns fo's logic (p3-fo): EIP-712 attestations over ICastleLease.Attestation,
// fill replay and incident posts. This scaffold only keeps fo alive on handoff and reports the lease, so agy
// can build on the same runtime (signed client, viem, listener, heartbeat).
import { readLease } from '../lib/lease.mjs';

export default {
  intervalMs: 10_000,
  async tick(ctx) {
    const lease = await readLease(ctx.pc);
    ctx.logChange('lease', 'lease', lease.deployed ? { state: lease.state, epoch: lease.epoch } : { deployed: false });
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
