// fo's seal must match what Castle verifies: the same digest FoAttestation.t.sol builds by hand in Solidity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, keccak256, toBytes, concat } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { attestationDigest, signAttestation, attestationSigner, CASTLE_DOMAIN_NAME, CASTLE_DOMAIN_VERSION } from '../lib/attest.mjs';

const fo = privateKeyToAccount('0x00000000000000000000000000000000000000000000000000000000000a11ce');
const att = { chainId: 11155111, castle: '0x0000000000000000000000000000000000ca571e', epoch: 1n, expiry: 1_790_400_120, deadline: 1_790_400_060 };

// The Solidity side, line for line (contracts/test/FoAttestation.t.sol).
function solidityDigest({ chainId, castle, epoch, expiry, deadline }) {
  const domainSeparator = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
    [keccak256(toBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')), keccak256(toBytes(CASTLE_DOMAIN_NAME)), keccak256(toBytes(CASTLE_DOMAIN_VERSION)), BigInt(chainId), castle],
  ));
  const structHash = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'uint64' }, { type: 'uint64' }],
    [keccak256(toBytes('Attestation(uint256 epoch,uint64 expiry,uint64 deadline)')), BigInt(epoch), BigInt(expiry), BigInt(deadline)],
  ));
  return keccak256(concat(['0x1901', domainSeparator, structHash]));
}

test('digest equals the Solidity construction (domain "fee-fi-fo-fum Castle" v1, Attestation typehash)', () => {
  assert.equal(attestationDigest(att), solidityDigest(att));
});

test('signature is 65-byte r||s||v and recovers to fo', async () => {
  const sig = await signAttestation(fo, att);
  assert.equal((sig.length - 2) / 2, 65);
  assert.equal(await attestationSigner(att, sig), fo.address);
});

test('the seal binds epoch, expiry, deadline and the Castle: changing any one breaks recovery', async () => {
  const sig = await signAttestation(fo, att);
  for (const tweak of [{ epoch: 2n }, { expiry: att.expiry + 1 }, { deadline: att.deadline + 1 }, { castle: '0x0000000000000000000000000000000000ca571f' }, { chainId: 1 }]) {
    assert.notEqual(await attestationSigner({ ...att, ...tweak }, sig), fo.address, JSON.stringify(tweak, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
  }
});
