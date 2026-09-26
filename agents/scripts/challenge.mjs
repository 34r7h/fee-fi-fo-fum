#!/usr/bin/env node
// Castle v3, one shot: a crew member other than the holder calls challenge(), which gives the holder RESPONSE_WINDOW
// (60s) to respond() on-chain. A live holder's loop answers it (lib/shift.mjs respondIfChallenged) and earns a 600s
// cooldown; an unanswered one opens claim() early. The standby's loop challenges a silent holder by itself
// (challengeIfSilent); this is the manual trigger, e.g. to show a live holder answering. Simulated first.
//   node agents/scripts/challenge.mjs --as fee|fi
import fs from 'node:fs';
import { parseEventLogs } from 'viem';
import path from 'node:path';
import { AGENTS_ROOT, loadEnv } from '../lib/env.mjs';
import { publicClient, walletClient, loadAccount, abi, deployments, txLink } from '../lib/chain.mjs';
import { readLease } from '../lib/lease.mjs';
import { send } from '../lib/shift.mjs';

loadEnv();
const argv = process.argv.slice(2);
const id = argv[argv.indexOf('--as') + 1] || 'fi';
const crew = JSON.parse(fs.readFileSync(path.join(AGENTS_ROOT, 'crew.json'), 'utf8'));
const log = (event, data = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), agent: id, event, ...data }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const account = loadAccount(id);
const pc = publicClient();
const ctx = { id, crew, log, logChange: log, pc, wallet: walletClient(account), account, deployments, abi };

const lease = await readLease(pc);
if (lease.version !== 3) { log('refused', { reason: 'challenge() is Castle v3' }); process.exit(1); }
const r = await send(ctx, 'challenge', []);
// The deadline from the receipt's Challenged event: a live holder may have answered before a lease read would see it.
const [ev] = r.ok ? parseEventLogs({ abi: abi('Castle'), logs: r.receipt.logs, eventName: 'Challenged' }) : [];
log(r.ok ? 'challenge-sent' : 'challenge-failed', { tx: r.hash ?? null, link: r.hash ? txLink(r.hash) : null, reason: r.reason ?? null, holder: lease.holder, deadline: ev ? Number(ev.args.deadline) : null });
process.exitCode = r.ok ? 0 : 1;
