// Fill replay: every Aqua fill against the Castle, re-judged against the lease timeline.
//
// Aqua's events carry no indexed fields, so the log filter is by event and the Castle is matched as maker.
// A strategy belongs to the epoch that was live when it was Shipped. A fill (a tx with a Pulled from the Castle)
// is then:
//   live        same epoch, before expiry: an ordinary fill;
//   wind-down   same epoch, after expiry, before any claim: allowed only as reduce-only;
//   FENCE-BREACH  the strategy's epoch is no longer the live one: FeeFiFoFum() should have reverted it.
import { parseAbiItem } from 'viem';

const AQUA_EVENTS = {
  Shipped: parseAbiItem('event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)'),
  Docked: parseAbiItem('event Docked(address maker, address app, bytes32 strategyHash)'),
  Pulled: parseAbiItem('event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount)'),
  Pushed: parseAbiItem('event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount)'),
};
const LEASE_EVENTS = {
  LeaseRenewed: parseAbiItem('event LeaseRenewed(address indexed holder, uint256 indexed epoch, uint64 expiry)'),
  LeaseClaimed: parseAbiItem('event LeaseClaimed(address indexed holder, uint256 indexed epoch, uint256 previousEpoch, uint64 expiry)'),
};

const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
const byOrder = (x, y) => (x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : Number(x.blockNumber - y.blockNumber));

// Lease timeline from Castle's own events: [{ block, logIndex, epoch, expiry }] in chain order.
async function leaseTimeline(pc, castle, fromBlock, toBlock) {
  const [renewed, claimed] = await Promise.all([
    pc.getLogs({ address: castle, event: LEASE_EVENTS.LeaseRenewed, fromBlock, toBlock }),
    pc.getLogs({ address: castle, event: LEASE_EVENTS.LeaseClaimed, fromBlock, toBlock }),
  ]);
  return [...renewed, ...claimed].sort(byOrder).map((l) => ({ blockNumber: l.blockNumber, logIndex: l.logIndex, epoch: l.args.epoch, expiry: Number(l.args.expiry), claim: l.eventName === 'LeaseClaimed' }));
}

// The (epoch, expiry) in force just before log position (block, logIndex), given the state at fromBlock.
function leaseAt(timeline, initial, blockNumber, logIndex) {
  let s = initial;
  for (const e of timeline) {
    if (e.blockNumber > blockNumber || (e.blockNumber === blockNumber && e.logIndex >= logIndex)) break;
    s = { epoch: e.epoch, expiry: e.expiry };
  }
  return s;
}

export async function replayFills(pc, { aqua, castle, fromBlock, toBlock, initial }) {
  const [shipped, pulled, pushed, timeline] = await Promise.all([
    pc.getLogs({ address: aqua, event: AQUA_EVENTS.Shipped, fromBlock, toBlock }),
    pc.getLogs({ address: aqua, event: AQUA_EVENTS.Pulled, fromBlock, toBlock }),
    pc.getLogs({ address: aqua, event: AQUA_EVENTS.Pushed, fromBlock, toBlock }),
    leaseTimeline(pc, castle, fromBlock, toBlock),
  ]);
  const strategyEpoch = new Map();
  for (const l of shipped.filter((l) => same(l.args.maker, castle)).sort(byOrder)) {
    strategyEpoch.set(l.args.strategyHash, leaseAt(timeline, initial, l.blockNumber, l.logIndex).epoch);
  }
  const fills = new Map();
  for (const l of [...pulled, ...pushed].filter((l) => same(l.args.maker, castle)).sort(byOrder)) {
    const f = fills.get(l.transactionHash) || { tx: l.transactionHash, blockNumber: l.blockNumber, logIndex: l.logIndex, strategyHash: l.args.strategyHash, out: [], in: [] };
    (l.eventName === 'Pulled' ? f.out : f.in).push({ token: l.args.token, amount: l.args.amount });
    fills.set(l.transactionHash, f);
  }
  const blockTime = new Map();
  const out = [];
  for (const f of fills.values()) {
    if (!blockTime.has(f.blockNumber)) blockTime.set(f.blockNumber, Number((await pc.getBlock({ blockNumber: f.blockNumber })).timestamp));
    const ts = blockTime.get(f.blockNumber);
    const live = leaseAt(timeline, initial, f.blockNumber, f.logIndex);
    const shippedEpoch = strategyEpoch.get(f.strategyHash);
    let verdict;
    if (shippedEpoch === undefined) verdict = 'unknown-strategy';
    else if (BigInt(shippedEpoch) !== BigInt(live.epoch)) verdict = 'FENCE-BREACH';
    else verdict = ts < live.expiry ? 'live' : 'wind-down';
    out.push({ ...f, timestamp: ts, epochAtFill: live.epoch, expiryAtFill: live.expiry, shippedEpoch, verdict });
  }
  return { fills: out, lastBlock: toBlock, shipped: shipped.filter((l) => same(l.args.maker, castle)).length };
}

// Quote freshness: seconds since the Castle last shipped a strategy at or after `sinceBlock`.
export async function lastShipAge(pc, { aqua, castle, sinceBlock, now }) {
  const logs = (await pc.getLogs({ address: aqua, event: AQUA_EVENTS.Shipped, fromBlock: sinceBlock, toBlock: 'latest' })).filter((l) => same(l.args.maker, castle));
  if (!logs.length) return null;
  const last = logs.sort(byOrder).at(-1);
  const b = await pc.getBlock({ blockNumber: last.blockNumber });
  return { ageS: now - Number(b.timestamp), tx: last.transactionHash, strategyHash: last.args.strategyHash };
}

export { AQUA_EVENTS, LEASE_EVENTS };
