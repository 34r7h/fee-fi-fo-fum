#!/usr/bin/env node
// Creates a self-custodied Ethereum Sepolia EOA per crew agent.
//
// The private key goes straight from `cast wallet new` into ~/.handoff/agents/<id>/sepolia.key (0600).
// Only the address is printed, and an existing key is never overwritten. The public address is also written to
// sepolia.address next to it. Copy the addresses into agents/crew.json.
//
//   node agents/scripts/new-wallets.mjs [id ...]      (default: fee fi fo fum)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { agentDir } from '../lib/handoff.mjs';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['fee', 'fi', 'fo', 'fum'];
for (const id of ids) {
  const dir = agentDir(id);
  const keyFile = path.join(dir, 'sepolia.key');
  if (fs.existsSync(keyFile)) { console.log(`${id}: key exists, kept (${fs.readFileSync(path.join(dir, 'sepolia.address'), 'utf8').trim()})`); continue; }
  const w = JSON.parse(execFileSync('cast', ['wallet', 'new', '--json'], { encoding: 'utf8' })).data[0];
  if (!/^0x[0-9a-fA-F]{64}$/.test(w.private_key) || !/^0x[0-9a-fA-F]{40}$/.test(w.address)) throw new Error('unexpected `cast wallet new --json` output shape');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyFile, `${w.private_key}\n`, { mode: 0o600 });
  fs.chmodSync(keyFile, 0o600);
  fs.writeFileSync(path.join(dir, 'sepolia.address'), `${w.address}\n`);
  console.log(`${id}: ${w.address}`);
}
