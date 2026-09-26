// Castle v3's heartbeat must be what the fence checks: the digest CastleHelpers._heartbeat signs (Castle.heartbeatDigest,
// Castle's EIP-712 domain, Heartbeat(uint256 epoch,uint64 validUntil)) and the 138-byte validUntil|holderSig|foSig.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, keccak256, toBytes, concat, slice } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { heartbeatDigest, signHeartbeat, heartbeatSigner, packHeartbeat, unpackHeartbeat, HEARTBEAT_LENGTH } from '../lib/heartbeat.mjs';
import { decideHeartbeat } from '../lib/fo-policy.mjs';
import { CASTLE_DOMAIN_NAME, CASTLE_DOMAIN_VERSION } from '../lib/attest.mjs';

const holder = privateKeyToAccount('0x000000000000000000000000000000000000000000000000000000000000f00d');
const fo = privateKeyToAccount('0x00000000000000000000000000000000000000000000000000000000000a11ce');
const hb = { chainId: 11155111, castle: '0xADB3cBb0983C1E061c550F2c0BbEdF131fFC8936', epoch: 1n, validUntil: 1_790_400_090 };

function solidityDigest({ chainId, castle, epoch, validUntil }) {
  const domainSeparator = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
    [keccak256(toBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')), keccak256(toBytes(CASTLE_DOMAIN_NAME)), keccak256(toBytes(CASTLE_DOMAIN_VERSION)), BigInt(chainId), castle],
  ));
  const structHash = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }, { type: 'uint64' }], [keccak256(toBytes('Heartbeat(uint256 epoch,uint64 validUntil)')), BigInt(epoch), BigInt(validUntil)]));
  return keccak256(concat(['0x1901', domainSeparator, structHash]));
}

test('digest equals the Solidity construction (Heartbeat typehash under the Castle domain)', () => {
  assert.equal(heartbeatDigest(hb), solidityDigest(hb));
});

test('138 bytes: validUntil (8, big-endian) | holder r,s,v (65) | fo r,s,v (65), and both recover', async () => {
  const h = await signHeartbeat(holder, hb), f = await signHeartbeat(fo, hb);
  const packed = packHeartbeat(hb.validUntil, h, f);
  assert.equal((packed.length - 2) / 2, HEARTBEAT_LENGTH);
  assert.equal(BigInt(slice(packed, 0, 8)), BigInt(hb.validUntil));
  const u = unpackHeartbeat(packed);
  assert.equal(u.validUntil, hb.validUntil);
  assert.equal(await heartbeatSigner(hb, u.holderSig), holder.address);
  assert.equal(await heartbeatSigner(hb, u.foSig), fo.address);
});

test('a renew attestation signature is not a heartbeat signature', async () => {
  const { signAttestation } = await import('../lib/attest.mjs');
  const sig = await signAttestation(fo, { chainId: hb.chainId, castle: hb.castle, epoch: hb.epoch, expiry: hb.validUntil, deadline: hb.validUntil });
  assert.notEqual(await heartbeatSigner(hb, sig), fo.address);
});

const now = 1_000_000;
const lease = { deployed: true, epoch: 3n, expiry: now + 80_000, holder: holder.address, challenge: { deadline: 0, unanswered: false } };
const ok = { epoch: '3', validUntil: now + 90, signer: holder.address };

test('fo co-signs a live holder with a fresh book', () => {
  assert.equal(decideHeartbeat({ now, lease, request: ok, quotes: { ageS: null }, market: { deviationBps: 0 } }).sign, true);
});

test('fo withholds: wrong signer, stale epoch, too far ahead, expired lease, unanswered challenge, hang, off-market', () => {
  const r = (over, extra = {}) => decideHeartbeat({ now, lease: { ...lease, ...over.lease }, request: { ...ok, ...over.request }, ...extra }).reason;
  assert.equal(r({ request: { signer: fo.address } }), 'not-the-holder');
  assert.equal(r({ request: { epoch: '2' } }), 'stale-epoch-request');
  assert.equal(r({ request: { validUntil: now + 121 } }), 'bad-valid-until');
  assert.equal(r({ request: { validUntil: now } }), 'bad-valid-until');
  assert.equal(r({ lease: { expiry: now } }), 'lease-expired');
  assert.equal(r({ lease: { challenge: { deadline: now - 1, unanswered: true } } }), 'holder-unresponsive');
  assert.equal(r({}, { quotes: { ageS: 301 } }), 'trader-hang');
  assert.equal(r({}, { market: { deviationBps: 301 } }), 'off-market');
});
