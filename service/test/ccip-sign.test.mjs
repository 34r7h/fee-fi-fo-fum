// node --test service/test/ccip-sign.test.mjs
// Fixed vectors for lib/ccip-sign.mjs. contracts/test/OffchainQuoteResolver.t.sol (testVectors_*) asserts the SAME
// digests, signatures and takerTraitsAndData, computed independently in Solidity (OffchainQuoteResolver,
// OZ EIP712 hashing, vm.sign, TakerTraitsLib.build), so the two sides agree byte for byte.
// VECTORS=1 prints them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, keccak256, parseAbi, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as C from '../lib/ccip-sign.mjs';

// A throwaway test key (keccak256("ccip-test-signer")), never funded on any chain.
const PK = keccak256(toBytes('ccip-test-signer'));
const SIGNER = privateKeyToAccount(PK).address;
const TARGET = '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f';
const NAME = 'quote.feefifofum.eth';
const KEY = 'quote:USDC:WETH:1000000';
const EXPIRES = 1790440030n;
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const DOMAIN = C.priceExtructionDomain('0x00000000000000000000000000000000000000E7');
const QUOTE = {
  strategyHash: keccak256(toBytes('harp')), tokenIn: USDC, tokenOut: WETH,
  priceQ96: 29710560942849126597578981379000000000n, maxAmountIn: 1000000000000n, validUntil: EXPIRES,
};

const RESOLVE = parseAbi(['function resolve(bytes name, bytes data) view returns (bytes)']);
const dns = C.dnsEncodeName(NAME);
const inner = C.encodeTextCall(NAME, KEY);
const request = encodeFunctionData({ abi: RESOLVE, functionName: 'resolve', args: [dns, inner] });
const result = C.encodeRecordResult('text', 'hello');

// Expected values, shared with the Solidity test.
const V = {
  signer: '0xea38A102892bd4d043C3607B446925AE1A8b05E0',
  signatureHash: '0xbad4f3282fe48ced2535f5bfea3faf65e6109f7e2fe247a66b7a6b9cc67a0644',
  ccipSig: '0x9b88390625e889db57c2ea99ca916e887663ed14cca47e2170cd0638b0b0a63b0a9d65d54594f3517357b51e775426f5e3c2a26c1a13633a34a38b969097795d1c',
  quoteDigest: '0x8c2c6ed041892effb2f1be92d2f29416f08e7d6f9a888bc06a31addee4949cbe',
  quoteSig: '0xdd4896068ef9c416d93ba82dda744c5fa85fc278463db99c2c2c6731b6b2faeb17196342370ebffb51a2695b62f33146686ecc46f61c07de7c452d33dfbbb27c1c',
  amountOut: 375000000000000n,
  takerTraitsHash: '0x77546419742ba2c9f0a83eb73d3dec59c872f10d12627d7a1407ddf1e6b48667',
};

test('vectors', async () => {
  const got = {
    signer: SIGNER,
    signatureHash: C.makeSignatureHash(TARGET, EXPIRES, request, result),
    ccipSig: await C.signCcipResponse({ target: TARGET, request, result, expires: EXPIRES, privateKey: PK }),
    quoteDigest: C.quoteDigest(DOMAIN, QUOTE),
    quoteSig: await C.signQuote(DOMAIN, QUOTE, PK),
    amountOut: C.quoteAmountOut(1000000n, QUOTE.priceQ96),
  };
  got.takerTraitsHash = keccak256(C.buildTakerTraitsAndData(QUOTE, got.quoteSig, got.amountOut));
  if (process.env.VECTORS) console.log({ dns, request, result, ...got, takerTraits: C.buildTakerTraitsAndData(QUOTE, got.quoteSig, got.amountOut) });
  assert.deepEqual(got, V);
});

test('dns name round trip', () => {
  assert.equal(dns, '0x0571756f74650a6665656669666f66756d0365746800');
  assert.equal(C.dnsDecodeName(dns), NAME);
});

test('decodeCcipRequest: GET path, full URL and POST body agree', () => {
  const path = `/ccip/${TARGET.toLowerCase()}/${request}.json`;
  for (const input of [path, `https://handoff.lol/t/castle${path}`, { sender: TARGET, data: request }, JSON.stringify({ sender: TARGET, data: request })]) {
    const r = C.decodeCcipRequest(input);
    assert.equal(r.sender, TARGET);
    assert.equal(r.request, request);
    assert.equal(r.name, NAME);
    assert.equal(r.dnsName, dns);
    assert.equal(r.record.functionName, 'text');
    assert.equal(r.key, KEY);
  }
  assert.throws(() => C.decodeCcipRequest('/ccip/nope'));
});

test('parseRecordKey', () => {
  assert.deepEqual(C.parseRecordKey(KEY), { kind: 'quote', tokenIn: 'USDC', tokenOut: 'WETH', amountIn: 1000000n });
  assert.deepEqual(C.parseRecordKey('castle'), { kind: 'castle' });
  for (const bad of ['quote:USDC:USDC:1', 'quote:USDC:WETH:0', 'quote:DAI:WETH:1', 'quote:USDC:WETH:-1', 'quote:USDC:WETH', '', undefined]) {
    assert.equal(C.parseRecordKey(bad), null, String(bad));
  }
});

test('gateway response: sign, encode, verify; wrong signer and expiry are caught', async () => {
  const sig = await C.signCcipResponse({ target: TARGET, request, result, expires: EXPIRES, privateKey: PK });
  const response = C.encodeCcipResponse({ result, expires: EXPIRES, sig });
  const ok = await C.verifyCcipResponse({ target: TARGET, request, response, signers: [SIGNER], now: Number(EXPIRES) });
  assert.equal(ok.valid, true);
  assert.equal(ok.signer, SIGNER);
  assert.equal(ok.result, result);
  const late = await C.verifyCcipResponse({ target: TARGET, request, response, signers: [SIGNER], now: Number(EXPIRES) + 1 });
  assert.equal(late.valid, false);
  const other = await C.verifyCcipResponse({ target: TARGET, request, response, signers: [TARGET], now: 0 });
  assert.equal(other.valid, false);
  // a different request (another key) does not verify under the same signature
  const request2 = encodeFunctionData({ abi: RESOLVE, functionName: 'resolve', args: [dns, C.encodeTextCall(NAME, 'quote:USDC:WETH:2000000')] });
  const moved = await C.verifyCcipResponse({ target: TARGET, request: request2, response, signers: [SIGNER], now: 0 });
  assert.equal(moved.valid, false);
});

test('quote: sign, verify, record round trip', async () => {
  const quoteSig = await C.signQuote(DOMAIN, QUOTE, PK);
  assert.equal((await C.verifyQuote(DOMAIN, QUOTE, quoteSig, { expectedSigner: SIGNER, now: Number(EXPIRES) })).valid, true);
  assert.equal((await C.verifyQuote(DOMAIN, QUOTE, quoteSig, { expectedSigner: SIGNER, now: Number(EXPIRES) + 1 })).valid, false);
  assert.equal((await C.verifyQuote(DOMAIN, { ...QUOTE, priceQ96: QUOTE.priceQ96 + 1n }, quoteSig, { expectedSigner: SIGNER, now: 0 })).valid, false);
  const amountOut = C.quoteAmountOut(1000000n, QUOTE.priceQ96);
  const text = C.buildQuoteRecord({
    id: 'q-1', chainId: 11155111, router: '0xeDB6933949dB941D495b23604818F9AbF55e70f9',
    order: { maker: TARGET, traits: 1n << 254n, data: '0x21' }, quote: QUOTE, amountIn: 1000000n, amountOut, signer: SIGNER, quoteSig,
  });
  assert.equal(text.includes('\n'), false);
  assert.deepEqual(Object.keys(JSON.parse(text)), ['v', 'id', 'chainId', 'router', 'order', 'strategyHash', 'tokenIn', 'tokenOut', 'amountIn', 'amountOut', 'priceQ96', 'maxAmountIn', 'validUntil', 'signer', 'quoteSig', 'takerTraitsAndData']);
  const r = C.parseQuoteRecord(text);
  assert.equal((await C.verifyQuote(DOMAIN, r.quote, r.quoteSig, { expectedSigner: SIGNER, now: 0 })).valid, true);
  assert.equal(r.takerTraitsAndData, C.buildTakerTraitsAndData(QUOTE, quoteSig, amountOut));
  assert.equal(r.order.traits, '0x4000000000000000000000000000000000000000000000000000000000000000');
});
