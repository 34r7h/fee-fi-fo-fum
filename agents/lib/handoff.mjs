// Signed handoff client for the fee-fi-fo-fum crew.
//
// Every request is signed with the agent's own Ed25519 key, so no bearer key goes on the wire. The key is
// the `sig_privkey` (PKCS8 DER, base64) in ~/.handoff/agents/<id>/config.json, mode 0600, and never in git.
// The broker verifies this statement:
//   handoff-signed-req\n<agent_id>\n<METHOD>\n<path>\n<unix ms>\n<sha256 hex of the body>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, createPrivateKey, sign } from 'node:crypto';

export const HANDOFF_API = process.env.HANDOFF_API || 'https://handoff.lol/api/v1';
export const HANDOFF_HOME = process.env.HANDOFF_HOME || path.join(os.homedir(), '.handoff');

export const agentDir = (id) => path.join(HANDOFF_HOME, 'agents', id);
export const configPath = (id) => path.join(agentDir(id), 'config.json');

export function readConfig(id) {
  const p = configPath(id);
  const mode = fs.statSync(p).mode & 0o777;
  if (mode & 0o077) throw new Error(`${p} is mode ${mode.toString(8)}; chmod 600 it before use`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Writes the config atomically at 0600. Callers pass whole objects; nothing here logs a value.
export function writeConfig(id, cfg) {
  fs.mkdirSync(agentDir(id), { recursive: true, mode: 0o700 });
  const p = configPath(id);
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, p);
  fs.chmodSync(p, 0o600);
  return p;
}

export function signedHeaders(agentId, sigPrivB64, method, url, bodyStr = '') {
  const ts = Date.now();
  const bodyHash = createHash('sha256').update(Buffer.from(bodyStr || '', 'utf8')).digest('hex');
  const stmt = `handoff-signed-req\n${agentId}\n${method.toUpperCase()}\n${new URL(url).pathname}\n${ts}\n${bodyHash}`;
  const key = createPrivateKey({ key: Buffer.from(sigPrivB64, 'base64'), format: 'der', type: 'pkcs8' });
  return { 'x-agent-id': agentId, 'x-signature': sign(null, Buffer.from(stmt, 'utf8'), key).toString('base64'), 'x-timestamp': String(ts) };
}

export function handoffClient(agentId, { api = HANDOFF_API, timeoutMs = 20000 } = {}) {
  const cfg = readConfig(agentId);
  if (!cfg.sig_privkey) throw new Error(`${configPath(agentId)} has no sig_privkey`);
  async function call(method, pathname, body) {
    const url = `${api}${pathname}`;
    const bodyStr = body === undefined ? '' : JSON.stringify(body);
    const headers = { 'content-type': 'application/json', ...signedHeaders(agentId, cfg.sig_privkey, method, url, bodyStr) };
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method, headers, body: bodyStr || undefined, signal: ac.signal });
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        const err = new Error(`${method} ${pathname} → ${r.status}: ${json?.error || 'no body'}`);
        err.status = r.status; err.body = json;
        throw err;
      }
      return json;
    } finally { clearTimeout(t); }
  }
  return {
    agentId,
    call,
    getAgent: (id = agentId) => call('GET', `/agents/${encodeURIComponent(id)}`),
    // Liveness. The ENS lease renew is the real heartbeat; this only makes the agent visible on handoff.
    heartbeat: (status = 'alive', extra = {}) => call('POST', `/agents/${encodeURIComponent(agentId)}/heartbeat`, { status, ...extra }),
    setProfile: (fields) => call('PUT', `/agents/${encodeURIComponent(agentId)}/profile`, fields),
    setCapabilities: (capabilities) => call('PUT', `/agents/${encodeURIComponent(agentId)}/capabilities`, { capabilities }),
    setWallet: (address, network = 'ethereum-sepolia') => call('PUT', `/agents/${encodeURIComponent(agentId)}/wallet`, { address, network }),
    // Each message is charged and rate-limited: use it for incidents and hand-offs, never for liveness.
    send: (to, text, extra = {}) => call('POST', '/agents/send_message', { from: agentId, to, text, ...extra }),
  };
}
