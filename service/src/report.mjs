// Signed reports from the crew: the off-chain half of the stream. fee reports its price (every block), fo each order
// it routes, and fi a ship the vault reverted (a reverted tx emits no logs). A report is signed by the agent's own
// Sepolia key (EIP-191 over the canonical message below) and verified against agents/crew.json, so no one else can
// put words in an agent's mouth; a report older than MAX_AGE_MS is refused as a replay.
import { verifyMessage, getAddress, isHex } from 'viem';
import { crewConfig } from './config.mjs';
import { emit, view } from './stream.mjs';
import { refusedShip, beats, nameOf } from './indexer.mjs';

const MAX_AGE_MS = 5 * 60_000;
// What each agent may say. Anything else is refused.
const ALLOWED = {
  fee: ['price', 'agent'],
  fi: ['allocation.refused', 'agent'],
  fo: ['intent.routed', 'agent'],
  fum: ['agent'],
};

// The exact bytes an agent signs: one line per field, the data as canonical JSON (keys sorted). agents/lib/report.mjs
// builds the same string.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(typeof v === 'bigint' ? v.toString() : v);
}
export const reportMessage = ({ agent, type, t, data }) => `castle-report/1\n${agent}\n${type}\n${t}\n${canonical(data)}`;

const bad = (status, message) => Object.assign(new Error(message), { status });
const seen = new Set();

export async function acceptReport(body) {
  const { agent, type, t, data, sig } = body || {};
  const who = crewConfig()[agent];
  if (!who?.address) throw bad(403, `unknown agent ${agent}`);
  if (!ALLOWED[agent]?.includes(type)) throw bad(403, `${agent} may not report ${type}`);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > MAX_AGE_MS) throw bad(400, 'stale or missing t (unix ms)');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw bad(400, 'data must be an object');
  const ok = await verifyMessage({ address: getAddress(who.address), message: reportMessage({ agent, type, t, data }), signature: sig }).catch(() => false);
  if (!ok) throw bad(401, `bad signature for ${agent}`);
  const key = `${agent}:${type}:${t}`;
  if (seen.has(key)) return { ok: true, duplicate: true };
  seen.add(key);
  if (seen.size > 20_000) seen.clear();

  const m = { t, src: 'agent' };
  switch (type) {
    case 'price': {
      if (!/^\d+(\.\d+)?$/.test(String(data.mid)) || !Number.isInteger(data.spreadBps) || data.spreadBps < 0 || data.spreadBps >= 10_000) throw bad(400, 'price needs mid ("2412.50") and spreadBps (integer 0..9999)');
      const ev = emit('price', { mid: String(data.mid), spreadBps: data.spreadBps, hookFeeBps: data.hookFeeBps ?? null, by: 'fee', source: data.source ?? null, henMid: data.henMid ?? null, driftBps: data.driftBps ?? null, sigmaBps: data.sigmaBps ?? null, recentre: data.recentre ?? null }, { ...m, block: data.block ?? null });
      return { ok: true, seq: ev.seq };
    }
    case 'intent.routed': {
      const ev = emit('intent.routed', { id: data.id, source: data.source ?? 'mcp', swapper: data.swapper ?? null, swapperName: data.swapperName ?? nameOf(data.swapper), tokenIn: data.tokenIn, tokenOut: data.tokenOut, amountIn: data.amountIn, route: data.route, strategy: data.strategy ?? null, amountOut: data.amountOut ?? null, alternative: data.alternative ?? null, by: 'fo' }, m);
      return { ok: true, seq: ev.seq };
    }
    case 'allocation.refused': {
      if (!isHex(data.tx || '') || data.tx.length !== 66) throw bad(400, 'allocation.refused needs the reverted ship tx hash');
      const ev = await refusedShip(data.tx);
      return { ok: true, seq: ev?.seq ?? null, duplicate: !ev };
    }
    case 'agent': {
      // A signed beat. It counts as liveness beside handoff's last_seen (indexer.pollAgents, which also shows an
      // agent going down); the stream hears only a change: an agent coming up, or a new note.
      const note = String(data.note ?? '').slice(0, 200) || null;
      beats.set(agent, Math.max(beats.get(agent) ?? 0, t));
      const prev = view().agents.get(agent);
      if (prev?.alive && (prev.note ?? null) === note) return { ok: true, seq: null };
      const ev = emit('agent', { id: agent, role: prev?.role ?? null, alive: true, lastBeat: t, note }, m);
      return { ok: true, seq: ev.seq };
    }
    default: throw bad(400, `unknown report type ${type}`);
  }
}
