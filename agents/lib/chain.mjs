// viem on Ethereum Sepolia for the crew: a public client over the primary and fallback RPCs from env, and a
// wallet client over the agent's self-custodied key file. Addresses come from contracts/deployments/sepolia.json
// and ABIs from contracts/out-abi/ (after p1-deploy) or the interface stubs in agents/abi/.
import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, fallback, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { AGENTS_ROOT, REPO_ROOT, env, expandHome } from './env.mjs';

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

// Keys the contracts lane uses for the same contract.
const ALIASES = { router: ['router', 'aquaSwapVMRouter'], extruction: ['extruction', 'feeFiFoFumExtruction', 'fence'] };

// Castle v3 is contracts.castle from its deploy on, and v2 lives on under the deployments' v2 block until its hoard
// is drained. CASTLE_VERSION=2 addresses v2 (castle and its fence; everything else is shared); the default is v3.
export const castleVersion = () => (env('CASTLE_VERSION', '3') === '2' ? 2 : 3);
const V2_ONLY = new Set(['castle', 'extruction']);

// The deployed address of a contract by its deployments.json key (e.g. "castle"), or undefined before deploy.
export function contractAddress(name) {
  const d = deployments();
  const v2 = castleVersion() === 2 && V2_ONLY.has(name) ? d.v2 : null;
  for (const k of ALIASES[name] || [name]) {
    const v = v2 ? v2[k] : d.contracts?.[k] ?? d.external?.[k];
    if (v) return typeof v === 'string' ? v : v.address;
  }
  return undefined;
}

// v3's Castle and fence ABIs are in contracts/out-abi/v3/; v3's Castle ABI also stands in for ICastleLease, whose v3
// form adds the heartbeat, challenge and respond.
const V3_ABIS = { Castle: 'Castle', ICastleLease: 'Castle', FeeFiFoFumExtruction: 'FeeFiFoFumExtruction' };
export function abi(name) {
  const v3 = castleVersion() === 3 && V3_ABIS[name] ? [path.join(REPO_ROOT, 'contracts', 'out-abi', 'v3', `${V3_ABIS[name]}.json`)] : [];
  for (const p of [...v3, path.join(REPO_ROOT, 'contracts', 'out-abi', `${name}.json`), path.join(AGENTS_ROOT, 'abi', `${name}.json`)]) {
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      return Array.isArray(j) ? j : j.abi;
    }
  }
  throw new Error(`no ABI for ${name} in contracts/out-abi/ or agents/abi/`);
}

export const txLink = (hash) => `https://sepolia.etherscan.io/tx/${hash}`;
export const addressLink = (a) => `https://sepolia.etherscan.io/address/${a}`;
