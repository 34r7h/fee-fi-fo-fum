#!/usr/bin/env node
// handoff's ENSv2 agent registry: a UserRegistry under feefifofum.eth, a PermissionedResolver, and one
// load-bearing name per handoff agent: fee, fi, fo, fum (agents/crew.json) plus pre-existing handoff agents
// named with --agent (agy). Each name gets:
//   addr                  the agent's Sepolia wallet (handoff.lol wallet_address, or crew.json)
//   agent-endpoint[mcp]   ENSIP-26, the MCP endpoint that reaches the agent (handoff.lol's MCP by default)
//   handoff-agent         the handoff agent id, so a resolver of the name can find the agent on handoff.lol
// Idempotent: every step reads chain state first and skips what is already true. Then it VERIFIES from the
// outside: registry.findOwner/findExpiry (the contract-level read JackHook makes) and UniversalResolverV2.
//
//   node agent-registry.mjs --rpc <url> [--fork] [--castle <Castle>] [--agent agy ...] [--mcp label=url ...] [--castle-mcp url] [--dry-run]
//
// --fork is for an anvil fork: it impersonates whoever must act for us (the parent's owner, the ETHRegistrar)
// and tops up gas, so the whole flow runs before live funds land. State goes to
// contracts/deployments/ens-agents.<sepolia|fork>.json. No address is hard-coded here: they come from
// contracts/deployments/sepolia.json (external.universalResolverV2 and the ens* keys) or the env.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient, createWalletClient, http, parseAbi, namehash, labelhash, encodeFunctionData, decodeFunctionResult, decodeEventLog,
  getAddress, isAddress, zeroAddress, toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const many = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));

const FORK = flag('fork');
const DRY = flag('dry-run');
const RPC = opt('rpc', process.env.SEPOLIA_RPC_URL);
if (!RPC) throw new Error('--rpc <url> or SEPOLIA_RPC_URL');
const PARENT = opt('parent', process.env.ENS_PARENT_LABEL || 'feefifofum');
const HANDOFF_API = (process.env.HANDOFF_API || 'https://handoff.lol/api/v1').replace(/\/$/, '');
const DEFAULT_MCP = process.env.AGENT_MCP_ENDPOINT || 'https://handoff.lol/mcp';
// The shift agents (fee, fi) answer through the castle service: castle.feefifofum.eth is linked to the
// holder's record, so the holder's agent-endpoint[mcp] is what resolving castle.* reaches.
const CASTLE_MCP = opt('castle-mcp', process.env.CASTLE_MCP_ENDPOINT || 'https://handoff.lol/t/castle/mcp');
const SHIFT_ROLES = new Set(['shift trader', 'hot standby']);
const MCP_OVERRIDE = Object.fromEntries(many('mcp').filter(Boolean).map((kv) => kv.split(/=(.*)/s).slice(0, 2)));
const YEAR = 365n * 24n * 3600n;

const deps = JSON.parse(fs.readFileSync(path.join(repo, 'contracts/deployments/sepolia.json'), 'utf8'));
const ext = { ...(deps.external || {}), ...(deps.contracts || {}) };
const pick = (envName, ...keys) => { const v = process.env[envName] || keys.map((k) => ext[k]).find(Boolean); return v && isAddress(v) ? getAddress(v) : null; };
const A = {
  universalResolver: pick('ENS_UNIVERSAL_RESOLVER', 'universalResolverV2', 'ensUniversalResolver'),
  verifiableFactory: pick('ENS_VERIFIABLE_FACTORY', 'ensVerifiableFactory', 'verifiableFactory'),
  userRegistryImpl: pick('ENS_USER_REGISTRY_IMPL', 'ensUserRegistryImpl', 'userRegistryImpl'),
  resolverImpl: pick('ENS_PERMISSIONED_RESOLVER_IMPL', 'ensPermissionedResolverImpl', 'permissionedResolverImpl'),
  ethRegistrar: pick('ENS_ETH_REGISTRAR', 'ensEthRegistrar', 'ethRegistrar'),
};
for (const k of ['universalResolver', 'verifiableFactory', 'userRegistryImpl', 'resolverImpl']) {
  if (!A[k]) throw new Error(`no ${k} address: add it to contracts/deployments/sepolia.json external, or set the env override`);
}

const stateFile = path.join(repo, `contracts/deployments/ens-agents.${FORK ? 'fork' : 'sepolia'}.json`);
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const saveState = () => { if (!DRY) fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n'); };

const keyPath = (opt('key', process.env.ENS_REGISTRAR_KEY_PATH) || path.join(os.homedir(), '.handoff/agents/castle/sepolia.key')).replace(/^~/, os.homedir());
const account = privateKeyToAccount(fs.readFileSync(keyPath, 'utf8').trim());
const chain = { ...sepolia, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

// ---- ABIs (ensdomains/contracts-v2) ----------------------------------------------------------------------
const UR = parseAbi(['function ROOT_REGISTRY() view returns (address)', 'function findResolver(bytes name) view returns (address, bytes32, uint256)']);
// ABIs follow the sepolia-deployment-2026-09-15 tag, the ENSv2 set korg's probes use (UR 0x5d25…).
const REG = parseAbi([
  'struct Grant { address account; uint256 roleBitmap; }',
  'function initialize(Grant[] grants)',
  'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)',
  'function renew(uint256 anyId, uint64 newExpiry)',
  'function setSubregistry(uint256 anyId, address registry)',
  'function setResolver(uint256 anyId, address resolver)',
  'function setParent(address parent, string label)',
  'function getParent() view returns (address parent, string label)',
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
  'function findOwner(string label) view returns (address)',
  'function findExpiry(string label) view returns (uint64)',
  'function findTokenId(string label) view returns (uint256)',
  'function hasRoles(uint256 anyId, uint256 roleBitmap, address account) view returns (bool)',
  'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
]);
const RES = parseAbi([
  'struct Grant { address account; uint256 roleBitmap; }',
  'function initialize(Grant[] grants, bytes[] calls)',
  'function setAddress(bytes name, uint256 coinType, bytes addressBytes)',
  'function setText(bytes name, string key, string value)',
  'function multicall(bytes[] calls) returns (bytes[])',
  'function resolve(bytes name, bytes data) view returns (bytes)',
  'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
  'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
]);
const PROFILE = parseAbi(['function addr(bytes32 node) view returns (address)', 'function text(bytes32 node, string key) view returns (string)']);
const FACTORY = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data) returns (address)',
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
]);
const REGISTRAR = parseAbi(['function ETH_REGISTRY() view returns (address)']);

// RegistryRolesLib / PermissionedResolverLib: each role at bit n, its admin at bit n+128.
const withAdmin = (r) => r | (r << 128n);
const R = { REGISTRAR: 1n << 0n, SET_PARENT: 1n << 8n, UNREGISTER: 1n << 12n, RENEW: 1n << 16n, SET_SUBREGISTRY: 1n << 20n, SET_RESOLVER: 1n << 24n, UPGRADE: 1n << 124n };
const REGISTRY_ROOT_ROLES = Object.values(R).reduce((a, r) => a | withAdmin(r), 0n);
const NAME_OWNER_ROLES = R.SET_RESOLVER | R.RENEW;                  // an agent can repoint its resolver and renew its own name
const RS = { SET_ADDRESS: 1n << 0n, SET_TEXT: 1n << 4n, SET_DATA: 1n << 24n, LINK: 1n << 28n, UPGRADE: 1n << 124n };
const RESOLVER_ROOT_ROLES = Object.values(RS).reduce((a, r) => a | withAdmin(r), 0n);

// ---- helpers ---------------------------------------------------------------------------------------------
const log = (...a) => console.log(...a);
const code = async (a) => (a ? ((await pub.getCode({ address: a })) || '0x').length > 2 : false);
async function rpc(method, params) { return pub.request({ method, params }); }
async function asSigner(from, fn) {
  if (sameAddr(from, account.address)) return fn(wallet);
  if (!FORK) throw new Error(`this step must be signed by ${from}, not by ${account.address}`);
  await rpc('anvil_impersonateAccount', [from]);
  await rpc('anvil_setBalance', [from, toHex(10n ** 18n)]);
  try { return await fn(createWalletClient({ account: from, chain, transport: http(RPC) })); }
  finally { await rpc('anvil_stopImpersonatingAccount', [from]); }
}
// DNS wire format, which ENSv2's name-keyed setters take.
const dnsName = (name) => toHex(new Uint8Array([...name.split('.').flatMap((l) => { const b = new TextEncoder().encode(l); return [b.length, ...b]; }), 0]));
async function record(name, fn, args) {
  try {
    const out = await pub.readContract({ address: state.resolver, abi: RES, functionName: 'resolve', args: [dnsName(name), encodeFunctionData({ abi: PROFILE, functionName: fn, args })] });
    return decodeFunctionResult({ abi: PROFILE, functionName: fn, data: out });
  } catch { return fn === 'addr' ? zeroAddress : ''; }
}
const sameAddr = (a, b) => !!a && !!b && getAddress(a) === getAddress(b);
async function send(w, req, what) {
  if (DRY) { log(`  [dry-run] ${what}`); return null; }
  const hash = await w.writeContract({ ...req, chain });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(`${what} reverted: ${hash}`);
  log(`  ${what}: ${hash}`);
  (state.txs ||= []).push({ what, hash, block: Number(rc.blockNumber) });
  return rc;
}
async function deployProxy(impl, init, what) {
  const salt = BigInt(labelhash(`${what}:${account.address}:${state.saltNonce || 0}`));
  const rc = await send(wallet, { address: A.verifiableFactory, abi: FACTORY, functionName: 'deployProxy', args: [impl, salt, init] }, `deploy ${what}`);
  if (!rc) return null;
  for (const l of rc.logs) {
    try { const d = decodeEventLog({ abi: FACTORY, data: l.data, topics: l.topics }); if (d.eventName === 'ProxyDeployed') return getAddress(d.args.proxyAddress); } catch { /* other log */ }
  }
  throw new Error(`no ProxyDeployed log for ${what}`);
}
async function handoffAgent(id) {
  const r = await fetch(`${HANDOFF_API}/agents/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`handoff.lol has no agent ${id} (${r.status})`);
  const j = await r.json();
  return j.agent || j;
}

// ---- 0. who is who --------------------------------------------------------------------------------------
if (FORK) await rpc('anvil_setBalance', [account.address, toHex(10n ** 18n)]);
const root = getAddress(await pub.readContract({ address: A.universalResolver, abi: UR, functionName: 'ROOT_REGISTRY' }));
const ethRegistry = getAddress(await pub.readContract({ address: root, abi: REG, functionName: 'getSubregistry', args: ['eth'] }));
const parentName = `${PARENT}.eth`;
log(`registrar ${account.address}  rpc ${RPC}${FORK ? ' (fork)' : ''}`);
log(`UniversalResolverV2 ${A.universalResolver}  root ${root}  eth ${ethRegistry}  parent ${parentName}`);
Object.assign(state, { chainId: 11155111, universalResolver: A.universalResolver, rootRegistry: root, ethRegistry, parent: parentName, registrar: account.address });

// ---- 1. the agent registry and its resolver --------------------------------------------------------------
if (!(await code(state.agentRegistry))) {
  const init = encodeFunctionData({ abi: REG, functionName: 'initialize', args: [[{ account: account.address, roleBitmap: REGISTRY_ROOT_ROLES }]] });
  state.agentRegistry = await deployProxy(A.userRegistryImpl, init, 'agent registry (UserRegistry)');
  saveState();
}
if (!(await code(state.resolver))) {
  const init = encodeFunctionData({ abi: RES, functionName: 'initialize', args: [[{ account: account.address, roleBitmap: RESOLVER_ROOT_ROLES }], []] });
  state.resolver = await deployProxy(A.resolverImpl, init, 'agent resolver (PermissionedResolver)');
  saveState();
}
log(`agent registry ${state.agentRegistry}  resolver ${state.resolver}`);

// ---- 2. hang it under feefifofum.eth ---------------------------------------------------------------------
const parentOwner = await pub.readContract({ address: ethRegistry, abi: REG, functionName: 'findOwner', args: [PARENT] });
const parentSub = await pub.readContract({ address: ethRegistry, abi: REG, functionName: 'getSubregistry', args: [PARENT] });
if (sameAddr(parentSub, state.agentRegistry)) {
  log(`${parentName} already points at the agent registry`);
} else if (parentOwner === zeroAddress) {
  if (!FORK) throw new Error(`${parentName} is not registered on ${ethRegistry}; register it first (p0-ens-probes), then rerun`);
  // Fork only: act as the ETHRegistrar, which holds ROLE_REGISTRAR on the .eth registry.
  const registrar = A.ethRegistrar || (await findRegistrar());
  const now = (await pub.getBlock()).timestamp;
  await asSigner(registrar, (w) => send(w, { address: ethRegistry, abi: REG, functionName: 'register', args: [PARENT, account.address, state.agentRegistry, state.resolver, R.SET_SUBREGISTRY | R.SET_RESOLVER | R.RENEW, now + YEAR], account: registrar }, `[fork] register ${parentName} as the ETHRegistrar`));
} else {
  const tokenId = await pub.readContract({ address: ethRegistry, abi: REG, functionName: 'findTokenId', args: [PARENT] });
  await asSigner(parentOwner, (w) => send(w, { address: ethRegistry, abi: REG, functionName: 'setSubregistry', args: [tokenId, state.agentRegistry], account: parentOwner }, `setSubregistry(${parentName}) -> agent registry, signed by the parent owner ${parentOwner}`));
}
const [curParent] = await pub.readContract({ address: state.agentRegistry, abi: REG, functionName: 'getParent' });
if (!sameAddr(curParent, ethRegistry)) {
  await send(wallet, { address: state.agentRegistry, abi: REG, functionName: 'setParent', args: [ethRegistry, PARENT] }, `agent registry setParent(.eth, ${PARENT})`);
}
saveState();

async function findRegistrar() {
  // The .eth registry's registrations are sent by the ETHRegistrar; the most recent LabelRegistered tx names it.
  const head = await pub.getBlockNumber();
  const logs = await pub.getLogs({ address: ethRegistry, fromBlock: head > 50_000n ? head - 50_000n : 0n, toBlock: head });
  for (const l of logs.reverse()) {
    const tx = await pub.getTransaction({ hash: l.transactionHash });
    if (tx.to && !sameAddr(tx.to, ethRegistry)) {
      try { if (sameAddr(await pub.readContract({ address: tx.to, abi: REGISTRAR, functionName: 'ETH_REGISTRY' }), ethRegistry)) return getAddress(tx.to); } catch { /* not the registrar */ }
    }
  }
  throw new Error('could not find the ETHRegistrar; set ENS_ETH_REGISTRAR');
}

// ---- 2b. Castle holds the lease name castle.<parent> in this same registry ---------------------------------
// Castle.claim() registers `castle` here (ROLE_REGISTRAR), renew() extends it (ROLE_RENEW), relink() links
// castle.* to the holder's record in this resolver (ROLE_LINK), and fum's price goes to ENS data (ROLE_SET_DATA).
const CASTLE = opt('castle', process.env.CASTLE_ADDRESS || ext.castle || null);
if (CASTLE) {
  const castle = getAddress(CASTLE);
  const regRoles = R.REGISTRAR | R.RENEW;
  const resRoles = RS.LINK | RS.SET_DATA;   // only Castle writes handoff-price (resource(key) spans every name here)
  if (!(await pub.readContract({ address: state.agentRegistry, abi: REG, functionName: 'hasRootRoles', args: [regRoles, castle] }))) {
    await send(wallet, { address: state.agentRegistry, abi: REG, functionName: 'grantRootRoles', args: [regRoles, castle] }, `grant Castle ${castle} REGISTRAR|RENEW on the agent registry`);
  }
  if (!(await pub.readContract({ address: state.resolver, abi: RES, functionName: 'hasRootRoles', args: [resRoles, castle] }))) {
    await send(wallet, { address: state.resolver, abi: RES, functionName: 'grantRootRoles', args: [resRoles, castle] }, `grant Castle ${castle} LINK|SET_DATA on the agent resolver`);
  }
  state.castle = castle;
  saveState();
}

// ---- 3. the agents ---------------------------------------------------------------------------------------
const crew = JSON.parse(fs.readFileSync(path.join(repo, 'agents/crew.json'), 'utf8')).agents || {};
const roster = [
  ...Object.entries(crew).map(([id, a]) => ({ id, label: id, addr: a.address, mcp: SHIFT_ROLES.has(a.role) ? CASTLE_MCP : DEFAULT_MCP, source: 'crew.json' })),
  ...many('agent').filter(Boolean).map((id) => ({ id, label: id, addr: null, mcp: DEFAULT_MCP, source: 'handoff.lol' })),
];
for (const a of roster) if (MCP_OVERRIDE[a.label]) a.mcp = MCP_OVERRIDE[a.label];
for (const a of roster) {
  if (a.source === 'handoff.lol' || !a.addr) {
    const rec = await handoffAgent(a.id);
    a.addr = rec.wallet_address;
    a.registered_at = rec.registered_at;
  }
  if (!a.addr || !isAddress(a.addr)) throw new Error(`${a.id} has no wallet address`);
  a.addr = getAddress(a.addr);
}

const now = (await pub.getBlock()).timestamp;
state.names = state.names || {};
for (const a of roster) {
  const name = `${a.label}.${parentName}`;
  const node = namehash(name);
  const owner = await pub.readContract({ address: state.agentRegistry, abi: REG, functionName: 'findOwner', args: [a.label] });
  const expiry = await pub.readContract({ address: state.agentRegistry, abi: REG, functionName: 'findExpiry', args: [a.label] });
  if (!sameAddr(owner, a.addr) || expiry <= now) {
    if (owner !== zeroAddress && expiry > now && !sameAddr(owner, a.addr)) throw new Error(`${name} is held by ${owner}, not ${a.addr}; unregister it first`);
    await send(wallet, { address: state.agentRegistry, abi: REG, functionName: 'register', args: [a.label, a.addr, zeroAddress, state.resolver, NAME_OWNER_ROLES, now + YEAR] }, `register ${name} -> ${a.addr}`);
  }
  const calls = [];
  const [curAddr, curMcp, curId] = await Promise.all([
    record(name, 'addr', [node]), record(name, 'text', [node, 'agent-endpoint[mcp]']), record(name, 'text', [node, 'handoff-agent']),
  ]);
  const dns = dnsName(name);
  if (!sameAddr(curAddr, a.addr)) calls.push(encodeFunctionData({ abi: RES, functionName: 'setAddress', args: [dns, 60n, a.addr] }));
  if (curMcp !== a.mcp) calls.push(encodeFunctionData({ abi: RES, functionName: 'setText', args: [dns, 'agent-endpoint[mcp]', a.mcp] }));
  if (curId !== a.id) calls.push(encodeFunctionData({ abi: RES, functionName: 'setText', args: [dns, 'handoff-agent', a.id] }));
  if (calls.length) await send(wallet, { address: state.resolver, abi: RES, functionName: 'multicall', args: [calls] }, `records for ${name} (${calls.length})`);
  state.names[a.label] = { name, node, labelhash: labelhash(a.label), handoff_agent: a.id, addr: a.addr, mcp: a.mcp, registered_at: a.registered_at ?? null };
  saveState();
}

// ---- 4. verify from the outside --------------------------------------------------------------------------
log('\nverify: registry.findOwner/findExpiry (the read JackHook makes) and UniversalResolverV2');
const t = (await pub.getBlock()).timestamp;
let bad = 0;
for (const [label, n] of Object.entries(state.names)) {
  const owner = await pub.readContract({ address: state.agentRegistry, abi: REG, functionName: 'findOwner', args: [label] });
  const expiry = await pub.readContract({ address: state.agentRegistry, abi: REG, functionName: 'findExpiry', args: [label] });
  const urAddr = await pub.getEnsAddress({ name: n.name, universalResolverAddress: A.universalResolver }).catch((e) => `ERR ${e.shortMessage || e.message}`);
  const urMcp = await pub.getEnsText({ name: n.name, key: 'agent-endpoint[mcp]', universalResolverAddress: A.universalResolver }).catch((e) => `ERR ${e.shortMessage || e.message}`);
  const ok = sameAddr(owner, n.addr) && expiry > t && sameAddr(urAddr, n.addr) && urMcp === n.mcp;
  if (!ok) bad++;
  Object.assign(n, { verified: { owner, expiry: Number(expiry), urAddr, urMcp, ok, block: Number(await pub.getBlockNumber()) } });
  log(`  ${ok ? 'OK ' : 'BAD'} ${n.name}  owner ${owner}  expiry ${new Date(Number(expiry) * 1000).toISOString()}  UR addr ${urAddr}  mcp ${urMcp}`);
}
saveState();
log(`\n${Object.keys(state.names).length - bad}/${Object.keys(state.names).length} names verified; state in ${path.relative(repo, stateFile)}`);
process.exit(bad ? 1 : 0);
