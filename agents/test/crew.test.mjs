// node --test agents/test/crew.test.mjs
// The crew's pure rules: fi's programs and sizing, fum's leverage rule (docs/SPEC.md 09caa66), and the signed
// report format the castle service checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { harp, hen, decode, kindOf } from '../lib/programs.mjs';
import { overLimit } from '../roles/fum.mjs';
import { room, balanced } from '../roles/fi.mjs';
import { canonical, reportMessage } from '../lib/report.mjs';

const PRICE_EX = '0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757';
const H = 'a'.repeat(64);

test('harp is Extruction(PriceExtruction): opcode 32, 20 bytes of address', () => {
  assert.equal(harp(PRICE_EX).toLowerCase(), `0x2014${PRICE_EX.slice(2).toLowerCase()}`);
  assert.equal(kindOf(harp(PRICE_EX)), 'harp');
});

test('hen is flatFee (opcode 21, uint32 in 1e9 = 100%) then XYCSwap (opcode 17)', () => {
  assert.equal(hen(30), '0x1504002dc6c01100');   // 30 bps = 3,000,000 / 1e9
  const ops = decode(hen(30)).map((i) => i.opcode);
  assert.deepEqual(ops, [21, 17]);
  assert.equal(kindOf(hen(30)), 'hen');
});

// A ledger as lib/vault.mjs reads it, for one token pair.
const ledger = ({ balance, committed, lev = 20_000, live = ['harp', 'hen'] }) => ({
  tokens: {
    WETH: { balance, committed, headroom: (balance * BigInt(lev)) / 10_000n - committed, leverageBps: lev },
    USDC: { balance, committed, headroom: (balance * BigInt(lev)) / 10_000n - committed, leverageBps: lev },
  },
  slots: ['harp', 'hen', 'greedy'].map((name, slot) => ({ slot, name, hash: live.includes(name) ? `0x${String(slot).repeat(64)}` : null, cap: { WETH: balance, USDC: balance }, alloc: null })),
});

test('fum: harp and hen at 80% each (1.6x) sit inside 2x: no dock', () => {
  assert.equal(overLimit(ledger({ balance: 1000n, committed: 1600n })), null);
});

test('fum: one promise larger than the balance is shared liquidity, not a reason to dock', () => {
  assert.equal(overLimit(ledger({ balance: 1000n, committed: 1500n, live: ['hen'] })), null);
});

test('fum: fills that push committed past balance x leverage dock the lowest priority first', () => {
  // harp sold 500 of 1000: balance 500, limit 1000, committed 1100.
  const over = overLimit(ledger({ balance: 500n, committed: 1100n }));
  assert.equal(over.token, 'WETH');
  assert.equal(over.limit, 1000n);
  assert.equal(over.victim.name, 'harp');
  assert.equal(overLimit(ledger({ balance: 500n, committed: 1100n, live: ['harp', 'hen', 'greedy'] })).victim.name, 'greedy');
  assert.equal(overLimit(ledger({ balance: 500n, committed: 1100n, live: ['hen'] })).victim.name, 'hen');
});

test('fi: a promise is the least of the cap, the headroom and 80% of the balance', () => {
  const l = ledger({ balance: 1000n, committed: 0n });
  assert.deepEqual(room(l, 0), { WETH: 800n, USDC: 800n });
  const tight = ledger({ balance: 1000n, committed: 1500n });   // headroom 500
  assert.deepEqual(room(tight, 1), { WETH: 500n, USDC: 500n });
});

test('fi: hen ships both sides in the mid ratio, so its curve starts at the price', () => {
  const mid = 268_963_000_000n;                                  // 2689.63 USDC per WETH, 8 decimals
  const r = { WETH: 1_487_193_405_784_438n, USDC: 4_000_000n };  // 80% of 5 USDC and 5/mid WETH
  const b = balanced(r, mid);
  assert.ok(b.WETH <= r.WETH && b.USDC <= r.USDC);
  const price = Number((b.USDC * 10n ** 20n) / b.WETH) / 1e8;   // USDC per WETH from the two sides
  assert.ok(Math.abs(price - 2689.63) < 0.01, `hen's curve prices ${price}`);
});

test('reports: canonical JSON sorts keys at every depth and writes bigints as strings', () => {
  assert.equal(canonical({ b: 1, a: { d: 2n, c: [3, { f: 1, e: 0 }] } }), '{"a":{"c":[3,{"e":0,"f":1}],"d":"2"},"b":1}');
});

test('reports: the signed message recovers to the agent key (what service/src/report.mjs checks)', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const body = { agent: 'fee', type: 'price', t: 1790425000000, data: { spreadBps: 10, mid: '2689.63' } };
  const message = reportMessage(body);
  assert.equal(message, 'castle-report/1\nfee\nprice\n1790425000000\n{"mid":"2689.63","spreadBps":10}');
  const sig = await account.signMessage({ message });
  assert.ok(await verifyMessage({ address: account.address, message, signature: sig }));
});
