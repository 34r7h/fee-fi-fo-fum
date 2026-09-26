// The castle lease as every crew member sees it: holder, epoch, expiry, and the fence state a fill would get.
import { abi, contractAddress } from './chain.mjs';

// LIVE: the holder may ship and fills pass. EXPIRED: fills wind down (reduce-only) until someone claims.
// A claim starts a new epoch; a program shipped under an older epoch is fenced with FeeFiFoFum().
export async function readLease(pc, { blockNumber } = {}) {
  const castle = contractAddress('castle');
  if (!castle) return { deployed: false };
  const castleAbi = abi('ICastleLease');
  const read = (functionName) => pc.readContract({ address: castle, abi: castleAbi, functionName, ...(blockNumber ? { blockNumber } : {}) });
  const [holder, epoch, expiry, leasePeriod, fo, block] = await Promise.all([
    read('holder'), read('epoch'), read('expiry'), read('leasePeriod'), read('fo'),
    blockNumber ? pc.getBlock({ blockNumber }) : pc.getBlock(),
  ]);
  const now = Number(block.timestamp);
  return {
    deployed: true,
    castle,
    holder,
    epoch,
    expiry: Number(expiry),
    leasePeriod: Number(leasePeriod),
    fo,
    now,
    secondsLeft: Number(expiry) - now,
    state: now < Number(expiry) ? 'LIVE' : 'EXPIRED',
    block: block.number,
  };
}

// The crew id whose EOA is `address` (the lease holder is an address; liveness is tracked per handoff id).
export const crewIdOf = (crew, address) =>
  Object.entries(crew.agents).find(([, a]) => address && a.address.toLowerCase() === address.toLowerCase())?.[0];
