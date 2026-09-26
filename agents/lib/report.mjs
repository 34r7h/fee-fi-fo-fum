// Signed reports to the castle service (service/src/report.mjs): the off-chain half of the stream. The agent signs
// the canonical message with its own Sepolia key (EIP-191) and the service checks it against agents/crew.json.
// CASTLE_SERVICE_URL is the service root (the fork run uses a local one); unset means reports are only logged, and a
// crew on a local fork RPC never reports to a remote service.
import { env } from './env.mjs';

// Must match service/src/report.mjs byte for byte.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(typeof v === 'bigint' ? v.toString() : v);
}
export const reportMessage = ({ agent, type, t, data }) => `castle-report/1\n${agent}\n${type}\n${t}\n${canonical(data)}`;
// fo's poll for castle_route orders (service/src/fo.mjs builds the same string).
export const foMessage = ({ what, t, body }) => `castle-fo/1\n${what}\n${t}\n${canonical(body ?? {})}`;

const plain = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)));

const isLocal = (u) => /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(u || '');
// A crew on a local fork reports only to a local service: its prices and fills are the fork's, not Sepolia's.
export function serviceBase() {
  const base = env('CASTLE_SERVICE_URL');
  if (!base) return null;
  if (isLocal(env('SEPOLIA_RPC_URL')) && !isLocal(base)) return null;
  return base.replace(/\/$/, '');
}

export async function report(ctx, type, data) {
  const base = serviceBase();
  const body = { agent: ctx.id, type, t: Date.now(), data: plain(data) };
  if (!base) { ctx.log('report-skipped', { type, reason: env('CASTLE_SERVICE_URL') ? 'a fork crew reports only to a local service' : 'CASTLE_SERVICE_URL unset' }); return null; }
  body.sig = await ctx.account.signMessage({ message: reportMessage(body) });
  try {
    const r = await fetch(`${base}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    const j = await r.json().catch(() => null);
    if (!r.ok) ctx.log('report-refused', { type, status: r.status, error: j?.error });
    return j;
  } catch (e) {
    ctx.log('report-failed', { type, error: e.message });
    return null;
  }
}

// The service's snapshot (fee's price, the strategies, caps and allocations it has indexed), or null.
export async function serviceState() {
  const base = serviceBase();
  if (!base) return null;
  try {
    const r = await fetch(`${base}/state`, { signal: AbortSignal.timeout(10_000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
