# Uniswap developer feedback

This is our feedback for the ETHGlobal Tokyo 2026 Continuity track. The feedback form is at <https://developers.uniswap.org/hackathon-feedback>.

The items below came up while we built and deployed CastleJITHook on Sepolia on 2026-09-26. CastleJITHook is a v4 hook for a pool that holds no liquidity. Using `BEFORE_SWAP_RETURNS_DELTA`, it fills every exact-in swap in `beforeSwap` from a 1inch Aqua strategy. [docs/uniswap.md](docs/uniswap.md) describes the hook and how it fills a swap. We built against v4-core `v4.0.0` (`e50237c`).

## The `Swap` event of a hook-filled swap reports zero amounts

When `beforeSwap` returns a delta that takes the whole input, the PoolManager still emits `Swap` for the pool's own swap step, and after the hook's delta that step is 0. In our fork test, the hook filled a 1 USDC swap for 0.000362644 WETH, and the PoolManager emitted:

```
emit Swap(id: 0x95e0…889c, sender: PoolSwapTest, amount0: 0, amount1: 0, sqrtPriceX96: 1446501726624926496477173928747177, liquidity: 0, tick: 196256, fee: 0)
```

The live Sepolia swap [`0x53f773de…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116) behaves the same way. It swapped 0.5 USDC for 0.000164970 WETH, according to the hook's `JitFill` event in that transaction, but its `Swap` log reports `amount0` 0, `amount1` 0 and `liquidity` 0.

This follows from [`PoolManager.swap`](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/PoolManager.sol#L196-L215), which passes the hook's `amountToSwap` to [`_swap`](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/PoolManager.sol#L228-L250), which emits the pool's own delta. The behaviour is correct, but an indexer or block explorer that reads `Swap` records a zero trade, and a volume dashboard counts nothing for the pool.

The [custom accounting guide](https://docs.uniswap.org/contracts/v4/guides/custom-accounting) explains `BeforeSwapDelta` and custom curves. It does not say what the `Swap` event will contain for them, and it does not point to a standard event for hooks to emit. OpenZeppelin's uniswap-hooks library defines one, [`IHookEvents.HookSwap`](https://github.com/OpenZeppelin/uniswap-hooks/blob/master/src/interfaces/IHookEvents.sol), which we found only after we had deployed our own `JitFill` event. A paragraph in the guide that describes the zero `Swap` event and recommends `HookSwap` would have saved us reading traces, and it would give indexers one event to look for.

## `sqrtPriceLimitX96` is not enforced when the hook takes the whole amount

When the hook takes the whole amount, `Pool.swap` receives `amountSpecified == 0` and [returns before the price-limit checks](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/libraries/Pool.sol#L318-L338). We checked this on a Sepolia fork. A `zeroForOne` swap through PoolSwapTest with `sqrtPriceLimitX96 = MAX_SQRT_PRICE - 1` would be rejected by a normal pool with `PriceLimitAlreadyExceeded`, but on our pool it succeeded and filled 1 USDC.

On a custom-accounting pool, the price limit therefore gives the swapper no slippage protection, and no revert or warning indicates this. CastleJITHook accepts an optional `hookData` of `abi.encode(uint256 minAmountOut)` and reverts with `TooLittleOut` if the output is lower. A router's own minimum-output check also works. A swapper who relies only on the price limit is unprotected. We suggest one sentence about this in the custom accounting guide and in the hook security notes.

## The HookMiner link in the deployment guide returns 404

The [hook deployment guide](https://docs.uniswap.org/contracts/v4/guides/hooks/hook-deployment) imports `v4-periphery/src/utils/HookMiner.sol` and links to `github.com/Uniswap/v4-periphery/blob/main/src/utils/HookMiner.sol`. On 2026-09-26 that URL returned 404. On `main`, the file is at [`test/shared/HookMiner.sol`](https://github.com/Uniswap/v4-periphery/blob/main/test/shared/HookMiner.sol). We found the salt with a [short loop](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/script/DeployHoard.s.sol#L98-L105) in our deploy script instead. The hook was deployed through the CREATE2 deployer `0x4e59…956C`, which exists on Sepolia, at an address whose low 14 bits are exactly `0x888`.

## The deployments page does not state the v4-core release

The [first-hook guide](https://docs.uniswap.org/contracts/v4/guides/hooks/your-first-hook) imports `SwapParams` from `v4-core/src/types/PoolOperation.sol`. The `v4.0.0` tag has no such file, and in that release the type is `IPoolManager.SwapParams`. The deployments page does not say which v4-core release each chain's PoolManager was built from, so a hook builder cannot tell whether the guide's `main` or the tagged release matches the deployed contract. We pinned `v4.0.0`, and our fork tests pass against the Sepolia PoolManager `0xE03A…3543`. Listing the release tag next to each row of the deployments page would answer this.

## Two Universal Router addresses for one Sepolia row

The deployments page, in the section "Sepolia: 11155111", lists an unlabeled Universal Router at `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` (codesize 19540 at block 11785837).

`deployments.json` on the same site has `generatedAt` `2026-07-15T22:25:40.000Z` and lists the Sepolia UniversalRouter as `0x470FFC67b1feEEC31D16C46AC7545C98716a194c` (codesize 21738 at the same block).

Both addresses have code, and the page and the JSON feed disagree. The page also does not say which router works with the PoolManager listed in the same table (`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`). Our demo swaps through PoolSwapTest, so we did not send a swap through either router.

## UniswapX has no Sepolia deployment

The ENSv2 deployment for this hackathon is on Sepolia. The UniswapX deployment page lists Ethereum mainnet, Arbitrum, Unichain and Base, and has no Sepolia section.

These published reactor addresses all returned codesize 0 on Sepolia at block 11785837:

- `0x00000011f84b9aa48e5f8aa8b9897600006289be`
- `0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4`
- `0x0000000015757c461808EA25Eb309638B62681cf`
- `0xB274d5F4b833b61B340b654d600A864fB604a87c`
- `0x000000005aF66799D1a6317714D66800f9CA1406`
- `0x000000001Ec5656dcdB24D90DFa42742738De729`
- `0x000000008a8330B5d1F43A62Bf4C673A49f27ba0`

An entry on Sepolia therefore cannot fill a UniswapX order through a deployed reactor. Instead, our routing agent, fo, accepts UniswapX-format orders off-chain and routes each one either to the vault's RFQ strategy on Aqua or to the v4 pool.

## What worked

`BEFORE_SWAP_RETURNS_DELTA` makes a pool with no liquidity work without any workaround. The pool's own swap step runs with an amount of 0 and needs no ticks or liquidity. Calling `take`, then `sync`, a transfer and `settle` inside `beforeSwap` was enough to fill a swap from an external market maker within the swap's own transaction.

`Hooks.validateHookPermissions` in the constructor catches permission mistakes at deploy time, because a hook at an address with the wrong flags cannot be deployed.

The Sepolia addresses on the v4 deployments page were usable as listed. PoolManager, PositionManager, Quoter, StateView and PoolSwapTest all had code at block 11785837. PoolSwapTest is listed, and our demo swaps go through it.

The measurements, and the commands behind the codesizes, are in [docs/research.md](docs/research.md).
