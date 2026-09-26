#!/usr/bin/env node
// Registers fee, fi, fo and fum on handoff, each with a signing key generated HERE.
//
// Only the Ed25519 PUBLIC key (sig_pubkey) goes to the broker; the private half is written to
// ~/.handoff/agents/<id>/config.json (0600) before the register call, so a crash can't lose it. The broker's
// one-time bearer key (agent_key) is saved to the same file and never printed. Idempotent: an agent that
// already has a config with sig_privkey is not re-registered, only its profile is refreshed.
//
//   node agents/scripts/register-crew.mjs [id ...]      (default: every agent in agents/crew.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { HANDOFF_API, configPath, writeConfig, readConfig, handoffClient } from '../lib/handoff.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const crew = JSON.parse(fs.readFileSync(path.join(here, '..', 'crew.json'), 'utf8'));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(crew.agents);

for (const id of ids) {
  const a = crew.agents[id];
  if (!a) { console.log(`${id}: not in crew.json, skipped`); continue; }
  let cfg = fs.existsSync(configPath(id)) ? readConfig(id) : null;
  let registered = 'existing';
  if (!cfg?.sig_privkey) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const sig_pubkey = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    cfg = { agent_id: id, sig_privkey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
    writeConfig(id, cfg);
    const r = await fetch(`${HANDOFF_API}/agents/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent_id: id, name: id, description: a.description, capabilities: a.capabilities, sig_pubkey, wallet_address: a.address }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) { console.log(`${id}: register FAILED ${r.status}: ${j?.error || 'no body'}`); continue; }
    const agentKey = j.agent_key || j.key || j.credentials?.agent_key;
    if (agentKey) cfg.agent_key = agentKey;
    writeConfig(id, cfg);
    registered = `registered${agentKey ? ' (+agent_key saved)' : ''}${j.sig_privkey ? ' — broker ALSO returned a sig_privkey: ignored, local key kept' : ''}`;
  }
  const h = handoffClient(id);
  const profile = await h.setProfile({ persona: a.persona, interests: a.interests }).then(() => 'ok', (e) => `FAILED ${e.message}`);
  const me = await h.getAgent().catch((e) => ({ error: e.message }));
  const ag = me?.agent || me;
  console.log(`${id}: ${registered}; profile ${profile}; signed GET ${me?.error ? `FAILED ${me.error}` : 'ok'}; wallet ${ag?.wallet_address || ag?.wallet?.address || '?'}; config ${configPath(id)} (0600)`);
}
