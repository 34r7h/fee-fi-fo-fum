// castle_route reaches fo wherever fo runs. With FO_URL set, the service posts the order to fo's /route. Otherwise
// fo polls this service: GET /fo/next parks until there is an order to route (or answers 204), and fo posts its
// route to POST /fo/answer. Both are signed by fo's own Sepolia key (EIP-191 over foMessage), checked against
// agents/crew.json, so only fo takes orders and only fo answers them.
import { verifyMessage, getAddress } from 'viem';
import { crewConfig } from './config.mjs';
import { canonical } from './report.mjs';

const MAX_SKEW_MS = 60_000;
const ANSWER_MS = 20_000;
const REDELIVER_MS = 8_000;   // a job handed to a poll that fo never answered goes out again
const jobs = [];              // orders fo has not answered: {id, order, takenAt}
const waiting = new Map();    // id -> {resolve, reject, timer}
const parked = [];            // fo's parked polls: functions that hand one job over
let lastPoll = 0;
let n = 0;

// The exact bytes fo signs; agents/lib/report.mjs builds the same string.
export const foMessage = ({ what, t, body }) => `castle-fo/1\n${what}\n${t}\n${canonical(body ?? {})}`;
const bad = (status, message) => Object.assign(new Error(message), { status });

async function checkFo(what, t, sig, body) {
  const fo = crewConfig().fo?.address;
  if (!fo) throw bad(503, 'no fo in agents/crew.json');
  t = Number(t);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > MAX_SKEW_MS) throw bad(400, 'stale or missing t (unix ms)');
  const ok = await verifyMessage({ address: getAddress(fo), message: foMessage({ what, t, body }), signature: sig }).catch(() => false);
  if (!ok) throw bad(401, 'not signed by fo');
}

export const foPolling = () => Date.now() - lastPoll < 30_000;

// castle_route without FO_URL: hand the order to fo's poll and wait for its answer.
export function routeViaPoll(order) {
  if (!foPolling()) return Promise.reject(bad(503, 'fo is not reachable: FO_URL is unset and fo is not polling this service'));
  const id = `r-${Date.now()}-${++n}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      settle(id);
      reject(bad(504, `fo did not answer within ${ANSWER_MS / 1000} s`));
    }, ANSWER_MS);
    waiting.set(id, { resolve, reject, timer });
    const job = { id, order, takenAt: null };
    jobs.push(job);
    const give = parked.shift();
    if (give) { job.takenAt = Date.now(); give({ id, order }); }
  });
}
function settle(id) {
  waiting.delete(id);
  const i = jobs.findIndex((j) => j.id === id);
  if (i >= 0) jobs.splice(i, 1);
}
function pick() {
  const job = jobs.find((j) => !j.takenAt || Date.now() - j.takenAt > REDELIVER_MS);
  if (!job) return null;
  job.takenAt = Date.now();
  return { id: job.id, order: job.order };
}

// GET /fo/next (x-fo-t and x-fo-sig, as headers or ?t=&sig=, over foMessage({what: 'next', t})): {id, order}, or
// null after waitMs.
export async function next(headers, query, waitMs = 10_000) {
  await checkFo('next', headers['x-fo-t'] ?? query.get('t'), headers['x-fo-sig'] ?? query.get('sig'), {});
  lastPoll = Date.now();
  const ready = pick();
  if (ready) return ready;
  return new Promise((resolve) => {
    const give = (job) => { clearTimeout(timer); resolve(job); };
    const timer = setTimeout(() => {
      const i = parked.indexOf(give);
      if (i >= 0) parked.splice(i, 1);
      lastPoll = Date.now();
      resolve(null);
    }, waitMs);
    parked.push(give);
  });
}

// POST /fo/answer {id, result, error, t, sig}: fo's route for job id (result), or why it has none (error).
export async function answer(body) {
  const { id, result = null, error = null, t, sig } = body || {};
  await checkFo('answer', t, sig, { id, result, error });
  const w = waiting.get(id);
  if (!w) return { ok: false, note: `no order ${id} is waiting (it timed out or was answered)` };
  settle(id);
  clearTimeout(w.timer);
  if (error) w.reject(bad(422, error)); else w.resolve(result);
  return { ok: true };
}
