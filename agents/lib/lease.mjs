// The castle lease as every crew member sees it: holder, epoch, expiry, and the fence state a fill would get.
import { abi, castleVersion, contractAddress } from './chain.mjs';

// LIVE: the holder may ship, and fills pass (on v3, only with a current heartbeat). EXPIRED: fills wind down
// (reduce-only) until someone claims. A claim starts a new epoch; a program shipped under an older epoch is fenced
// with FeeFiFoFum(). v3 adds the challenge: a crew member other than the holder calls challenge(), and the holder
// has RESPONSE_WINDOW (60s) to respond() on-chain. Unanswered, claim() opens early (`claimable`), and the holder can
// no longer ship, dock, relink or renew.
export async function readLease(pc, { blockNumber } = {}) {
  const castle = contractAddress('castle');
  if (!castle) return { deployed: false };
  const version = castleVersion();
  const castleAbi = abi('ICastleLease');
  const read = (functionName) => pc.readContract({ address: castle, abi: castleAbi, functionName, ...(blockNumber ? { blockNumber } : {}) });
  const [holder, epoch, expiry, leasePeriod, fo, block, challengeDeadline, cooldownUntil] = await Promise.all([
    read('holder'), read('epoch'), read('expiry'), read('leasePeriod'), read('fo'),
    blockNumber ? pc.getBlock({ blockNumber }) : pc.getBlock(),
    version === 3 ? read('challengeDeadline') : 0n, version === 3 ? read('challengeCooldownUntil') : 0n,
  ]);
  const now = Number(block.timestamp);
  const deadline = Number(challengeDeadline);
  const state = now < Number(expiry) ? 'LIVE' : 'EXPIRED';
  const unanswered = deadline !== 0 && now >= deadline;
  return {
    deployed: true,
    version,
    castle,
    holder,
    epoch,
    expiry: Number(expiry),
    leasePeriod: Number(leasePeriod),
    fo,
    now,
    secondsLeft: Number(expiry) - now,
    state,
    // v3: an open challenge the holder can still answer, and one it left unanswered (claim() is open early).
    challenge: { deadline, cooldownUntil: Number(cooldownUntil), open: deadline !== 0 && now < deadline, unanswered },
    claimable: Number(expiry) !== 0 && (state === 'EXPIRED' || unanswered),
    block: block.number,
  };
}

// The crew id whose EOA is `address` (the lease holder is an address; liveness is tracked per handoff id).
export const crewIdOf = (crew, address) =>
  Object.entries(crew.agents).find(([, a]) => address && a.address.toLowerCase() === address.toLowerCase())?.[0];
