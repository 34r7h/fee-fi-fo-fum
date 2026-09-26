// One handoff-realtime listener per agent, as a child whose stdout is this agent's doorbell.
//
// It runs the machine copy of the listener (~/.handoff/bin/handoff-realtime.mjs), never a fork of it, with the
// id on the command line so a targeted kill is possible. If this agent was killed with -9, its old listener
// is orphaned and still holds the inbox lease (a second one exits 3), so start() reaps exactly that one first.
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';

const SCRIPT = process.env.HANDOFF_REALTIME || path.join(os.homedir(), '.handoff', 'bin', 'handoff-realtime.mjs');

function reapOrphan(id, log) {
  let out = '';
  try { out = execFileSync('pgrep', ['-fl', `handoff-realtime ${id}`], { encoding: 'utf8' }); } catch { return; }
  const mine = new RegExp(`^(\\d+) handoff-realtime ${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
  for (const line of out.split('\n')) {
    const m = line.match(mine);
    if (m && Number(m[1]) !== process.pid) {
      try { process.kill(Number(m[1]), 'SIGTERM'); log('listener-reaped', { pid: Number(m[1]) }); } catch { /* already gone */ }
    }
  }
}

// "MSG <envelope> from <sender> [<kind>] <text>" → { envelope, from, kind, text }; other lines → { raw }.
export function parseLine(line) {
  const m = line.match(/^MSG (\S+) from (\S+) \[([^\]]+)\] ?(.*)$/);
  return m ? { envelope: m[1], from: m[2], kind: m[3], text: m[4] } : { raw: line };
}

export function startListener(id, onEvent, log) {
  let child = null;
  let stopping = false;
  let restarts = 0;
  const launch = () => {
    child = spawn(process.execPath, [SCRIPT, '--agent', id], { stdio: ['ignore', 'pipe', 'pipe'] });
    readline.createInterface({ input: child.stdout }).on('line', (line) => onEvent(parseLine(line)));
    readline.createInterface({ input: child.stderr }).on('line', (line) => log('listener-stderr', { line }));
    child.on('exit', (code, signal) => {
      log('listener-exit', { code, signal });
      if (stopping) return;
      if (code === 3) { log('listener-lease-held', { note: 'another listener holds this inbox; not starting a second' }); return; }
      const delay = Math.min(60_000, 1500 * 2 ** restarts++);
      setTimeout(launch, delay);
    });
    log('listener-started', { pid: child.pid, script: SCRIPT });
  };
  reapOrphan(id, log);
  launch();
  return {
    stop() { stopping = true; if (child && child.exitCode === null) child.kill('SIGTERM'); },
    pid: () => child?.pid,
  };
}
