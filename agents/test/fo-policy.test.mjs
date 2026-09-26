// fo's judgment, case by case (lib/fo-policy.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, DEFAULT_LIMITS } from '../lib/fo-policy.mjs';

const now = 1_000_000;
const lease = { deployed: true, epoch: 7n, expiry: now + 50, leasePeriod: 120, holder: '0xFEE' };
const healthy = { trader: { id: 'fee', heartbeatAgeS: 5 }, quotes: { ageS: 20 }, market: {} };

test('healthy trader: signs, clamps the expiry to now + leasePeriod, short deadline, live epoch', () => {
  const d = decide({ now, lease, request: { expiry: now + 999 }, ...healthy });
  assert.equal(d.sign, true);
  assert.equal(d.att.expiry, now + 120);
  assert.equal(d.att.deadline, now + DEFAULT_LIMITS.deadlineS);
  assert.equal(d.att.epoch, 7n);
});

test('no Castle yet: withholds', () => {
  assert.equal(decide({ now, lease: { deployed: false }, request: {}, ...healthy }).reason, 'no-castle');
});

test('expired lease: withholds (renew would revert LeaseExpired; the next shift must claim)', () => {
  const d = decide({ now, lease: { ...lease, expiry: now - 1 }, request: {}, ...healthy });
  assert.deepEqual([d.sign, d.reason, d.incident], [false, 'lease-expired', false]);
});

test('request for an old epoch: withholds and reports it (a stale shift is asking)', () => {
  const d = decide({ now, lease, request: { epoch: 6 }, ...healthy });
  assert.deepEqual([d.sign, d.reason, d.incident], [false, 'stale-epoch-request', true]);
});

test('an expiry that does not extend the lease: withholds (replay-shaped)', () => {
  const d = decide({ now, lease, request: { expiry: now + 40 }, ...healthy });
  assert.equal(d.reason, 'not-an-extension');
});

test('hang: heartbeat present but the book has not shipped for staleQuotesS: withholds and reports', () => {
  const d = decide({ now, lease, request: {}, trader: { id: 'fee', heartbeatAgeS: 5 }, quotes: { ageS: DEFAULT_LIMITS.staleQuotesS + 1 }, market: {} });
  assert.deepEqual([d.sign, d.reason, d.incident], [false, 'trader-hang', true]);
  assert.equal(d.detail.trader, 'fee');
});

test('stale book but NO heartbeat is not a hang (the trader is dead; the lease lapses on its own)', () => {
  const d = decide({ now, lease, request: {}, trader: { id: 'fee', heartbeatAgeS: 600 }, quotes: { ageS: 600 }, market: {} });
  assert.equal(d.reason === 'trader-hang', false);
});

test('off-market centre beyond maxDeviationBps: withholds and reports', () => {
  const d = decide({ now, lease, request: {}, ...healthy, market: { deviationBps: 450, centre: 2500, reference: 2390 } });
  assert.deepEqual([d.sign, d.reason, d.incident], [false, 'off-market', true]);
});

test('limits are overridable (FO_STALE_QUOTES_S for a fast staged hang)', () => {
  const d = decide({ now, lease, request: {}, trader: { heartbeatAgeS: 5 }, quotes: { ageS: 31 }, market: {}, limits: { staleQuotesS: 30 } });
  assert.equal(d.reason, 'trader-hang');
});
