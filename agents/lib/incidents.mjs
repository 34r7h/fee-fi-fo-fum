// Incident reports: published to a handoff broadcast channel, so SirKit, handoff-advisor and agy can subscribe,
// and appended to agents/logs/incidents.jsonl. A channel publish is a charged fan-out, so the same incident
// (kind + epoch) is posted at most once per COOLDOWN_MS.
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_ROOT, env } from './env.mjs';

export const INCIDENT_CHANNEL = env('INCIDENT_CHANNEL', 'fee-fi-fo-fum-incidents');
const COOLDOWN_MS = Number(env('INCIDENT_COOLDOWN_MS', 10 * 60_000));
const posted = new Map();

export async function ensureChannel(h) {
  return h.call('POST', `/channels/${encodeURIComponent(INCIDENT_CHANNEL)}/subscribe`, {
    agent_id: h.agentId,
    description: 'fee-fi-fo-fum incident reports from fo, the fencer and witness: withheld attestations, hung or off-market traders, fence breaches found by fill replay',
  });
}

export async function postIncident(h, incident, log = () => {}) {
  const key = `${incident.kind}:${incident.epoch ?? ''}`;
  const prev = posted.get(key);
  if (prev && Date.now() - prev < COOLDOWN_MS) return { skipped: 'cooldown' };
  posted.set(key, Date.now());
  const content = { kind: 'fffo.incident', ...incident, reporter: h.agentId, at: new Date().toISOString() };
  const dir = path.join(AGENTS_ROOT, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'incidents.jsonl'), JSON.stringify(content, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) + '\n');
  const body = JSON.parse(JSON.stringify({ sender: h.agentId, content }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
  const r = await h.call('POST', `/channels/${encodeURIComponent(INCIDENT_CHANNEL)}/publish`, body);
  log('incident-posted', { kind: incident.kind, channel: INCIDENT_CHANNEL, envelope: r.envelope_id || r.id || r.message_id || null, delivered: r.delivered_to ?? r.recipients ?? null });
  return r;
}
