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

- `Castle.renew` calls `REGISTRY.renew` at `contracts/src/Castle.sol` line 315.
- `Castle.claim` calls `REGISTRY.register` with role bitmap `0` at line 333.
- `Castle.relink` calls `RESOLVER.linkToNode` at line 446.
- `Castle._writePrice` calls `RESOLVER.setData` for `handoff-price` at line 627.
- `JackHook.validate` calls `getOwner` and `getExpiry` at `contracts/src/JackHook.sol` lines 29 and 31.

The `.eth` registrar's minimum duration is 28 days and it does not grant `ROLE_RENEW`. The castle label is registered on the subregistry instead. That constraint is measured in [ens-probes.md](ens-probes.md).
