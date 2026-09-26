// fum, the auctioneer: Castle's exit through Uniswap's CCA (v2.1.0), gated by JackHook. Each tick:
//   - an auction is running: log its clearing price and raise as they move; once its endBlock has passed, settle it.
//     settleAuction() sweeps the USDC and the unsold WETH home and, if the auction graduated, writes the clearing
//     price to ENS as the next shift's anchor. fum then reads the anchor back from the resolver;
//   - no auction, and the castle has just rotated (a claim after a lapse, not the genesis, within FUM_FRESH_BLOCKS)
//     and the new holder has shipped its book: open the shift-change auction on the WETH the book leaves free, once per epoch
//     (FUM_LOT_WETH caps the lot, in wei; below FUM_MIN_LOT_WETH there is no auction);
//   - FUM_DISSOLVE=1 only: the lease lapsed dissolveGrace ago and nobody claimed it, so dissolve(): dock the whole
//     book and auction all the WETH, once per lapsed epoch. It is off by default because it spends the hoard.
// Every send is simulated first (lib/shift.mjs send); a revert the simulation predicts is logged, not mined.
import { decodeEventLog, formatEther } from 'viem';
import { env } from '../lib/env.mjs';
import { readLease } from '../lib/lease.mjs';
import { abi, contractAddress, txLink } from '../lib/chain.mjs';
import { send } from '../lib/shift.mjs';
import { ensAnchorQ96 } from '../lib/book.mjs';

const LOT_CAP = env('FUM_LOT_WETH', '') ? BigInt(env('FUM_LOT_WETH')) : null;
// Opening a CCA deploys a contract (about 4M gas), so a lot below this is not worth an auction (default 0.0005 WETH).
const MIN_LOT = BigInt(env('FUM_MIN_LOT_WETH', '500000000000000'));
const DISSOLVE = env('FUM_DISSOLVE') === '1';
const LOOKBACK_BLOCKS = BigInt(env('SHIFT_LOOKBACK_BLOCKS', 900));
// A rotation is fresh for this many blocks after its claim (75 is about 15 min on Sepolia). An older one, such as
// the rotation before fum started, gets no auction.
const FRESH_BLOCKS = BigInt(env('FUM_FRESH_BLOCKS', 75));
const Q96 = 1n << 96n;
const usdcPerWeth = (q) => (q == null ? null : Number((q * 10n ** 12n * 100n) / Q96) / 100);
const ZERO = /^0x0{40}$/i;
const CCA_ABI = [
  { type: 'function', name: 'endBlock', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'clearingPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'currencyRaised', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isGraduated', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
];

// The Castle events of `name` since the lookback floor, oldest first.
async function events(ctx, lease, name, args) {
  const fromBlock = lease.block > LOOKBACK_BLOCKS ? lease.block - LOOKBACK_BLOCKS : 0n;
  return ctx.pc.getContractEvents({ address: lease.castle, abi: abi('Castle'), eventName: name, args, fromBlock, toBlock: lease.block });
}
const logsOf = (receipt, name) => receipt.logs.flatMap((l) => {
  try { const d = decodeEventLog({ abi: abi('Castle'), data: l.data, topics: l.topics }); return d.eventName === name ? [d.args] : []; } catch { return []; }
});

async function watchAndSettle(ctx, lease, auction) {
  const read = (functionName) => ctx.pc.readContract({ address: auction, abi: CCA_ABI, functionName });
  const [end, clearing, raised, graduated] = await Promise.all([read('endBlock'), read('clearingPrice'), read('currencyRaised'), read('isGraduated')]);
  ctx.logChange('auction', 'auction', { auction, endBlock: end, blocksLeft: Number(end - lease.block), clearingQ96: clearing, usdcPerWeth: usdcPerWeth(clearing), raised, graduated });
  if (lease.block < end) return;
  const r = await send(ctx, 'settleAuction', []);
  if (!r.ok) return;
  const [s] = logsOf(r.receipt, 'AuctionSettled');
  const anchor = await ensAnchorQ96(ctx.pc, lease.castle);
  ctx.log('settled', {
    auction, tx: r.hash, link: txLink(r.hash), clearingQ96: s?.clearingPriceQ96, usdcPerWeth: usdcPerWeth(s?.clearingPriceQ96),
    raised: s?.currencyRaised, priceWritten: s?.priceWritten,
    // The read-back: what ENS handoff-price holds now, and whether it is the clearing price.
    ensAnchorQ96: anchor, ensUsdcPerWeth: usdcPerWeth(anchor), anchorIsClearing: s?.priceWritten ? anchor === s.clearingPriceQ96 : null,
  });
}

async function openOnRotation(ctx, lease) {
  if (lease.state !== 'LIVE') return;
  const claims = await events(ctx, lease, 'Claimed', { epoch: lease.epoch });
  const claim = claims.at(-1);
  // The genesis claim (prevEpoch 0) is not a shift change; a claim older than the lookback is not fresh.
  if (!claim || claim.args.prevEpoch === 0n) return ctx.logChange('rotation', 'no-rotation', { epoch: lease.epoch, claimed: Boolean(claim) });
  if (lease.block - claim.blockNumber > FRESH_BLOCKS) return ctx.logChange('rotation', 'rotation-not-fresh', { epoch: lease.epoch, claimBlock: claim.blockNumber, freshBlocks: FRESH_BLOCKS });
  const opened = await events(ctx, lease, 'AuctionOpened', { epoch: lease.epoch });
  if (opened.length) return ctx.logChange('rotation', 'auction-done-this-epoch', { epoch: lease.epoch, auction: opened.at(-1).args.auction });
  const shipped = await events(ctx, lease, 'Shipped', { epoch: lease.epoch });
  if (!shipped.length) return ctx.logChange('rotation', 'awaiting-new-book', { epoch: lease.epoch, holder: lease.holder });
  const free = await ctx.pc.readContract({ address: lease.castle, abi: abi('Castle'), functionName: 'freeBalance', args: [contractAddress('weth')] });
  const lot = LOT_CAP != null && LOT_CAP < free ? LOT_CAP : free;
  if (lot < MIN_LOT) return ctx.logChange('rotation', 'no-free-weth', { epoch: lease.epoch, freeWeth: formatEther(free), minLotWeth: formatEther(MIN_LOT) });
  const r = await send(ctx, 'openAuction', [lot]);
  if (!r.ok) return;
  const [o] = logsOf(r.receipt, 'AuctionOpened');
  ctx.log('auction-opened', {
    kind: 'shift-change', tx: r.hash, link: txLink(r.hash), auction: o?.auction, epoch: lease.epoch, previousEpoch: claim.args.prevEpoch,
    lotWeth: formatEther(lot), floorQ96: o?.floorQ96, floorUsdcPerWeth: usdcPerWeth(o?.floorQ96), endBlock: o?.endBlock,
  });
}

async function dissolveIfDue(ctx, lease) {
  if (!DISSOLVE || lease.state !== 'EXPIRED' || lease.expiry === 0) return;
  const grace = Number(await ctx.pc.readContract({ address: lease.castle, abi: abi('Castle'), functionName: 'dissolveGrace' }));
  if (lease.now < lease.expiry + grace) return ctx.logChange('dissolve', 'dissolve-pending', { at: lease.expiry + grace, inS: lease.expiry + grace - lease.now });
  // Once per lapsed epoch: after settleAuction the lease is still lapsed, and a second dissolve() would auction the
  // unsold WETH (or an operator's refill) again at 80% of the anchor the first auction just wrote.
  const done = await events(ctx, lease, 'Dissolved', { epoch: lease.epoch });
  if (done.length) return ctx.logChange('dissolve', 'dissolved-this-epoch', { epoch: lease.epoch, tx: done.at(-1).transactionHash });
  const r = await send(ctx, 'dissolve', []);
  if (!r.ok) return;
  const [d] = logsOf(r.receipt, 'Dissolved');
  const [o] = logsOf(r.receipt, 'AuctionOpened');
  ctx.log('dissolved', { tx: r.hash, link: txLink(r.hash), strategiesDocked: d?.strategiesDocked, weth: d?.weth, auction: o?.auction, floorUsdcPerWeth: usdcPerWeth(o?.floorQ96), endBlock: o?.endBlock });
}

export default {
  intervalMs: 12_000,
  async tick(ctx) {
    const lease = await readLease(ctx.pc);
    if (!lease.deployed) return ctx.logChange('lease', 'lease', { deployed: false });
    ctx.logChange('lease', 'lease', { state: lease.state, epoch: lease.epoch, holder: lease.holder });
    const auction = await ctx.pc.readContract({ address: lease.castle, abi: abi('Castle'), functionName: 'auction' });
    if (!ZERO.test(auction)) return watchAndSettle(ctx, lease, auction);
    await openOnRotation(ctx, lease);
    await dissolveIfDue(ctx, lease);
  },
  async onMessage(ctx, msg) {
    ctx.log('noted', { from: msg.from, kind: msg.kind });
  },
};
