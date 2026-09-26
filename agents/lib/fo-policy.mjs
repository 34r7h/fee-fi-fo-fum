// fo's judgment, as a pure function so it can be tested without a chain: sign the renewal, or withhold it and
// say why. fo reads every input itself (lease from the chain, liveness from handoff, quote freshness from Aqua
// events). What the requester claims is only the expiry it wants.
export const DEFAULT_LIMITS = {
  deadlineS: 30,         // an unused attestation dies this fast
  heartbeatFreshS: 60,   // the trader counts as present if handoff saw its heartbeat this recently
  staleQuotesS: 300,     // ...but hung if the live epoch has gone this long without its first ship
  maxDeviationBps: 300,  // off-market: the live book's anchor sits more than 3% from the ENS anchor now
};

// Withhold reasons that are incidents fo publishes (the rest are ordinary refusals).
export const INCIDENT_REASONS = new Set(['trader-hang', 'off-market', 'stale-epoch-request']);

export function decide({ now, lease, request, trader = {}, quotes = {}, market = {}, limits = {} }) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const withhold = (reason, detail = {}) => ({ sign: false, reason, incident: INCIDENT_REASONS.has(reason), detail });

  if (!lease?.deployed) return withhold('no-castle');
  if (now >= lease.expiry) return withhold('lease-expired', { expiry: lease.expiry, note: 'renew would revert LeaseExpired; the next shift must claim()' });
  if (request.epoch !== undefined && BigInt(request.epoch) !== BigInt(lease.epoch)) {
    return withhold('stale-epoch-request', { requested: String(request.epoch), live: String(lease.epoch) });
  }
  const maxExpiry = now + Number(lease.leasePeriod);
  const expiry = Math.min(Number(request.expiry ?? maxExpiry), maxExpiry);
  if (expiry <= lease.expiry) return withhold('not-an-extension', { requested: expiry, current: lease.expiry });

  const heartbeatPresent = trader.heartbeatAgeS !== null && trader.heartbeatAgeS !== undefined && trader.heartbeatAgeS <= L.heartbeatFreshS;
  if (heartbeatPresent && quotes.ageS !== null && quotes.ageS !== undefined && quotes.ageS > L.staleQuotesS) {
    return withhold('trader-hang', { heartbeatAgeS: trader.heartbeatAgeS, quotesAgeS: quotes.ageS, staleQuotesS: L.staleQuotesS, holder: lease.holder, trader: trader.id });
  }
  if (market.deviationBps !== null && market.deviationBps !== undefined && Math.abs(market.deviationBps) > L.maxDeviationBps) {
    return withhold('off-market', { deviationBps: market.deviationBps, maxDeviationBps: L.maxDeviationBps, centre: market.centre, reference: market.reference });
  }
  return {
    sign: true,
    att: { epoch: BigInt(lease.epoch), expiry, deadline: now + L.deadlineS },
    checks: { heartbeatAgeS: trader.heartbeatAgeS ?? null, quotesAgeS: quotes.ageS ?? null, deviationBps: market.deviationBps ?? null },
  };
}

// Castle v3: co-sign the holder's Heartbeat(epoch, validUntil), or withhold and say why. Without fo's signature the
// fence runs no live curve, so a withheld co-signature winds the book down at once (v2 had to wait for expiry).
// The request itself shows the holder is alive; what fo judges is the lease, the signature and the book.
export function decideHeartbeat({ now, lease, request, quotes = {}, market = {}, limits = {}, maxTtlS = 120 }) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const withhold = (reason, detail = {}) => ({ sign: false, reason, incident: false, detail });

  if (!lease?.deployed) return withhold('no-castle');
  if (now >= lease.expiry) return withhold('lease-expired', { expiry: lease.expiry });
  if (lease.challenge?.unanswered) return withhold('holder-unresponsive', { challengeDeadline: lease.challenge.deadline });
  if (request.epoch === undefined || BigInt(request.epoch) !== BigInt(lease.epoch)) {
    return withhold('stale-epoch-request', { requested: request.epoch === undefined ? null : String(request.epoch), live: String(lease.epoch) });
  }
  if (!request.signer || request.signer.toLowerCase() !== String(lease.holder).toLowerCase()) {
    return withhold('not-the-holder', { signer: request.signer ?? null, holder: lease.holder });
  }
  const validUntil = Number(request.validUntil);
  if (!(validUntil > now && validUntil <= now + maxTtlS)) return withhold('bad-valid-until', { validUntil, now, maxTtlS });
  if (quotes.ageS !== null && quotes.ageS !== undefined && quotes.ageS > L.staleQuotesS) {
    return withhold('trader-hang', { quotesAgeS: quotes.ageS, staleQuotesS: L.staleQuotesS, holder: lease.holder });
  }
  if (market.deviationBps !== null && market.deviationBps !== undefined && Math.abs(market.deviationBps) > L.maxDeviationBps) {
    return withhold('off-market', { deviationBps: market.deviationBps, maxDeviationBps: L.maxDeviationBps, centre: market.centre, reference: market.reference });
  }
  return { sign: true, checks: { quotesAgeS: quotes.ageS ?? null, deviationBps: market.deviationBps ?? null } };
}
