#!/usr/bin/env node
// fee's genesis on a castle nobody has claimed yet, as one shot outside the renew loop: the same two moves fee's
// tick makes (lib/shift.mjs) and no renewals after them, so the lease lapses on its own unless the crew runs.
//   1. multicall([claim, relink]): Castle mints castle.feefifofum.eth to itself for fee and links it to fee's record;
//   2. ship(SHIP_PARAMS): the book centred on the ENS anchor, read back from Aqua's Shipped event.
// Refuses a castle that was claimed before, and an unset anchor (a claim without a ship starts the clock on an
// empty castle). Every send is simulated first.
//
//   SHIP_MAX_WETH=3000000000000000 SHIP_MAX_USDC=8000000 SHIP_RANGE_BPS=100000000 node agents/scripts/genesis.mjs
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_ROOT, loadEnv } from '../lib/env.mjs';
import { publicClient, walletClient, loadAccount, contractAddress, abi, deployments } from '../lib/chain.mjs';
import { readLease } from '../lib/lease.mjs';
import { claimCastle, shipBook, SHIP_PARAMS } from '../lib/shift.mjs';

loadEnv();
const id = 'fee';
const crew = JSON.parse(fs.readFileSync(path.join(AGENTS_ROOT, 'crew.json'), 'utf8'));
const log = (event, data = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), agent: id, event, ...data }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const account = loadAccount(id);
if (account.address.toLowerCase() !== crew.agents[id].address.toLowerCase()) {
  throw new Error(`${id}: key file address ${account.address} differs from crew.json ${crew.agents[id].address}`);
}
const pc = publicClient();
const ctx = { id, crew, log, logChange: log, pc, wallet: walletClient(account), account, deployments, abi };
const castle = contractAddress('castle');

const lease = await readLease(pc);
const anchorQ96 = await pc.readContract({ address: castle, abi: abi('Castle'), functionName: 'anchorPriceQ96' });
const refuse = (reason) => { log('refused', { castle, reason }); process.exit(1); };
if (!lease.deployed) refuse('no Castle code at the deployments address');
if (lease.expiry !== 0) refuse(`castle was claimed before (epoch ${lease.epoch}, expiry ${lease.expiry}): an expired lease is fi's to claim`);
if (anchorQ96 === 0n) refuse('anchorPriceQ96 is 0: the owner seeds setAnchorPrice first');
log('genesis', { castle, anchorQ96, ship: SHIP_PARAMS() });

const c = await claimCastle(ctx);
if (!c.ok) process.exit(1);
const after = await readLease(pc);
log('claimed', { tx: c.hash, epoch: after.epoch, expiry: after.expiry, holder: after.holder, state: after.state });
const s = await shipBook(ctx);
process.exit(s.ok ? 0 : 1);
