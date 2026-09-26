// The castle lease as every crew member sees it: holder, epoch, expiry, and the fence state a fill would get.
import { abi, contractAddress } from './chain.mjs';

// LIVE: holder may ship and fills pass. EXPIRED: fills wind down (reduce-only) until someone claims.
// A claim starts a new epoch; a program shipped under an older epoch is fenced with FeeFiFoFum().
export async function readLease(pc) {
  const castle = contractAddress('castle');
  if (!castle) return { deployed: false };
  const castleAbi = abi('ICastleLease');
  const read = (functionName) => pc.readContract({ address: castle, abi: castleAbi, functionName });
  const [holder, epoch, expiry, block] = await Promise.all([read('holder'), read('epoch'), read('expiry'), pc.getBlock()]);
  const now = Number(block.timestamp);
  return {
    deployed: true,
    castle,
    holder,
    epoch,
    expiry: Number(expiry),
    now,
    secondsLeft: Number(expiry) - now,
    state: now < Number(expiry) ? 'LIVE' : 'EXPIRED',
    block: block.number,
  };
}
