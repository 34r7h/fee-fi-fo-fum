// Castle v3's liveness: the holder and fo co-sign Heartbeat(epoch, validUntil) under Castle's EIP-712 domain, and a
// taker brings the pair to every fill. The fence runs the live curve only if both signatures are from the live holder
// and fo and block time is in [validUntil - 120s, validUntil]; anything else winds the book down (USDC in only).
// On the wire it is 138 bytes: validUntil (uint64, big-endian) | holder signature (65: r,s,v) | fo signature (65).
import { concat, hashTypedData, recoverTypedDataAddress, size, slice, toHex, hexToBigInt } from 'viem';
import { castleDomain } from './attest.mjs';

export const HEARTBEAT_TYPES = { Heartbeat: [{ name: 'epoch', type: 'uint256' }, { name: 'validUntil', type: 'uint64' }] };
export const HEARTBEAT_LENGTH = 138;
export const MAX_HEARTBEAT_TTL = 120;

const typed = ({ chainId, castle, epoch, validUntil }) => ({
  domain: castleDomain(chainId, castle), types: HEARTBEAT_TYPES, primaryType: 'Heartbeat',
  message: { epoch: BigInt(epoch), validUntil: BigInt(validUntil) },
});

export const heartbeatDigest = (hb) => hashTypedData(typed(hb));
export const signHeartbeat = (account, hb) => account.signTypedData(typed(hb));
export const heartbeatSigner = (hb, signature) => recoverTypedDataAddress({ ...typed(hb), signature });

export function packHeartbeat(validUntil, holderSig, foSig) {
  const packed = concat([toHex(BigInt(validUntil), { size: 8 }), holderSig, foSig]);
  if (size(packed) !== HEARTBEAT_LENGTH) throw new Error(`heartbeat is ${size(packed)} bytes, not ${HEARTBEAT_LENGTH}`);
  return packed;
}

export function unpackHeartbeat(packed) {
  if (size(packed) !== HEARTBEAT_LENGTH) throw new Error(`heartbeat is ${size(packed)} bytes, not ${HEARTBEAT_LENGTH}`);
  return { validUntil: Number(hexToBigInt(slice(packed, 0, 8))), holderSig: slice(packed, 8, 73), foSig: slice(packed, 73, 138) };
}
