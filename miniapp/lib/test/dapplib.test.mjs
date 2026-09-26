// node --test miniapp/lib/test/dapplib.test.mjs
// FFFLIB (miniapp/lib/dapplib.js) against viem as the oracle:
//   1. offline: keccak-256 and the ABI coder fuzzed against viem on random inputs, the contract calldata byte for byte,
//      errors in plain words, and the page's constraints (the site's strict async wrapper, the validator's patterns);
//   2. on an anvil fork of live Sepolia (FORK=0 skips): the harp quote through UniversalResolverV2 and CCIP-Read, the
//      castle's views, fi's signature, then a harp fill, a hen swap and a wrap sent through an injected-provider shim
//      (an impersonated throwaway address: no key signs anything), plus the wrong-chain, rejected, expired and
//      short-balance paths;
//   3. against live Sepolia (LIVE=0 skips): the same harp fill and hen swap as dry runs through a shim that refuses to
//      send: every call is an eth_call or eth_estimateGas.
// env: SEPOLIA_RPC_URL (publicnode), ANVIL_PORT (18871), FORK, LIVE
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = new URL('../../../', import.meta.url);
const require = createRequire(new URL('service/package.json', REPO));
const viem = await import(require.resolve('viem'));
const { sepolia } = await import(require.resolve('viem/chains'));
const { createPublicClient, http, keccak256, encodeAbiParameters, encodeFunctionData, parseAbi, getAddress, toHex, pad } = viem;

const CODE = fs.readFileSync(new URL('../dapplib.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ TextEncoder, TextDecoder, fetch, setTimeout, console });
vm.runInContext(`${CODE}\nthis.FFFLIB = FFFLIB;`, ctx);
const L = ctx.FFFLIB;
const D = JSON.parse(fs.readFileSync(new URL('contracts/deployments/sepolia.json', REPO), 'utf8'));
const CFG = L.configFrom(D);
const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

// ---- 1. offline ----------------------------------------------------------------------------------------------------
let seed = 20260926;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const bytes = (n) => Uint8Array.from({ length: n }, () => rnd(256));
const hex = (n) => toHex(bytes(n));
const big = (bits) => { let v = 0n; for (let i = 0; i < bits; i += 8) v = (v << 8n) | BigInt(rnd(256)); return v & ((1n << BigInt(bits)) - 1n); };
const addr = () => getAddress(hex(20));
const str = () => Array.from({ length: rnd(70) }, () => String.fromCharCode(32 + rnd(95))).join('') + (rnd(3) ? '' : 'é✓');

test('keccak-256 matches viem on 400 random inputs (0 to 700 bytes, across the 136-byte rate)', () => {
  for (let i = 0; i < 400; i++) {
    const b = bytes(i < 140 ? i : rnd(700));
    assert.equal(L.keccak256(b), keccak256(b), `length ${b.length}`);
  }
});

const GEN = {
  address: addr, bool: () => !!rnd(2), uint8: () => big(8), uint16: () => big(16), uint24: () => big(24), uint64: () => big(64),
  uint128: () => big(128), uint160: () => big(160), uint256: () => big(256), int24: () => big(24) - 2n ** 23n,
  int256: () => big(255) * (rnd(2) ? -1n : 1n), bytes32: () => hex(32), bytes4: () => hex(4), bytes: () => hex(rnd(100)), string: str,
};
const TYPES = ['address', 'bool', 'uint8', 'uint24', 'uint64', 'uint128', 'uint160', 'uint256', 'int24', 'int256', 'bytes32', 'bytes4', 'bytes', 'string',
  'uint256[]', 'bytes[]', 'string[]', 'bool[]', '(address,uint256,bytes)', '(address,string[],bytes)[]', '((address,address,uint24,int24,address),bool,uint128,bytes)',
  '(bytes32,address,address,uint256,uint256,uint64)', '(bool,int256,uint160)'];
function gen(t) {
  if (t.endsWith('[]')) return Array.from({ length: rnd(4) }, () => gen(t.slice(0, -2)));
  if (t.startsWith('(')) return split(t.slice(1, -1)).map(gen);
  return GEN[t]();
}
function split(s) { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && !d) { out.push(cur); cur = ''; } else cur += c; } if (cur) out.push(cur); return out; }
// The same types as viem's JSON ABI parameters (tuples positional, components unnamed).
const toAbi = (t) => {
  if (t.endsWith('[]')) { const inner = toAbi(t.slice(0, -2)); return { ...inner, type: `${inner.type}[]` }; }
  if (t.startsWith('(')) return { type: 'tuple', components: split(t.slice(1, -1)).map(toAbi) };
  return { type: t };
};
const viemTypes = (types) => types.map(toAbi);
// Arrays made inside the lib's vm context have that realm's prototype: copy them into this one before comparing.
const norm = (v) => (Array.isArray(v) ? Array.from(v, norm) : typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v) ? v.toLowerCase() : v);

test('the ABI coder matches viem on 300 random tuples of mixed static, dynamic, array and nested tuple types, and decodes back', () => {
  for (let i = 0; i < 300; i++) {
    const types = Array.from({ length: 1 + rnd(4) }, () => TYPES[rnd(TYPES.length)]);
    const values = types.map(gen);
    const mine = L.encode(types, values);
    assert.equal(mine, encodeAbiParameters(viemTypes(types), values), `types ${types.join(',')}`);
    assert.deepEqual(norm(L.decode(types, mine)), norm(values), `decode ${types.join(',')}`);
  }
});

const REC = JSON.parse(fs.readFileSync(new URL('agents/live-run/11786346/q1-live.json', REPO), 'utf8'));
test('calldata matches viem byte for byte: approve, router.swap, router.quote, PoolSwapTest.swap, V4Quoter, WETH.deposit, the pool key, namehash, UR v2 resolveWithGateways, the batch query', () => {
  const ORDER = { type: 'tuple', components: [{ name: 'maker', type: 'address' }, { name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] };
  const order = [REC.order.maker, BigInt(REC.order.traits), REC.order.data];
  const R = [{ type: 'function', name: 'swap', inputs: [ORDER, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' }];
  assert.equal(L.calldata('swap((address,uint256,bytes),address,address,uint256,bytes)', [order, REC.tokenIn, REC.tokenOut, 500000n, REC.takerTraitsAndData]),
    encodeFunctionData({ abi: R, functionName: 'swap', args: [{ maker: order[0], traits: order[1], data: order[2] }, REC.tokenIn, REC.tokenOut, 500000n, REC.takerTraitsAndData] }));
  assert.equal(L.calldata('approve(address,uint256)', [CFG.router, 500000n]), encodeFunctionData({ abi: parseAbi(['function approve(address,uint256)']), functionName: 'approve', args: [CFG.router, 500000n] }));
  assert.equal(L.calldata('deposit()', []), encodeFunctionData({ abi: parseAbi(['function deposit() payable']), functionName: 'deposit' }));
  const key = [CFG.pool.currency0, CFG.pool.currency1, 0n, 60n, CFG.pool.hooks];
  const KEY = 'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }';
  const pst = parseAbi([KEY, 'struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }', 'struct TestSettings { bool takeClaims; bool settleUsingBurn; }', 'function swap(PoolKey key, SwapParams params, TestSettings testSettings, bytes hookData) payable returns (int256)']);
  const MIN = 4295128739n + 1n;
  assert.equal(L.calldata('swap((address,address,uint24,int24,address),(bool,int256,uint160),(bool,bool),bytes)', [key, [true, -500000n, MIN], [false, false], '0x']),
    encodeFunctionData({ abi: pst, functionName: 'swap', args: [{ currency0: key[0], currency1: key[1], fee: 0, tickSpacing: 60, hooks: key[4] }, { zeroForOne: true, amountSpecified: -500000n, sqrtPriceLimitX96: MIN }, { takeClaims: false, settleUsingBurn: false }, '0x'] }));
  const q = parseAbi([KEY, 'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }', 'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256, uint256)']);
  const hookData = encodeAbiParameters([{ type: 'uint256' }], [7n]);
  assert.equal(L.calldata('quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))', [[key, false, 10n ** 15n, hookData]]),
    encodeFunctionData({ abi: q, functionName: 'quoteExactInputSingle', args: [{ poolKey: { currency0: key[0], currency1: key[1], fee: 0, tickSpacing: 60, hooks: key[4] }, zeroForOne: false, exactAmount: 10n ** 15n, hookData }] }));
  assert.equal(L.keccak256(L.encode(['(address,address,uint24,int24,address)'], [key])), CFG.poolId, 'the pool key hashes to poolId');
  const RQ = [{ ...R[0], name: 'quote' }];
  assert.equal(L.calldata('quote((address,uint256,bytes),address,address,uint256,bytes)', [order, REC.tokenIn, REC.tokenOut, 500000n, REC.takerTraitsAndData]),
    encodeFunctionData({ abi: RQ, functionName: 'quote', args: [{ maker: order[0], traits: order[1], data: order[2] }, REC.tokenIn, REC.tokenOut, 500000n, REC.takerTraitsAndData] }));
  // UR v2 as viem's getEnsText calls it: resolveWithGateways(dns name, text(namehash, key), ['x-batch-gateway:true']).
  assert.equal(L.namehash('quote.feefifofum.eth'), viem.namehash('quote.feefifofum.eth'));
  const dns = toHex(Uint8Array.from([5, ...Buffer.from('quote'), 10, ...Buffer.from('feefifofum'), 3, ...Buffer.from('eth'), 0]));
  assert.equal(L.dnsEncode('quote.feefifofum.eth'), dns);
  const text = encodeFunctionData({ abi: parseAbi(['function text(bytes32 node, string key) view returns (string)']), functionName: 'text', args: [viem.namehash('quote.feefifofum.eth'), 'quote:USDC:WETH:500000'] });
  assert.equal(L.calldata('text(bytes32,string)', [L.namehash('quote.feefifofum.eth'), 'quote:USDC:WETH:500000']), text);
  assert.equal(L.calldata('resolveWithGateways(bytes,bytes,string[])', [dns, text, ['x-batch-gateway:true']]),
    encodeFunctionData({ abi: parseAbi(['function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes, address)']), functionName: 'resolveWithGateways', args: [dns, text, ['x-batch-gateway:true']] }));
  const queries = [[CFG.resolver, ['https://handoff.lol/t/castle/ccip/{sender}/{data}.json'], text]];
  assert.equal(L.calldata('query((address,string[],bytes)[])', [queries]),
    encodeFunctionData({ abi: parseAbi(['function query((address sender, string[] urls, bytes data)[] queries) view returns (bool[], bytes[])']), functionName: 'query', args: [queries.map(([sender, urls, data]) => ({ sender, urls, data }))] }));
});

test('errors in plain words: contract errors with args, token strings, wallet codes, and revert data nested as wallets nest it', () => {
  const qe = L.selector('QuoteExpired(uint64)') + L.encode(['uint64'], [1790426242n]).slice(2);
  assert.equal(L.decodeError({ code: 3, message: 'execution reverted', data: qe }), 'QuoteExpired(1790426242)');
  assert.equal(L.decodeError({ code: -32603, data: { originalError: { data: qe } } }), 'QuoteExpired(1790426242)');
  assert.equal(L.decodeError({ cause: { cause: { data: qe } } }), 'QuoteExpired(1790426242)');
  const oa = L.selector('OverAllocated(address,uint256,uint256)') + L.encode(['address', 'uint256', 'uint256'], [CFG.weth, 3903882690184150n, 3717983514461096n]).slice(2);
  assert.equal(L.decodeError({ data: oa }), `OverAllocated(${CFG.weth.toLowerCase()},3903882690184150,3717983514461096)`);
  const bal = L.selector('Error(string)') + L.encode(['string'], ['ERC20: transfer amount exceeds balance']).slice(2);
  assert.equal(L.decodeError({ data: bal }), 'insufficient balance');
  const allow = L.selector('Error(string)') + L.encode(['string'], ['ERC20: transfer amount exceeds allowance']).slice(2);
  assert.equal(L.decodeError({ data: allow }), 'insufficient allowance');
  assert.equal(L.decodeError({ code: 4001, message: 'User rejected the request.' }), 'user rejected');
  assert.equal(L.decodeError(new Error('insufficient funds for gas * price + value')), 'not enough ETH for gas');
  // Nothing to name: null, so the page shows the error's own message rather than calling it the castle's refusal.
  assert.equal(L.decodeError(new Error('No Sepolia RPC answered. Try again in a moment.')), null);
  assert.equal(L.decodeError(null), null);
});

test('the page can inline it: the site wrapper compiles it, none of the validator patterns match, and it stays small', async () => {
  new vm.Script(`(async function(__r,__handoff){'use strict';const document={};\n${CODE}})`);
  const BLOCK = [/\beval\s*\(/, /document\.cookie\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /window\.location\s*=/, /new\s+Function\s*\(/];
  const WARN = [/fetch\s*\(\s*['"`]https?:\/\/(?!handoff\.socnet\.lol)/, /\.innerHTML\s*\+=|\.innerHTML\s*=\s*.*\+/, /document\.write\s*\(/];
  assert.equal(BLOCK.concat(WARN).filter((r) => r.test(CODE)).map(String).join(' '), '');
  if (process.env.ESBUILD) {
    const esbuild = await import(process.env.ESBUILD);
    const min = (esbuild.default || esbuild).transformSync(CODE, { loader: 'js', minify: true, legalComments: 'none', target: 'es2020' }).code;
    console.log(`# dapplib.js: ${Buffer.byteLength(CODE)} B source, ${Buffer.byteLength(min)} B minified`);
  }
});

// ---- 2. a fork of live Sepolia, through an injected-provider shim ------------------------------------------------
const FORK = process.env.FORK !== '0';
const PORT = Number(process.env.ANVIL_PORT || 18871);
const FORK_RPC = `http://127.0.0.1:${PORT}`;
const rpcCall = (url) => { const f = L.rpc(url); return (m, p) => f(m, p); };
// An EIP-1193 provider like an injected wallet: accounts, chain, and eth_sendTransaction (anvil impersonation here).
function shim(url, account, { chainId = null, reject = false, noSend = false } = {}) {
  const f = rpcCall(url);
  return {
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
      if (method === 'eth_chainId' && chainId) return chainId;
      if (method === 'wallet_switchEthereumChain') { if (chainId) throw Object.assign(new Error('User rejected the request.'), { code: 4001 }); return null; }
      if (method === 'eth_sendTransaction') {
        if (reject) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        if (noSend) throw new Error('this shim never sends');
        await f('anvil_impersonateAccount', [account]);
        return f(method, params);
      }
      return f(method, params);
    },
  };
}
async function startAnvil() {
  const p = spawn('anvil', ['--fork-url', RPC, '--port', String(PORT), '--silent'], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if (await rpcCall(FORK_RPC)('eth_chainId', [])) return p; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  p.kill();
  throw new Error('anvil did not start');
}
const USDC_BALANCES_SLOT = 9n;
async function fund(f, who, usdc) {
  await f('anvil_setBalance', [who, '0xde0b6b3a7640000']);
  const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [who, USDC_BALANCES_SLOT]));
  await f('anvil_setStorageAt', [CFG.usdc, slot, pad(toHex(usdc), { size: 32 })]);
}

test('on a fork of live Sepolia: ask, verify, fill the harp and swap on the hen through the shim', { skip: !FORK && 'FORK=0' }, async (t) => {
  const anvil = await startAnvil();
  t.after(() => anvil.kill());
  const f = rpcCall(FORK_RPC);
  const pc = createPublicClient({ chain: sepolia, transport: http(FORK_RPC) });
  const me = getAddress(hex(20));
  await fund(f, me, 10_000_000n);
  const lib = L.create({ provider: shim(FORK_RPC, me), read: f, config: CFG });

  await t.test('the castle reads match viem', async () => {
    const v = await lib.vault();
    const VA = parseAbi(['function committed(address) view returns (uint256)', 'function limit(address) view returns (uint256)', 'function headroom(address) view returns (uint256)', 'function leverageOf(address) view returns (uint16)', 'function strategyIn(uint8) view returns (bytes32)']);
    for (const [sym, tok] of [['USDC', CFG.usdc], ['WETH', CFG.weth]]) {
      for (const fn of ['committed', 'limit', 'headroom', 'leverageOf']) {
        const want = await pc.readContract({ address: CFG.castle, abi: VA, functionName: fn, args: [tok] });
        assert.equal(v[{ leverageOf: 'leverage' }[fn] || fn][sym], BigInt(want), `${fn}(${sym})`);
      }
    }
    assert.deepEqual(norm(v.strategies.map((s) => s.hash)), (await Promise.all([0, 1, 2].map((s) => pc.readContract({ address: CFG.castle, abi: VA, functionName: 'strategyIn', args: [s] })))).filter((h) => BigInt(h) !== 0n));
    assert.ok(v.strategies.length >= 2 && v.strategies.every((s) => s.alloc.WETH > 0n || s.alloc.USDC > 0n));
  });

  let asked;
  await t.test('askHarp resolves quote.feefifofum.eth through UR v2 and CCIP-Read as viem does, and fi signed it', async () => {
    asked = await lib.askHarp('USDC', 'WETH', 500000n);
    const viemText = await pc.getEnsText({ name: 'quote.feefifofum.eth', key: 'quote:USDC:WETH:500000', universalResolverAddress: CFG.universalResolver, strict: true });
    const a = asked.record, b = JSON.parse(viemText);
    for (const k of ['v', 'chainId', 'router', 'strategyHash', 'tokenIn', 'tokenOut', 'amountIn', 'amountOut', 'maxAmountIn', 'signer']) assert.deepEqual(a[k], b[k], k);
    assert.deepEqual(norm(Object.keys(a)), Object.keys(b));
    assert.equal(asked.check.signedByFi, true);
    assert.equal(asked.check.fi.toLowerCase(), a.signer.toLowerCase());
    assert.equal(asked.check.routerOut, BigInt(a.amountOut));
    assert.ok(asked.check.secondsLeft > 0 && asked.check.secondsLeft <= 30);
    // A record whose signature or amount was changed after fi signed it does not pass.
    const sig = asked.record.quoteSig;
    const forged = { ...asked.record, quoteSig: sig.slice(0, 10) + (sig[10] === 'a' ? 'b' : 'a') + sig.slice(11) };
    await assert.rejects(lib.verifyQuote(forged), /not signed by fi|reverted|BadQuoteSigner|ECDSA/);
    const richer = { ...asked.record, amountOut: String(BigInt(asked.record.amountOut) * 2n) };
    await assert.rejects(lib.verifyQuote(richer), /router\.quote pays/);
  });

  await t.test('nameOf reverse-resolves through UR v2 as viem does', async () => {
    for (const a of [me, '0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99', '0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c']) {
      const want = await pc.getEnsName({ address: a, universalResolverAddress: CFG.universalResolver }).catch(() => null);
      assert.equal(await lib.nameOf(a), want ?? null, a);
    }
    // No crew address has a primary name on Sepolia, so set one on the fork: fi (impersonated) claims
    // fi.feefifofum.eth, which already resolves to fi, through the ReverseRegistrar that owns addr.reverse.
    const fi = (await lib.vault()).fi;
    const rr = await pc.readContract({ address: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', abi: parseAbi(['function owner(bytes32) view returns (address)']), functionName: 'owner', args: [viem.namehash('addr.reverse')] });
    await f('anvil_setBalance', [fi, '0xde0b6b3a7640000']);
    await f('anvil_impersonateAccount', [fi]);
    const hash = await f('eth_sendTransaction', [{ from: fi, to: rr, data: encodeFunctionData({ abi: parseAbi(['function setName(string) returns (bytes32)']), functionName: 'setName', args: ['fi.feefifofum.eth'] }) }]);
    assert.equal((await pc.waitForTransactionReceipt({ hash })).status, 'success');
    assert.equal(await lib.nameOf(fi), 'fi.feefifofum.eth');
    assert.equal(await pc.getEnsName({ address: fi, universalResolverAddress: CFG.universalResolver }), 'fi.feefifofum.eth');
  });

  await t.test('fillHarp approves the router and fills: the wallet receives exactly the quoted WETH', async () => {
    const before = await lib.balances(me);
    const r = await lib.fillHarp(asked.record, me);
    assert.equal(r.approve.status, 'success');
    assert.equal(r.fill.status, 'success');
    const after = await lib.balances(me);
    assert.equal(after.WETH - before.WETH, BigInt(r.record.amountOut));
    assert.equal(before.USDC - after.USDC, 500000n);
    console.log(`# fork harp fill: approve ${r.approve.gasUsed} gas, fill ${r.fill.gasUsed} gas, ${r.record.amountOut} WETH`);
  });

  await t.test('henQuote matches viem, and swapHen receives what the V4Quoter said', async () => {
    const quoted = await lib.henQuote('USDC', 300000n);
    const { result } = await pc.simulateContract({ address: CFG.v4Quoter, abi: parseAbi(['struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }', 'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }', 'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256, uint256)']), functionName: 'quoteExactInputSingle', args: [{ poolKey: D.contracts.pool && { currency0: CFG.pool.currency0, currency1: CFG.pool.currency1, fee: 0, tickSpacing: 60, hooks: CFG.pool.hooks }, zeroForOne: true, exactAmount: 300000n, hookData: '0x' }] });
    assert.equal(quoted, result[0]);
    const before = await lib.balances(me);
    const r = await lib.swapHen('USDC', 300000n, quoted, me);
    assert.equal(r.swap.status, 'success');
    const after = await lib.balances(me);
    assert.equal(after.WETH - before.WETH, quoted);
    console.log(`# fork hen swap: approve ${r.approve.gasUsed} gas, swap ${r.swap.gasUsed} gas, ${quoted} WETH`);
  });

  await t.test('wrapEth wraps', async () => {
    const before = await lib.balances(me);
    const r = await lib.wrapEth(10n ** 15n, me);
    assert.equal(r.status, 'success');
    assert.equal((await lib.balances(me)).WETH - before.WETH, 10n ** 15n);
  });

  await t.test('WETH in, the page\'s other direction: the hen pays the USDC the V4Quoter said, the harp pays the USDC fi signed for', async () => {
    const amt = 10n ** 14n;
    const quoted = await lib.henQuote('WETH', amt);
    const { result } = await pc.simulateContract({ address: CFG.v4Quoter, abi: parseAbi(['struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }', 'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }', 'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256, uint256)']), functionName: 'quoteExactInputSingle', args: [{ poolKey: { currency0: CFG.pool.currency0, currency1: CFG.pool.currency1, fee: 0, tickSpacing: 60, hooks: CFG.pool.hooks }, zeroForOne: false, exactAmount: amt, hookData: '0x' }] });
    assert.equal(quoted, result[0]);
    const before = await lib.balances(me);
    const hen = await lib.swapHen('WETH', amt, quoted, me);
    assert.equal(hen.swap.status, 'success');
    const mid = await lib.balances(me);
    assert.equal(mid.USDC - before.USDC, quoted);
    assert.equal(before.WETH - mid.WETH, amt);
    const asked = await lib.askHarp('WETH', 'USDC', amt);
    assert.ok(asked.check.signedByFi);
    const harp = await lib.fillHarp(asked.record, me);
    assert.equal(harp.fill.status, 'success');
    const after = await lib.balances(me);
    assert.equal(after.USDC - mid.USDC, BigInt(harp.record.amountOut));
    assert.equal(mid.WETH - after.WETH, amt);
    console.log(`# fork WETH in: hen ${amt} WETH for ${quoted} USDC (swap ${hen.swap.gasUsed} gas), harp ${amt} WETH for ${harp.record.amountOut} USDC (fill ${harp.fill.gasUsed} gas)`);
  });

  await t.test('myTrades keeps only the taker\'s fills', async () => {
    const s = { fills: [{ tx: '0x1', taker: me.toLowerCase(), route: 'aqua', label: 'harp' }, { tx: '0x2', taker: CFG.castle, route: 'v4' }] };
    assert.deepEqual(norm((await lib.myTrades(me, s)).map((x) => x.tx)), ['0x1']);
  });

  await t.test('a wallet on the wrong chain, a rejection, a short balance and an expired quote come back in plain words', async () => {
    const wrong = L.create({ provider: shim(FORK_RPC, me, { chainId: '0x1' }), read: f, config: CFG });
    const fresh = await lib.askHarp('USDC', 'WETH', 500000n);
    await assert.rejects(wrong.fillHarp(fresh.record, me), /^Error: wrong chain: the wallet is on 1, switch it to Sepolia/);
    await assert.rejects(wrong.ensureSepolia(), /user rejected/);
    const rejecting = L.create({ provider: shim(FORK_RPC, me, { reject: true }), read: f, config: CFG });
    await assert.rejects(rejecting.fillHarp(fresh.record, me), /user rejected/);
    const poor = getAddress(hex(20));
    await f('anvil_setBalance', [poor, '0xde0b6b3a7640000']);
    const poorLib = L.create({ provider: shim(FORK_RPC, poor), read: f, config: CFG });
    await assert.rejects(poorLib.fillHarp(fresh.record, poor), /not enough USDC: the wallet holds 0, the trade needs 500000/);
    // 31 s later on the fork's clock: the router refuses the quote, and the lib says why before any wallet prompt.
    await f('evm_increaseTime', [45]);
    await f('evm_mine', []);
    const calls = await lib.harpCalls(fresh.record, me);
    await assert.rejects(lib.simulate(me, calls[1]), new RegExp(`QuoteExpired\\(${fresh.record.validUntil}\\)`));
  });
});

// ---- 3. live Sepolia: the same moves as dry runs (eth_call and eth_estimateGas only) -------------------------------
const LIVE = process.env.LIVE !== '0';
test('live Sepolia, dry: askHarp, the harp fill and the hen swap simulate and estimate through a shim that never sends', { skip: !LIVE && 'LIVE=0' }, async () => {
  const read = rpcCall(RPC);
  const agy = '0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c';   // holds USDC on Sepolia; its router and PoolSwapTest allowances are 0
  const lib = L.create({ provider: shim(RPC, agy, { noSend: true }), read, config: CFG });
  const asked = await lib.askHarp('USDC', 'WETH', 500000n);
  assert.equal(asked.check.signedByFi, true);
  const harp = await lib.fillHarp(asked.record, agy, { dryRun: true });
  assert.ok(harp.approveGas > 40000n && harp.approveGas < 80000n, `approve ${harp.approveGas}`);
  // The fill itself, simulated on live state with the approve applied as a state override (USDC's allowed mapping, slot 10).
  const allowSlot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [asked.record.router, keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [agy, 10n]))]));
  const override = { [CFG.usdc]: { stateDiff: { [allowSlot]: pad(toHex(500000n), { size: 32 }) } } };
  const out = await read('eth_call', [{ from: agy, to: harp.fillData.to, data: harp.fillData.data }, 'latest', override]);
  assert.equal(L.decode(['uint256', 'uint256'], out)[1], BigInt(asked.record.amountOut));
  const fillGas = BigInt(await read('eth_estimateGas', [{ from: agy, to: harp.fillData.to, data: harp.fillData.data }, 'latest', override]).catch(() => '0x0'));
  const hen = await lib.henQuote('USDC', 500000n);
  const swap = await lib.swapHen('USDC', 500000n, hen, agy, { dryRun: true });
  const pstSlot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [CFG.poolSwapTest, keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [agy, 10n]))]));
  const pstOverride = { [CFG.usdc]: { stateDiff: { [pstSlot]: pad(toHex(500000n), { size: 32 }) } } };
  await read('eth_call', [{ from: agy, to: swap.swapData.to, data: swap.swapData.data }, 'latest', pstOverride]);
  const swapGas = BigInt(await read('eth_estimateGas', [{ from: agy, to: swap.swapData.to, data: swap.swapData.data }, 'latest', pstOverride]).catch(() => '0x0'));
  console.log(`# live dry run: quote ${asked.record.id} ${asked.record.amountOut} WETH (signed by fi, ${asked.check.secondsLeft} s left); approve ${harp.approveGas} gas; fill ${fillGas || 'simulated (estimateGas takes no override on this RPC)'} gas; hen ${hen} WETH, approve ${swap.approveGas} gas, swap ${swapGas || 'simulated'} gas`);
});
