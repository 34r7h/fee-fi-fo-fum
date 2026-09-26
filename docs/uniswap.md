# Uniswap

Uniswap CCA is the exit. When a shift ends, or when nobody claims a lapsed castle, Castle opens an auction of the WETH it holds. JackHook is the validation hook: a bid is allowed only when the bidder holds a non-expired name in the feefifofum registry. This build does not deploy a v4 pool or a v4 hook.

## Addresses

| Contract | Address | Deploy |
|---|---|---|
| CCA factory | [`0x000000001F26a0044BaA66024e7b6599c61963F8`](https://sepolia.etherscan.io/address/0x000000001F26a0044BaA66024e7b6599c61963F8) | external, `contracts/deployments/sepolia.json` |
| JackHook | [`0x50919ddaaf8294865652D53b45f210019AB2fcAd`](https://sepolia.etherscan.io/address/0x50919ddaaf8294865652D53b45f210019AB2fcAd) | [`0x94cdb321…c539`](https://sepolia.etherscan.io/tx/0x94cdb321f6279e83bd718dd20ac613a525d45ebf15ac0714b90c2356827dc539) |

## Call sites

- `Castle._openAuction` calls `CCA_FACTORY.create` at `contracts/src/Castle.sol` line 612. The auction is 25 blocks, the floor is 80% of the anchor, and graduation requires currency equal to 50% of the lot at that floor.
- `JackHook.validate` reads `getOwner` and `getExpiry` at `contracts/src/JackHook.sol` lines 29 and 31. `hookData` is the bidder's label. It does not call UniversalResolverV2.
- `Castle.settleAuction` writes the clearing price through `_writePrice` when the auction graduated (`Castle.sol` lines 467–479). `_writePrice` calls `RESOLVER.setData` at line 627.
- Developer-experience notes are in [FEEDBACK.md](../FEEDBACK.md). The form itself is for the operator to submit.
