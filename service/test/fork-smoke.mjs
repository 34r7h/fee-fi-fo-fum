#!/usr/bin/env node
// Castle service against a real Castle on an anvil fork of Sepolia, with live Aqua, WETH and USDC. It deploys
// Castle + our own SwapVM router (contracts/out) with the mock ENSv2 registry/resolver the contracts lane tests
// with, starts the service on that fork, then drives the demo beats through the service's own tools and checks
// what /state, /fills and /stream report:
//   fee claims -> ships a book -> castle_quote -> castle_fill (build, sign as a Jack, report tx) -> fo-attested
//   renew -> lease expires -> fi joins and claims via castle_claim -> a fill that reverts is reported and shows.
//
//   anvil --fork-url $SEPOLIA_RPC_URL --port 8546 &
//   node test/fork-smoke.mjs --rpc http://127.0.0.1:8546
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient, createWalletClient, http, encodeAbiParameters, keccak256, pad, toHex, parseEther, getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const out = (file, name) => JSON.parse(fs.readFileSync(path.join(repo, 'contracts/out', file, `${name}.json`), 'utf8'));
const argv = process.argv.slice(2);
const RPC = argv[argv.indexOf('--rpc') + 1] || 'http://127.0.0.1:8546';
const PORT = 8798;
const SVC = `http://127.0.0.1:${PORT}`;

const deps = JSON.parse(fs.readFileSync(path.join(repo, 'contracts/deployments/sepolia.json'), 'utf8')).external;
const AQUA = getAddress(deps.aqua), WETH = getAddress(deps.weth), USDC = getAddress(deps.usdc);

const chain = { ...sepolia, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
// anvil's well-known dev keys: #0 deploys and owns Castle, #1 is fo.
const deployer = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const fo = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const w = createWalletClient({ account: deployer, chain, transport: http(RPC) });
const [fee, fi, jack] = ['0x000000000000000000000000000000000000fee1', '0x000000000000000000000000000000000000f1f1', '0x000000000000000000000000000000000000ac4a'].map((a) => getAddress(a));

const rpc = (method, params) => pub.request({ method, params });
const checks = [];
const check = (ok, what, detail = '') => { checks.push({ ok, what }); console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `  ${detail}` : ''}`); };

async function deploy(file, name, args = []) {
  const a = out(file, name);
  const hash = await w.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return { address: getAddress(rc.contractAddress), abi: a.abi, block: Number(rc.blockNumber) };
}
async function as(from, req) {
  await rpc('anvil_impersonateAccount', [from]);
  await rpc('anvil_setBalance', [from, toHex(parseEther('10'))]);
  const wc = createWalletClient({ account: from, chain, transport: http(RPC) });
  const hash = req.data
    ? await wc.sendTransaction({ to: req.to, data: req.data, gas: req.gas ?? 3_000_000n })
    : await wc.writeContract({ ...req, account: from, gas: req.gas ?? 3_000_000n });
  const rc = await pub.waitForTransactionReceipt({ hash });
  await rpc('anvil_stopImpersonatingAccount', [from]);
  return { hash, rc };
}
async function setBalance(token, who, slot, amount) {
  const key = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [who, BigInt(slot)]));
  await rpc('anvil_setStorageAt', [token, key, pad(toHex(amount), { size: 32 })]);
}
const tool = async (name, args = {}) => {
  const r = await fetch(`${SVC}/tools/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${name}: ${j.error}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await pred(); if (v) return v; await sleep(500); }
  return null;
}

// ---- deploy ------------------------------------------------------------------------------------------------
const registry = await deploy('MockENSv2.sol', 'MockENSv2Registry');
const resolver = await deploy('MockENSv2.sol', 'MockENSv2Resolver');
const router = await deploy('AquaSwapVMRouter.sol', 'AquaSwapVMRouter', [AQUA, WETH, deployer.address, 'AquaSwapVMRouter', '1.0.2']);
const programs = await deploy('CastleFork.t.sol', 'AquaForkProgram');
const dnsName = toHex(new Uint8Array([6, ...Buffer.from('castle'), 10, ...Buffer.from('feefifofum'), 3, ...Buffer.from('eth'), 0]));
const castle = await deploy('Castle.sol', 'Castle', [{
  aqua: AQUA, registry: registry.address, resolver: resolver.address, weth: WETH, usdc: USDC, fo: fo.address,
  owner: deployer.address, label: 'castle', dnsName, leasePeriod: 120n, registryEpoch: false,
}]);
await w.writeContract({ address: registry.address, abi: registry.abi, functionName: 'grantRootRoles', args: [(1n << 0n) | (1n << 16n), castle.address] });
await w.writeContract({ address: resolver.address, abi: resolver.abi, functionName: 'grantRootRoles', args: [(1n << 28n) | (1n << 36n), castle.address] });
for (const m of [fee, fi]) await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: castle.address, abi: castle.abi, functionName: 'setCrew', args: [m, true] }) });
await setBalance(WETH, castle.address, 3, parseEther('10'));
await setBalance(USDC, castle.address, 9, 25_000_000_000n);
console.log(`Castle ${castle.address}  router ${router.address}`);

// ---- the service, pointed at this fork ---------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'castle-smoke-'));
fs.writeFileSync(path.join(tmp, 'sepolia.json'), JSON.stringify({ chainId: 11155111, external: deps, contracts: { castle: { address: castle.address, block: castle.block }, router: router.address } }));
fs.writeFileSync(path.join(tmp, 'crew.json'), JSON.stringify({ agents: { fee: { role: 'shift trader', address: fee }, fi: { role: 'hot standby', address: fi } } }));
const svc = spawn(process.execPath, ['src/server.mjs'], {
  cwd: path.join(repo, 'service'),
  env: { ...process.env, PORT: String(PORT), SEPOLIA_RPC_URL: RPC, SEPOLIA_RPC_URL_FALLBACK: '', CASTLE_DEPLOYMENTS: path.join(tmp, 'sepolia.json'), CASTLE_CREW: path.join(tmp, 'crew.json'), CASTLE_DATA_DIR: path.join(tmp, 'data'), CASTLE_POLL_SECONDS: '1' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const stop = () => { try { svc.kill(); } catch { /* gone */ } };
process.on('exit', stop);
await waitFor(async () => (await fetch(`${SVC}/health`).catch(() => null))?.ok);

try {
  // (1) fee takes the castle and ships the book.
  await as(fee, { address: castle.address, abi: castle.abi, functionName: 'claim' });
  const program = await pub.readContract({ address: programs.address, abi: programs.abi, functionName: 'xycWithSalt', args: [1n] });
  const order = { maker: castle.address, traits: 1n << 254n, data: program };   // MakerTraits: useAquaInsteadOfSignature, no hooks
  const strategy = encodeAbiParameters([{ type: 'tuple', components: [{ name: 'maker', type: 'address' }, { name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] }], [order]);
  await as(fee, { address: castle.address, abi: castle.abi, functionName: 'ship', args: [router.address, strategy, [WETH, USDC], [parseEther('10'), 25_000_000_000n]] });

  const st = await waitFor(async () => { const s = await tool('castle_status'); return s.lease?.epoch && s.strategies.length ? s : null; });
  check(st?.lease?.holder && getAddress(st.lease.holder) === getAddress(fee) && st.lease.holderAgent === 'fee', 'castle_status: fee holds the castle', `epoch ${st?.lease?.epoch} state ${st?.lease?.state}`);
  check(st?.strategies?.length === 1 && st.strategies[0].epoch === st.lease.epoch, 'castle_status: the shipped strategy carries the lease epoch');
  check(st?.inventory?.weth === parseEther('10').toString(), 'castle_status: WETH inventory read from chain', st?.inventory?.weth);

  // (2) a Jack quotes and fills 1,000 USDC for WETH through the service.
  const q = await tool('castle_quote', { tokenIn: 'USDC', tokenOut: 'WETH', amount: '1000000000', taker: jack });
  check(q.ok && BigInt(q.amountOut) > 0n && q.decision === 'live', 'castle_quote: live quote through our router', `out ${q.amountOut}`);
  await setBalance(USDC, jack, 9, 1_000_000_000n);
  const f = await tool('castle_fill', { tokenIn: 'USDC', tokenOut: 'WETH', amount: '1000000000', taker: jack, minOut: '1' });
  await as(jack, f.approve);
  const filled = await as(jack, f.tx);
  check(filled.rc.status === 'success', 'castle_fill: the built router.swap fills on-chain', filled.hash);
  const rec = await tool('castle_fill', { tx_hash: filled.hash });
  check(rec.status === 'success' && rec.decision === 'live', 'castle_fill(tx_hash): the fill is recorded as live');

  // (3) fee renews with fo's attestation.
  const ep = await pub.readContract({ address: castle.address, abi: castle.abi, functionName: 'epoch' });
  const now = (await pub.getBlock()).timestamp;
  const att = { epoch: ep, expiry: now + 110n, deadline: now + 600n };
  const digest = await pub.readContract({ address: castle.address, abi: castle.abi, functionName: 'attestationDigest', args: [att] });
  const sig = await fo.sign({ hash: digest });
  await as(fee, { address: castle.address, abi: castle.abi, functionName: 'renew', args: [att.expiry, att.deadline, sig] });

  // (4) fee goes quiet; the lease lapses; fi applies and claims through castle_claim.
  await rpc('evm_increaseTime', [200]); await rpc('evm_mine', []);
  await tool('castle_join', { agent_id: 'fi', addr: fi });
  const c = await tool('castle_claim', { agent_id: 'fi' });
  check(c.ok && c.simulation === 'ok', 'castle_claim: crew claim is built and simulates', c.simulation);
  const claimed = await as(fi, c.tx);
  check(claimed.rc.status === 'success', 'castle_claim: fi takes the castle on-chain', claimed.hash);

  // (5) a fill that reverts (threshold above what the curve pays) is reported and shows up with its reason.
  const bad = await tool('castle_fill', { tokenIn: 'USDC', tokenOut: 'WETH', amount: '1000000', taker: jack, minOut: (10n ** 30n).toString() });
  await setBalance(USDC, jack, 9, 1_000_000_000n);
  const rv = await as(jack, bad.tx);
  check(rv.rc.status === 'reverted', 'a fill with an impossible threshold reverts on-chain', rv.hash);
  const rrec = await tool('castle_fill', { tx_hash: rv.hash });
  check(rrec.status === 'reverted' && !!rrec.revert, 'castle_fill(tx_hash): the revert is recorded with its reason', rrec.revert);

  // What the page would see.
  await sleep(3000);
  const state = await (await fetch(`${SVC}/state`)).json();
  check(state.lease && getAddress(state.lease.holder) === getAddress(fi) && state.lease.holderAgent === 'fi', '/state: fi is the holder after the claim', `epoch ${state.lease?.epoch}`);
  const fills = (await (await fetch(`${SVC}/fills?from_block=0`)).json()).fills;
  check(fills.some((x) => x.status === 'success') && fills.some((x) => x.status === 'reverted'), '/fills: the successful and the reverted attempt are both there', `${fills.length} fills`);
  const types = new Set();
  const ac = new AbortController();
  const res = await fetch(`${SVC}/stream?since=0`, { signal: ac.signal });
  const reader = res.body.getReader();
  const t0 = Date.now(); let buf = '';
  while (Date.now() - t0 < 2500) {
    const { value, done } = await Promise.race([reader.read(), sleep(500).then(() => ({ value: null }))]);
    if (done) break;
    if (value) buf += Buffer.from(value).toString('utf8');
  }
  ac.abort();
  for (const m of buf.matchAll(/^event: (.+)$/gm)) types.add(m[1]);
  const want = ['lease.claimed', 'strategy.shipped', 'fill', 'lease.renewed', 'lease.expired', 'shift.changed'];
  check(want.every((t) => types.has(t)), '/stream: the demo beats arrive as STREAM.md events', [...types].join(','));
} finally {
  stop();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
