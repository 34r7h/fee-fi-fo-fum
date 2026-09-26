#!/usr/bin/env node
// After a dissolution, the lease stays lapsed, so once settleAuction() has swept the auction home anyone could call
// dissolve() again. This closes that window: it waits for Castle's running auction to be settled (auction() goes
// back to zero and AuctionSettled is logged), then sends the crew member's claim in the next block, the same
// multicall([claim, dock(open)..., relink]) fi's role sends (lib/shift.mjs claimCastle). One shot.
//   node agents/scripts/claim-after-settle.mjs [--as fi]
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_ROOT, loadEnv } from '../lib/env.mjs';
import { publicClient, walletClient, loadAccount, contractAddress, abi, deployments, txLink } from '../lib/chain.mjs';
import { readLease } from '../lib/lease.mjs';
import { claimCastle, openStrategies } from '../lib/shift.mjs';

loadEnv();
const argv = process.argv.slice(2);
const id = argv.includes('--as') ? argv[argv.indexOf('--as') + 1] : 'fi';
const crew = JSON.parse(fs.readFileSync(path.join(AGENTS_ROOT, 'crew.json'), 'utf8'));
const log = (event, data = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), agent: id, event, ...data }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const account = loadAccount(id);
if (account.address.toLowerCase() !== crew.agents[id].address.toLowerCase()) throw new Error(`${id}: key file address differs from crew.json`);
const pc = publicClient();
const ctx = { id, crew, log, logChange: log, pc, wallet: walletClient(account), account, deployments, abi };
const castle = contractAddress('castle');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 30) throw e; await sleep(2000); } } };
const auctionNow = () => retry(() => pc.readContract({ address: castle, abi: abi('Castle'), functionName: 'auction' }));
const ZERO = /^0x0{40}$/i;

let auction;
while (ZERO.test(auction = await auctionNow())) await sleep(3000);
const opened = await retry(() => pc.getBlockNumber());
log('watching', { auction, fromBlock: opened });
while (!ZERO.test(await auctionNow())) await sleep(1500);
const settled = await retry(() => pc.getContractEvents({ address: castle, abi: abi('Castle'), eventName: 'AuctionSettled', args: { auction }, fromBlock: opened - 5n }));
const s = settled.at(-1);
log('auction-settled', s ? { auction, block: s.blockNumber, tx: txLink(s.transactionHash), clearingQ96: s.args.clearingPriceQ96, raised: s.args.currencyRaised, priceWritten: s.args.priceWritten } : { auction, note: 'auction() cleared but no AuctionSettled found yet' });

const lease = await retry(() => readLease(pc));
if (lease.state !== 'EXPIRED') { log('refused', { reason: `lease is ${lease.state} (holder ${lease.holder}): nothing to claim` }); process.exit(1); }
const stale = await openStrategies(ctx, lease);
const r = await claimCastle(ctx, { dock: stale });
const after = await retry(() => readLease(pc));
log(r.ok ? 'claimed' : 'claim-failed', { tx: r.hash, link: r.hash ? txLink(r.hash) : null, block: r.receipt?.blockNumber, settledBlock: s?.blockNumber, blocksAfterSettle: s && r.receipt ? r.receipt.blockNumber - s.blockNumber : null, newEpoch: after.epoch, previousEpoch: lease.epoch, holder: after.holder, expiry: after.expiry, docked: stale.length, reason: r.reason ?? null });
process.exit(r.ok ? 0 : 1);
