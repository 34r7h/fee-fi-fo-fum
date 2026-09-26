# Uniswap

Uniswap CCA is the exit. When a shift ends, or when nobody claims a lapsed castle, Castle opens an auction of the WETH it holds. JackHook is the validation hook: a bid is allowed only when the bidder holds a non-expired name in the feefifofum registry. This build does not deploy a v4 pool or a v4 hook.

## Addresses

| Contract | Address | Deploy |
|---|---|---|
| CCA factory | [`0x000000001F26a0044BaA66024e7b6599c61963F8`](https://sepolia.etherscan.io/address/0x000000001F26a0044BaA66024e7b6599c61963F8) | external, `contracts/deployments/sepolia.json` |
| JackHook | [`0x50919ddaaf8294865652D53b45f210019AB2fcAd`](https://sepolia.etherscan.io/address/0x50919ddaaf8294865652D53b45f210019AB2fcAd) | [`0x94cdb321…c539`](https://sepolia.etherscan.io/tx/0x94cdb321f6279e83bd718dd20ac613a525d45ebf15ac0714b90c2356827dc539) |

## Call sites

The lines are from the deployed source, commit `7b863212f649c07327ac53966e8fae40f813cfb7`.

- [`Castle._openAuction` calls `CCA_FACTORY.create`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L546) at line 546. The auction is 25 blocks and the floor is 80% of the anchor. [`requiredCurrencyRaised`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L543) at line 543 is set to 50% of the lot valued at that floor.
- [`JackHook.validate`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/JackHook.sol#L29) reads `getOwner` at line 29 and `getExpiry` at line 31. `hookData` is the bidder's label. It does not call UniversalResolverV2.
- [`Castle.settleAuction`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L467) writes the clearing price through `_writePrice` when the auction graduated (lines 467–479). [`_writePrice` calls `RESOLVER.setData`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L561) at line 561.
- Developer-experience notes are in [FEEDBACK.md](../FEEDBACK.md). The form itself is for the operator to submit.
