# ENS

The handoff baseline stored `ens_name` on the agent record and used ENSv1 subnames. This project uses ENSv2 as the liveness signal. A shift is live only while `castle.feefifofum.eth` is unexpired. The token id minted at claim is the fencing epoch. The probes, and why that name cannot be a `.eth` registration, are in [ens-probes.md](ens-probes.md).

## What is live

| Name | Value |
|---|---|
| Parent `feefifofum.eth` | register [`0xc51ab266…8378`](https://sepolia.etherscan.io/tx/0xc51ab2660dd9a0029a201a4acd5330d7e7c2eac063cbfe58bb31039d30338378) |
| Subregistry | [`0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`](https://sepolia.etherscan.io/address/0x2F2164507471a1a46506f902aBfdfB9d22e4bE09) |
| Resolver | [`0x9D2251b5162701BC2bD97d61bc8aa3e53446285E`](https://sepolia.etherscan.io/address/0x9D2251b5162701BC2bD97d61bc8aa3e53446285E) |
| UniversalResolverV2 | [`0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3`](https://sepolia.etherscan.io/address/0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3) |
| ETHRegistry | [`0x657ea849311d3d5823348dded7c2aaafb3ede09e`](https://sepolia.etherscan.io/address/0x657ea849311d3d5823348dded7c2aaafb3ede09e) |

A live read at block timestamp `1790409564`: `castle` on the subregistry has expiry `1790408832`, so `getOwner` is `address(0)`. `latestOwnerOf` the current token is `0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538` (fee). The token id is `5067924479523343920357688704886482849781669170077692837114763432112309665795`. The first claim was [`0xb97ac95e…b6a0`](https://sepolia.etherscan.io/tx/0xb97ac95edc11333e2b80d482219cdf051d0febfa37f0f79abd736edb5e9db6a0).

## Call sites

The lines are from the deployed source, commit `7b863212f649c07327ac53966e8fae40f813cfb7`.

- [`Castle.renew` calls `REGISTRY.renew`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L296) at line 296.
- [`Castle.claim` calls `REGISTRY.register`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L312) with role bitmap `0` at line 312.
- [`Castle.relink` calls `RESOLVER.linkToNode`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L389) at line 389.
- [`Castle._writePrice` calls `RESOLVER.setData`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L561) for `handoff-price` at line 561.
- [`JackHook.validate`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/JackHook.sol#L29) calls `getOwner` at line 29 and `getExpiry` at line 31.

The `.eth` registrar's minimum duration is 28 days and it does not grant `ROLE_RENEW`. The castle label is registered on the subregistry instead. That constraint is measured in [ens-probes.md](ens-probes.md).
