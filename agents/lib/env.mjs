// Environment for the crew. agents/.env holds real values and is git-ignored; agents/.env.example fills in
// the public defaults (RPC endpoints, key paths) and leaves secrets empty. Values already in process.env win.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(AGENTS_ROOT, '..');

export const expandHome = (p) => (p && p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);

function loadFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export function loadEnv() {
  loadFile(path.join(AGENTS_ROOT, '.env'));
  loadFile(path.join(AGENTS_ROOT, '.env.example'));
  return process.env;
}

export const env = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
};

// ETHERSCAN_API_KEY directly, or read from the 0600 file the operator provides.
export function etherscanKey() {
  if (env('ETHERSCAN_API_KEY')) return env('ETHERSCAN_API_KEY');
  const f = expandHome(env('ETHERSCAN_API_KEY_FILE'));
  return f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : undefined;
}
