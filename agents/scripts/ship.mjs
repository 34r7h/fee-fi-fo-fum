#!/usr/bin/env node
// The live holder ships its book as one shot, outside the renew loop: docks every strategy still on Aqua from an
// earlier epoch, then ships centred on the ENS anchor (lib/shift.mjs shipBook, the call the roles make), and reads
// the program back from Aqua's Shipped event (band centre against ENS handoff-price, fence epoch).
// Refuses unless --as is the live holder.
//   SHIP_MAX_WETH=… SHIP_MAX_USDC=… SHIP_RANGE_BPS=… node agents/scripts/ship.mjs --as fi
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_ROOT, loadEnv } from '../lib/env.mjs';
import { publicClient, walletClient, loadAccount, abi, deployments } from '../lib/chain.mjs';
import { readLease } from '../lib/lease.mjs';
import { shipBook, openStrategies, SHIP_PARAMS } from '../lib/shift.mjs';

loadEnv();
const argv = process.argv.slice(2);
const id = argv.includes('--as') ? argv[argv.indexOf('--as') + 1] : 'fi';
const crew = JSON.parse(fs.readFileSync(path.join(AGENTS_ROOT, 'crew.json'), 'utf8'));
const log = (event, data = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), agent: id, event, ...data }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const account = loadAccount(id);
if (account.address.toLowerCase() !== crew.agents[id].address.toLowerCase()) throw new Error(`${id}: key file address differs from crew.json`);
const pc = publicClient();
const ctx = { id, crew, log, logChange: log, pc, wallet: walletClient(account), account, deployments, abi };

const lease = await readLease(pc);
if (lease.state !== 'LIVE' || lease.holder.toLowerCase() !== account.address.toLowerCase()) {
  log('refused', { reason: `${id} is not the live holder (holder ${lease.holder}, ${lease.state})` });
  process.exit(1);
}
const stale = (await openStrategies(ctx, lease)).filter((s) => BigInt(s.epoch) !== BigInt(lease.epoch));
log('ship', { epoch: lease.epoch, secondsLeft: lease.secondsLeft, docking: stale.map((s) => s.strategyHash), params: SHIP_PARAMS() });
const r = await shipBook(ctx, { dock: stale });
process.exit(r.ok ? 0 : 1);
