#!/usr/bin/env node
// One crew member of feefifofum:  node agents/run.mjs <fee|fi|fo|fum>
//
// Each agent is its own OS process, so one can stop or crash without taking the others down.
// The process:
//   - signs every handoff call with its own key (lib/handoff.mjs) and sends agent_heartbeat every
//     HEARTBEAT_MS. Liveness never goes through handoff messages, which are charged and rate-limited;
//   - runs one handoff-realtime listener (lib/listener.mjs) and hands each inbound message to its role;
//   - reads and writes Sepolia through viem (lib/chain.mjs) with its self-custodied key;
//   - runs its role's tick loop (roles/<id>.mjs). Signing decisions stay in code: no model sits between an
//     inbound message and a key.
// Logs are JSON lines on stdout.
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_ROOT, loadEnv, env } from './lib/env.mjs';
import { handoffClient } from './lib/handoff.mjs';
import { publicClient, walletClient, loadAccount, deployments, abi, addressLink } from './lib/chain.mjs';
import { startListener } from './lib/listener.mjs';
import { report, serviceBase } from './lib/report.mjs';

loadEnv();
const crew = JSON.parse(fs.readFileSync(path.join(AGENTS_ROOT, 'crew.json'), 'utf8'));
const id = process.argv[2];
if (!crew.agents[id]) {
  console.error(`usage: node agents/run.mjs <${Object.keys(crew.agents).join('|')}>`);
  process.exit(2);
}

const log = (event, data = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), agent: id, event, ...data }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const last = new Map();
// Logs `event` only when `value` differs from the previous one under `key`, so a steady state stays quiet.
const logChange = (key, event, value) => {
  const s = JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  if (last.get(key) !== s) { last.set(key, s); log(event, value); }
};

const account = loadAccount(id);
if (account.address.toLowerCase() !== crew.agents[id].address.toLowerCase()) {
  throw new Error(`${id}: key file address ${account.address} differs from crew.json ${crew.agents[id].address}`);
}
const pc = publicClient();
const chainId = await pc.getChainId();
if (chainId !== crew.chain_id) throw new Error(`${id}: RPC is chain ${chainId}, expected ${crew.chain_id} (Sepolia or a fork of it)`);
const [block, balance] = await Promise.all([pc.getBlockNumber(), pc.getBalance({ address: account.address })]);
log('start', { role: crew.agents[id].role, address: account.address, link: addressLink(account.address), chainId, block, balanceWei: balance, rpc: new URL(env('SEPOLIA_RPC_URL')).host });

const h = handoffClient(id);
const role = (await import(`./roles/${id}.mjs`)).default;
const ctx = { id, crew, log, logChange, h, pc, wallet: walletClient(account), account, deployments, abi };

let stopping = false;
// CREW_OFFLINE=1 (fork rehearsals while the live crew runs): no agent_heartbeat and no listener, so the rehearsal
// never shows as the live agent's liveness and never touches its inbox or its listener.
const OFFLINE = env('CREW_OFFLINE') === '1';
// Each beat also goes to the castle service as a signed 'agent' report, so the stream shows who is up (the fork
// run's only liveness, since it sends no agent_heartbeat).
const heartbeat = async () => {
  if (!OFFLINE) {
    try { await h.heartbeat(); logChange('hb', 'heartbeat', { ok: true }); }
    catch (e) { logChange('hb', 'heartbeat', { ok: false, error: e.message }); }
  }
  if (serviceBase()) {
    const r = await report({ ...ctx, log: () => {} }, 'agent', {});
    logChange('beat', 'service-beat', { ok: !!r?.ok, error: r?.ok ? undefined : r?.error ?? 'unreachable' });
  }
};
await heartbeat();
const hbTimer = setInterval(heartbeat, Number(env('HEARTBEAT_MS', 20_000)));

const listener = OFFLINE ? { stop() {} } : startListener(id, (msg) => {
  if (msg.raw !== undefined) { log('listener', { line: msg.raw }); return; }
  log('message', { from: msg.from, kind: msg.kind, envelope: msg.envelope });
  Promise.resolve(role.onMessage?.(ctx, msg)).catch((e) => log('message-error', { error: e.message }));
}, log);

await role.init?.(ctx);
const intervalMs = role.intervalMs || 10_000;
(async function loop() {
  while (!stopping) {
    try { await role.tick?.(ctx); } catch (e) { logChange('tick-error', 'tick-error', { error: e.shortMessage || e.message }); }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
})();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    clearInterval(hbTimer);
    listener.stop();
    log('stop', { signal: sig });
    setTimeout(() => process.exit(0), 200);
  });
}
