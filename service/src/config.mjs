// Everything the castle service knows about the world comes from here: env, contracts/deployments/sepolia.json
// and miniapp/config.json. No address is written in this service's source. The deployments file is re-read on
// every call, so the service picks up p1-deploy's addresses without a restart.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fromRoot = (p) => path.resolve(root, p);

export const env = {
  port: Number(process.env.PORT || 8787),
  rpcs: [process.env.SEPOLIA_RPC_URL, ...(process.env.SEPOLIA_RPC_URL_FALLBACK || '').split(',')]
    .map((s) => (s || '').trim()).filter(Boolean),
  deploymentsPath: fromRoot(process.env.CASTLE_DEPLOYMENTS || '../contracts/deployments/sepolia.json'),
  ensDeploymentsPath: fromRoot(process.env.CASTLE_ENS_DEPLOYMENTS || '../contracts/deployments/ens-agents.sepolia.json'),
  abiDir: fromRoot(process.env.CASTLE_ABI_DIR || '../contracts/out-abi'),
  miniappConfigPath: fromRoot(process.env.CASTLE_MINIAPP_CONFIG || '../miniapp/config.json'),
  crewPath: fromRoot(process.env.CASTLE_CREW || '../agents/crew.json'),
  dataDir: fromRoot(process.env.CASTLE_DATA_DIR || './data'),
  handoffApi: (process.env.HANDOFF_API || 'https://handoff.lol/api/v1').replace(/\/$/, ''),
  pollMs: Math.max(1, Number(process.env.CASTLE_POLL_SECONDS || 4)) * 1000,
  publicUrl: (process.env.CASTLE_PUBLIC_URL || '').replace(/\/$/, ''),
};
if (!env.rpcs.length) throw new Error('set SEPOLIA_RPC_URL (and optionally SEPOLIA_RPC_URL_FALLBACK)');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const isAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

// deployments/sepolia.json is owned by the contracts lane: {external: {name: "0x…"}, contracts: {name: "0x…" |
// {address, block}}}. A flat {name: "0x…"} map works too. Normalised to {name: {address, block}}; ours win.
// The agent registry and resolver (agent-registry.mjs's state file) fill in below, never over, the contracts lane.
export function deployments() {
  const raw = readJson(env.deploymentsPath) || {};
  const ens = readJson(env.ensDeploymentsPath) || {};
  const obj = (v) => (v && typeof v === 'object' ? v : {});
  const src = { agentRegistry: ens.agentRegistry, agentResolver: ens.resolver, ...raw, ...obj(raw.external), ...obj(raw.contracts) };
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (isAddr(v)) out[k] = { address: v, block: null };
    else if (v && isAddr(v.address)) out[k] = { address: v.address, block: v.block ?? v.deployBlock ?? v.blockNumber ?? null };
  }
  return { chainId: raw.chainId ?? 11155111, contracts: out, raw };
}

// Lookup by any of the names the lanes might use for the same contract.
const ALIASES = {
  castle: ['castle', 'Castle'],
  aqua: ['aqua', 'Aqua'],
  router: ['router', 'aquaSwapVMRouter', 'swapVmRouter', 'AquaSwapVMRouter', 'SwapVMRouter'],
  extruction: ['extruction', 'FeeFiFoFumExtruction', 'fence'],
  jackHook: ['jackHook', 'JackHook'],
  ccaFactory: ['ccaFactory', 'CCAFactory', 'ContinuousClearingAuctionFactory'],
  registry: ['registry', 'ensRegistry', 'ETHRegistry', 'castleRegistry', 'agentRegistry'],
  resolver: ['resolver', 'PermissionedResolver', 'ensResolver', 'agentResolver'],
  universalResolver: ['universalResolver', 'universalResolverV2', 'UniversalResolverV2'],
  usdc: ['usdc', 'USDC'],
  weth: ['weth', 'WETH'],
};
export function addr(name) {
  const { contracts } = deployments();
  for (const k of ALIASES[name] || [name]) if (contracts[k]) return contracts[k].address;
  return null;
}
export function deployBlock(name) {
  const { contracts } = deployments();
  for (const k of ALIASES[name] || [name]) if (contracts[k]?.block != null) return BigInt(contracts[k].block);
  return null;
}
export function addressBook() {
  const out = {};
  for (const k of Object.keys(ALIASES)) out[k] = addr(k);
  return out;
}

// miniapp/config.json: the shift table, the lease name and the agents. Operator config, not chain state.
export function miniappConfig() {
  return readJson(env.miniappConfigPath) || {};
}

// agents/crew.json (the agents lane): fee/fi/fo/fum roles and their Sepolia addresses.
export function crewConfig() {
  return readJson(env.crewPath)?.agents || {};
}

export function dataFile(name) {
  fs.mkdirSync(env.dataDir, { recursive: true });
  return path.join(env.dataDir, name);
}
