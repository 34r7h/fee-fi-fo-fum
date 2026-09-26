// Fill replay: every Aqua fill against the Castle, re-judged against the lease timeline.
//
// Castle's own events carry the timeline: Shipped(strategyHash, epoch) says which epoch a strategy belongs to,
// and Renewed/Claimed move (epoch, expiry). Aqua's Pulled/Pushed carry no indexed fields, so those logs are
// filtered by event and the Castle is matched as maker. A fill (a tx that moves Castle tokens) is then:
//   live           same epoch, before expiry: an ordinary fill;
//   wind-down      same epoch, after expiry, before any claim: allowed only as reduce-only;
//   FENCE-BREACH   the strategy's epoch is no longer the live one: FeeFiFoFum() should have reverted it.
import { parseAbiItem } from 'viem';

export const AQUA_EVENTS = {
  Pulled: parseAbiItem('event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount)'),
  Pushed: parseAbiItem('event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount)'),
};
export const CASTLE_EVENTS = {
  Shipped: parseAbiItem('event Shipped(bytes32 indexed strategyHash, uint256 indexed epoch, uint256 anchorQ96, uint256 weth, uint256 usdc)'),
  Docked: parseAbiItem('event Docked(bytes32 indexed strategyHash, uint256 indexed epoch, address indexed dockedBy)'),
  Renewed: parseAbiItem('event Renewed(uint256 indexed epoch, address indexed holder, uint64 expiry, bytes32 attestationDigest)'),
  Claimed: parseAbiItem('event Claimed(uint256 indexed epoch, address indexed holder, uint64 expiry, uint256 prevEpoch)'),
};

const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
const byOrder = (x, y) => (x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : Number(x.blockNumber - y.blockNumber));

async function leaseTimeline(pc, castle, fromBlock, toBlock) {
  const [renewed, claimed] = await Promise.all([
    pc.getLogs({ address: castle, event: CASTLE_EVENTS.Renewed, fromBlock, toBlock }),
    pc.getLogs({ address: castle, event: CASTLE_EVENTS.Claimed, fromBlock, toBlock }),
  ]);
  return [...renewed, ...claimed].sort(byOrder).map((l) => ({ blockNumber: l.blockNumber, logIndex: l.logIndex, epoch: l.args.epoch, expiry: Number(l.args.expiry) }));
}

// The (epoch, expiry) in force just before log position (block, logIndex), given the state at fromBlock.
function leaseAt(timeline, initial, blockNumber, logIndex) {
  let s = { epoch: initial.epoch, expiry: initial.expiry };
  for (const e of timeline) {
    if (e.blockNumber > blockNumber || (e.blockNumber === blockNumber && e.logIndex >= logIndex)) break;
    s = { epoch: e.epoch, expiry: e.expiry };
  }
  return s;
}

export async function replayFills(pc, { aqua, castle, fromBlock, toBlock, initial, shippedEpochOf }) {
  const [shipped, pulled, pushed, timeline] = await Promise.all([
    pc.getLogs({ address: castle, event: CASTLE_EVENTS.Shipped, fromBlock, toBlock }),
    pc.getLogs({ address: aqua, event: AQUA_EVENTS.Pulled, fromBlock, toBlock }),
    pc.getLogs({ address: aqua, event: AQUA_EVENTS.Pushed, fromBlock, toBlock }),
    leaseTimeline(pc, castle, fromBlock, toBlock),
  ]);
  const strategyEpoch = new Map(shipped.map((l) => [l.args.strategyHash, l.args.epoch]));
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
    // A strategy shipped before this window: ask Castle (shippedEpoch mapping) instead of the logs.
    let shippedEpoch = strategyEpoch.get(f.strategyHash);
    if (shippedEpoch === undefined && shippedEpochOf) shippedEpoch = await shippedEpochOf(f.strategyHash);
    let verdict;
    if (shippedEpoch === undefined || shippedEpoch === 0n) verdict = 'unknown-strategy';
    else if (BigInt(shippedEpoch) !== BigInt(live.epoch)) verdict = 'FENCE-BREACH';
    else verdict = ts < live.expiry ? 'live' : 'wind-down';
    out.push({ ...f, timestamp: ts, epochAtFill: live.epoch, expiryAtFill: live.expiry, shippedEpoch, verdict });
  }
  return { fills: out, lastBlock: toBlock };
}

// Quote freshness: seconds since the Castle last shipped a strategy in `epoch` (at or after `sinceBlock`).
export async function lastShipAge(pc, { castle, epoch, sinceBlock, now }) {
  const logs = await pc.getLogs({ address: castle, event: CASTLE_EVENTS.Shipped, args: { epoch }, fromBlock: sinceBlock, toBlock: 'latest' });
  if (!logs.length) return null;
  const last = logs.sort(byOrder).at(-1);
  const b = await pc.getBlock({ blockNumber: last.blockNumber });
  return { ageS: now - Number(b.timestamp), tx: last.transactionHash, strategyHash: last.args.strategyHash, anchorQ96: last.args.anchorQ96 };
}
