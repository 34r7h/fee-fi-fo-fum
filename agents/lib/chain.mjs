// viem on Ethereum Sepolia for the crew: a public client over the primary and fallback RPCs from env, and a
// wallet client over the agent's self-custodied key file. Addresses come from contracts/deployments/sepolia.json
// (DEPLOYMENTS_PATH points a fork run at its own file) and ABIs from contracts/out-abi/ or lib/abis.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, fallback, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { AGENTS_ROOT, REPO_ROOT, env, expandHome } from './env.mjs';
import { ABIS } from './abis.mjs';

const isLocal = (u) => /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(u);

export function rpcUrls() {
  const primary = env('SEPOLIA_RPC_URL');
  if (!primary) throw new Error('SEPOLIA_RPC_URL is not set (see agents/.env.example)');
  // A local anvil fork never falls back to the real chain: a rehearsal must not leak a write onto Sepolia.
  if (isLocal(primary)) return [primary];
  return [primary, env('SEPOLIA_RPC_URL_FALLBACK'), env('SEPOLIA_RPC_URL_FALLBACK_2')].filter(Boolean);
}

const transport = () => fallback(rpcUrls().map((u) => http(u, { timeout: 10_000, retryCount: 1 })));

export const publicClient = () => createPublicClient({ chain: sepolia, transport: transport() });

export function keyPath(id) {
  return expandHome(env(`${id.toUpperCase()}_KEY_PATH`, `~/.handoff/agents/${id}/sepolia.key`));
}

export function loadAccount(id) {
  const p = keyPath(id);
  if ((fs.statSync(p).mode & 0o077) !== 0) throw new Error(`${p} must be mode 0600`);
  const key = fs.readFileSync(p, 'utf8').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${p} does not hold one 0x-prefixed private key`);
  return privateKeyToAccount(key);
}

export const walletClient = (account) => createWalletClient({ account, chain: sepolia, transport: transport() });

export function deployments() {
  const p = path.resolve(AGENTS_ROOT, env('DEPLOYMENTS_PATH', '../contracts/deployments/sepolia.json'));
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Keys the contracts lane might use for the same contract (docs/SPEC.md names first). The lease edition's castle
// (an entry with a "version" of v2 or v3) is retired at tag lease-edition, and nothing here reads it.
const ALIASES = {
  castle: ['castleVault', 'CastleVault', 'vault', 'castle'],
  priceExtruction: ['priceExtruction', 'PriceExtruction'],
  quoteResolver: ['quoteResolver', 'offchainQuoteResolver', 'OffchainQuoteResolver'],
  hook: ['castleJITHook', 'CastleJITHook', 'jitHook', 'hook'],
  router: ['router', 'aquaSwapVMRouter'],
  poolManager: ['poolManager', 'v4PoolManager'],
  poolSwapTest: ['poolSwapTest', 'v4PoolSwapTest'],
  v4Quoter: ['v4Quoter', 'quoter'],
  chainlink: ['chainlinkEthUsd', 'ethUsdFeed', 'chainlink'],
  universalResolver: ['universalResolver', 'universalResolverV2'],
};
const RETIRED = new Set(['v2', 'v3']);

// The deployed address of a contract by its deployments.json key (e.g. "castle"), or undefined before deploy.
export function contractAddress(name) {
  const d = deployments();
  for (const k of ALIASES[name] || [name]) {
    const v = d.contracts?.[k] ?? d.external?.[k];
    if (!v) continue;
    if (typeof v === 'string') return v;
    if (v.address && !RETIRED.has(v.version)) return v.address;
  }
  return undefined;
}

// ABIs: the contracts lane's export in contracts/out-abi/<Name>.json wins; lib/abis.mjs covers the rest.
export function abi(name) {
  const p = path.join(REPO_ROOT, 'contracts', 'out-abi', `${name}.json`);
  if (fs.existsSync(p)) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(j) ? j : j.abi;
  }
  if (ABIS[name]) return ABIS[name];
  throw new Error(`no ABI for ${name} in contracts/out-abi/ or lib/abis.mjs`);
}

export const txLink = (hash) => `https://sepolia.etherscan.io/tx/${hash}`;
export const addressLink = (a) => `https://sepolia.etherscan.io/address/${a}`;
