#!/usr/bin/env node
// A named Jack bids in Castle's running CCA (Uniswap CCA v2.1.0): USDC in through Permit2, gated by JackHook, which
// checks that the bidder owns <label>.feefifofum.eth. Crew keys only (fo is named but not crew).
//   node agents/scripts/bid.mjs --as fo [--label fo] [--amount <usdc atomic>|min] [--max-price <Q96>]
//        [--backup-unless 0x<bidder> --blocks-before-end 10] [--dry-run]
// --amount min is the graduation threshold (GRADUATION_PCT of the lot's value at the floor) plus 1%.
// --backup-unless waits for an auction, then for endBlock - N, and bids only if that address has not bid by then.
// The max price defaults to 1.5x the price the bid alone would clear at, since a late bid only buys the supply
// still to come. Every step is simulated before it is sent; the output is one JSON line.
import { decodeEventLog, erc20Abi, maxUint256, parseAbi, toHex } from 'viem';
import { loadEnv } from '../lib/env.mjs';
import { publicClient, walletClient, loadAccount, contractAddress, abi, txLink } from '../lib/chain.mjs';

loadEnv();
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry-run');
const who = opt('as', 'fo');
const label = opt('label', who);
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const Q96 = 1n << 96n;
const MPS = 10_000_000n;
const CCA = parseAbi([
  'function submitBid(uint256 maxPrice, uint128 amount, address owner, bytes hookData) payable returns (uint256)',
  'function endBlock() view returns (uint64)',
  'function startBlock() view returns (uint64)',
  'function clearingPrice() view returns (uint256)',
  'function floorPrice() view returns (uint256)',
  'function tickSpacing() view returns (uint256)',
  'function totalSupply() view returns (uint128)',
  'function currencyRaised() view returns (uint256)',
  'event BidSubmitted(uint256 indexed id, address indexed owner, uint256 priceQ96, uint128 amount)',
  'error ValidationHookCallFailed(bytes reason)',
  'error BidMustBeAboveClearingPrice()',
  'error AuctionIsOver()',
  'error AuctionSoldOut()',
  'error TickPriceNotAtBoundary()',
]);
const P2 = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
]);

const pc = publicClient();
const account = loadAccount(who);
const wallet = walletClient(account);
const castle = contractAddress('castle'), usdc = contractAddress('usdc');
const C = abi('Castle');
const out = (o) => console.log(JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A transient RPC error must not end a watch that has to bid minutes later.
const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 30) throw e; await sleep(3000); } } };
const errName = (e) => e?.walk?.((x) => x?.data?.errorName)?.data?.errorName || e?.shortMessage || e?.message;

async function currentAuction() {
  const a = await pc.readContract({ address: castle, abi: C, functionName: 'auction' });
  return /^0x0{40}$/i.test(a) ? null : a;
}

const txs = [];
const send = async (what, req) => {
  await pc.simulateContract({ ...req, account });
  if (DRY) { txs.push({ what, dryRun: true }); return null; }
  const hash = await wallet.writeContract(req);
  const rc = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 });
  txs.push({ what, tx: txLink(hash), status: rc.status, gasUsed: rc.gasUsed });
  if (rc.status !== 'success') throw new Error(`${what} reverted: ${hash}`);
  return rc;
};
// USDC -> Permit2 -> the auction. Moves no funds, so backup mode does it before it waits and the bid is one tx.
async function approve(auction, amount) {
  const toPermit2 = await pc.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [account.address, PERMIT2] });
  if (toPermit2 < amount) await send('USDC.approve(Permit2)', { address: usdc, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, maxUint256] });
  const [allowed, expiration] = await pc.readContract({ address: PERMIT2, abi: P2, functionName: 'allowance', args: [account.address, usdc, auction] });
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (allowed < amount || BigInt(expiration) < now + 600n) {
    await send('Permit2.approve(USDC, auction)', { address: PERMIT2, abi: P2, functionName: 'approve', args: [usdc, auction, amount, Number(now + 86_400n)] });
  }
  return toPermit2 >= amount;
}

let auction = opt('auction', null);
const unless = opt('backup-unless', null);
if (unless) {
  // Wait for the auction, approve, wait for endBlock - N, then bid only if `unless` has not.
  const before = BigInt(opt('blocks-before-end', 10));
  while (!(auction ||= await retry(currentAuction))) await sleep(6000);
  const end = await retry(() => pc.readContract({ address: auction, abi: CCA, functionName: 'endBlock' }));
  const bal = await pc.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  const cap = opt('amount', 'min') === 'min' ? bal : BigInt(opt('amount'));
  try { await approve(auction, cap > bal ? bal : cap); } catch (e) { out({ event: 'approve-failed', auction, reason: errName(e), txs }); process.exit(1); }
  out({ event: 'watching', auction, endBlock: end, bidAt: end - before, unless, approvals: txs });
  let head;
  while ((head = await retry(() => pc.getBlockNumber())) < end - before) await sleep(4000);
  const start = await retry(() => pc.readContract({ address: auction, abi: CCA, functionName: 'startBlock' }));
  const theirs = await retry(() => pc.getLogs({ address: auction, event: CCA.find((x) => x.name === 'BidSubmitted'), args: { owner: unless }, fromBlock: start, toBlock: head }));
  if (theirs.length) { out({ event: 'no-backup-needed', auction, head, theirBids: theirs.map((l) => ({ id: l.args.id, amount: l.args.amount, tx: txLink(l.transactionHash) })) }); process.exit(0); }
  out({ event: 'backup-bid', auction, head, reason: `${unless} has not bid by endBlock - ${before}` });
}
auction ||= await currentAuction();
if (!auction) { out({ event: 'refused', reason: 'Castle has no running auction' }); process.exit(1); }

// The lot, floor and threshold as Castle set them (Castle._openAuction), read from the auction itself.
const [end, floor, tick, clearing, supply, head] = await Promise.all([
  pc.readContract({ address: auction, abi: CCA, functionName: 'endBlock' }),
  pc.readContract({ address: auction, abi: CCA, functionName: 'floorPrice' }),
  pc.readContract({ address: auction, abi: CCA, functionName: 'tickSpacing' }),
  pc.readContract({ address: auction, abi: CCA, functionName: 'clearingPrice' }),
  pc.readContract({ address: auction, abi: CCA, functionName: 'totalSupply' }),
  pc.getBlockNumber(),
]);
if (head >= end) { out({ event: 'refused', auction, reason: `auction ended at block ${end}` }); process.exit(1); }
const gradPct = await pc.readContract({ address: castle, abi: C, functionName: 'GRADUATION_PCT' });
const required = ((supply * floor) / Q96) * gradPct / 100n;
const balance = await pc.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
const want = opt('amount', 'min');
let amount = want === 'min' ? required + required / 100n + 1n : BigInt(want);
if (amount > balance) amount = balance;
// A bid made with r of the 25 blocks left buys only that share of the supply, so alone it clears at about
// amount / (supply * r / 25). Bid above that, on a tick.
const remaining = end - head;
const blocks = end - (await pc.readContract({ address: auction, abi: CCA, functionName: 'startBlock' }));
const alone = (amount * Q96 * blocks) / (supply * remaining);
const floorBid = (clearing > floor ? clearing : floor) + tick;
let maxPrice = opt('max-price', null) ? BigInt(opt('max-price')) : ((alone * 3n) / 2n > floorBid ? (alone * 3n) / 2n : floorBid);
maxPrice = ((maxPrice + tick - 1n) / tick) * tick;
const hookData = toHex(new TextEncoder().encode(label));
const view = (q) => Number((q * 10n ** 12n * 100n) / Q96) / 100;   // USDC per WETH
const plan = { auction, bidder: account.address, label, hookData, amount, required, graduates: amount >= required, balance, maxPrice, maxUsdcPerWeth: view(maxPrice), aloneUsdcPerWeth: view(alone), floorUsdcPerWeth: view(floor), clearingUsdcPerWeth: view(clearing), head, endBlock: end, lotWeth: supply };
if (amount === 0n) { out({ event: 'refused', ...plan, reason: 'no USDC to bid' }); process.exit(1); }

try {
  const approved = await approve(auction, amount);
  if (DRY && !approved) { out({ event: 'dry-run', ...plan, txs, note: 'submitBid not simulated: the approvals it needs were not sent' }); process.exit(0); }
  const rc = await send('submitBid', { address: auction, abi: CCA, functionName: 'submitBid', args: [maxPrice, amount, account.address, hookData] });
  const ids = [];
  for (const l of rc?.logs || []) {
    try { const d = decodeEventLog({ abi: CCA, data: l.data, topics: l.topics }); if (d.eventName === 'BidSubmitted') ids.push(d.args.id); } catch { /* not the CCA's */ }
  }
  out({ event: DRY ? 'dry-run' : 'bid', ...plan, bidIds: ids, txs });
} catch (e) {
  out({ event: 'bid-failed', ...plan, txs, reason: errName(e) });
  process.exit(1);
}
