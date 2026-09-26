// Unit and integration test for fo (p3-fo).
import assert from 'node:assert/strict';
import { loadEnv } from '../lib/env.mjs';
loadEnv();
import { loadAccount, walletClient } from '../lib/chain.mjs';
import foRole from '../roles/fo.mjs';
import { attestationSigner } from '../lib/attest.mjs';

const foAccount = loadAccount('fo');
const wallet = walletClient(foAccount);
const dummyCastle = '0x0000000000000000000000000000000000CA571E';

console.log('Testing fo role logic...');

const sentMessages = [];
const loggedEvents = [];

const mockCtx = {
  account: foAccount,
  wallet,
  crew: { chain_id: 31337 },
  pc: {
    chain: { id: 31337 },
    getChainId: async () => 31337,
    readContract: async () => { throw new Error('not deployed'); },
    getBlock: async () => ({ number: 100n, timestamp: 1000n }),
  },
  deployments: () => ({ contracts: { castle: dummyCastle } }),
  h: {
    agentId: 'fo',
    send: async (to, text) => {
      sentMessages.push({ to, text });
      return { ok: true };
    },
    call: async (method, path, body) => {
      return { ok: true, envelope_id: 'env_mock' };
    },
    getAgent: async () => ({ last_seen: new Date().toISOString() }),
  },
  log: (event, data) => {
    loggedEvents.push({ event, data });
  },
  logChange: () => {},
};

// 1. Test normal attestation grant
console.log('Case 1: Grant attestation when healthy');
const now = Math.floor(Date.now() / 1000);
await foRole.onMessage(mockCtx, {
  from: 'fee',
  kind: 'attestation.request',
  epoch: 1,
  expiry: now + 60,
  deadline: now + 30,
});

const grantMsg = sentMessages.find((m) => m.to === 'fee');
assert(grantMsg, 'fee should have received a response');
const grantParsed = JSON.parse(grantMsg.text);
assert.equal(grantParsed.kind, 'attestation.granted');
assert(grantParsed.foSig, 'should include foSig');

// Verify signature matches fo's key
const recovered = await attestationSigner({
  chainId: 31337,
  castle: dummyCastle,
  epoch: 1n,
  expiry: BigInt(now + 60),
  deadline: BigInt(grantParsed.deadline),
}, grantParsed.foSig);
assert.equal(recovered.toLowerCase(), foAccount.address.toLowerCase());
console.log('✓ Normal attestation verified and recovers fo address:', recovered);

// 2. Test staged hang
console.log('Case 2: Stage a hang and verify withholding');
sentMessages.length = 0;
await foRole.onMessage(mockCtx, {
  from: 'operator',
  kind: 'stage.hang',
  content: { enabled: true },
});

// Now fee asks for attestation while hang is active
await foRole.onMessage(mockCtx, {
  from: 'fee',
  kind: 'attestation.request',
  epoch: 1,
  expiry: now + 60,
  deadline: now + 30,
});

const rejectMsg = sentMessages.find((m) => m.to === 'fee');
assert(rejectMsg, 'fee should have received rejection');
const rejectParsed = JSON.parse(rejectMsg.text);
assert.equal(rejectParsed.kind, 'attestation.rejected');
assert.equal(rejectParsed.reason, 'trader-hang');
console.log('✓ Attestation withheld correctly: reason =', rejectParsed.reason);

// Check that incident was posted
const incidentLog = loggedEvents.find((e) => e.event === 'incident-posted');
assert(incidentLog, 'incident-posted event should be logged');
console.log('✓ Incident logged to channel:', incidentLog.data);

console.log('ALL FO TESTS PASSED!');
