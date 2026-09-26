// fo's seal: the EIP-712 attestation Castle.renew() requires, exactly as ICastleLease declares it.
//   Domain: name "fee-fi-fo-fum Castle", version "1", chainId, verifyingContract = Castle
//   Type:   Attestation(uint256 epoch,uint64 expiry,uint64 deadline)
// The signature is the 65-byte r‖s‖v that OpenZeppelin's ECDSA.recover accepts.
import { hashTypedData, recoverTypedDataAddress } from 'viem';

export const CASTLE_DOMAIN_NAME = 'fee-fi-fo-fum Castle';
export const CASTLE_DOMAIN_VERSION = '1';
export const ATTESTATION_TYPES = {
  Attestation: [
    { name: 'epoch', type: 'uint256' },
    { name: 'expiry', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
  ],
};

export const castleDomain = (chainId, castle) => ({ name: CASTLE_DOMAIN_NAME, version: CASTLE_DOMAIN_VERSION, chainId, verifyingContract: castle });

const typed = ({ chainId, castle, epoch, expiry, deadline }) => ({
  domain: castleDomain(chainId, castle),
  types: ATTESTATION_TYPES,
  primaryType: 'Attestation',
  message: { epoch: BigInt(epoch), expiry: BigInt(expiry), deadline: BigInt(deadline) },
});

export const attestationDigest = (att) => hashTypedData(typed(att));

export const signAttestation = (account, att) => account.signTypedData(typed(att));

export const attestationSigner = (att, signature) => recoverTypedDataAddress({ ...typed(att), signature });
