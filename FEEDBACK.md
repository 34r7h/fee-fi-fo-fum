# Uniswap developer feedback

ETHGlobal Tokyo 2026, Continuity. The form is <https://developers.uniswap.org/hackathon-feedback>.

This is what we ran into while building and deploying CastleJITHook on Sepolia on 2026-09-26. CastleJITHook is a v4 hook whose pool holds no liquidity: every exact-in swap is filled in `beforeSwap` from a 1inch Aqua strategy, through `BEFORE_SWAP_RETURNS_DELTA`. The hook, and how it fills a swap, are in [docs/uniswap.md](docs/uniswap.md). We built against v4-core `v4.0.0` (`e50237c`).

## A hook-filled swap's `Swap` event reads zero

When `beforeSwap` returns a delta that takes the whole input, the PoolManager still emits `Swap` for the pool's own step. After the hook's delta, that step is 0. From our fork test, for a 1 USDC swap the hook filled for 0.000362644 WETH:

```
emit Swap(id: 0x95e0…889c, sender: PoolSwapTest, amount0: 0, amount1: 0, sqrtPriceX96: 1446501726624926496477173928747177, liquidity: 0, tick: 196256, fee: 0)
```

This is [`PoolManager.swap`](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/PoolManager.sol#L196-L215) passing the hook's `amountToSwap` to [`_swap`](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/PoolManager.sol#L228-L250), which emits the pool's delta. It is correct, but an indexer or explorer reading `Swap` sees a zero trade, and a volume dashboard counts nothing.

The [custom accounting guide](https://docs.uniswap.org/contracts/v4/guides/custom-accounting) explains `BeforeSwapDelta` and custom curves. It does not say what `Swap` will show for them, and it does not point to a standard event. OpenZeppelin's uniswap-hooks has one, [`IHookEvents.HookSwap`](https://github.com/OpenZeppelin/uniswap-hooks/blob/master/src/interfaces/IHookEvents.sol). We found it only after we had shipped our own `JitFill`. One paragraph in that guide, with a pointer to `HookSwap`, would have saved us the trace reading, and it would give indexers one event to look for.

## `sqrtPriceLimitX96` does nothing on a pool like this

With the whole amount taken by the hook, `Pool.swap` sees `amountSpecified == 0` and [returns before the price-limit checks](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/libraries/Pool.sol#L318-L338). We checked it on a Sepolia fork. A `zeroForOne` swap through PoolSwapTest with `sqrtPriceLimitX96 = MAX_SQRT_PRICE - 1`, which a normal pool rejects with `PriceLimitAlreadyExceeded`, went through and filled 1 USDC.

So on a custom-accounting pool, the swapper's usual slippage guard is silently off. CastleJITHook takes an optional `hookData` of `abi.encode(uint256 minAmountOut)` and reverts `TooLittleOut` below it. The router's own minimum-out works too. A swapper who relies on the price limit alone gets no protection, and nothing reverts to tell them. This is worth one sentence in the custom accounting guide and in the hook security notes.

## HookMiner's link in the deployment guide is a 404

The [hook deployment guide](https://docs.uniswap.org/contracts/v4/guides/hooks/hook-deployment) imports `v4-periphery/src/utils/HookMiner.sol` and links it at `github.com/Uniswap/v4-periphery/blob/main/src/utils/HookMiner.sol`. On 2026-09-26 that URL returned 404. On `main`, the file is at [`test/shared/HookMiner.sol`](https://github.com/Uniswap/v4-periphery/blob/main/test/shared/HookMiner.sol). We mined the salt with a [short loop](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/script/DeployHoard.s.sol#L98-L105) in our deploy script instead. It deployed through the CREATE2 deployer `0x4e59…956C`, which is on Sepolia, at an address whose low 14 bits are exactly `0x888`.

## Which v4-core the Sepolia PoolManager is

The [first-hook guide](https://docs.uniswap.org/contracts/v4/guides/hooks/your-first-hook) imports `SwapParams` from `v4-core/src/types/PoolOperation.sol`. The `v4.0.0` tag has no such file: there, it is `IPoolManager.SwapParams`. The deployments page does not say which v4-core release each chain's PoolManager was built from. So a hook builder has to choose between the guide (`main`) and the tag, and nothing says which one matches the deployed contract. We pinned `v4.0.0`, and our fork tests pass against the Sepolia PoolManager `0xE03A…3543`. A release tag next to each deployments row would settle it.

## Two Universal Router addresses for one Sepolia row

The deployments page, section "Sepolia: 11155111", lists an unlabeled Universal Router at `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` (codesize 19540 at block 11785837).

`deployments.json` on the same site says `generatedAt` `2026-07-15T22:25:40.000Z`, and it lists the Sepolia UniversalRouter as `0x470FFC67b1feEEC31D16C46AC7545C98716a194c` (codesize 21738 at the same block).

Both addresses have code, and the page and the JSON feed disagree. The page also does not say which router is wired to the PoolManager in the same table (`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`). Our demo swaps through PoolSwapTest, so we did not send a swap through either router.

## UniswapX is not on the chain ENSv2 is on

ENSv2 for this hackathon is on Sepolia. The UniswapX deployment page lists Ethereum mainnet, Arbitrum, Unichain and Base. It has no Sepolia section.

These published reactors all returned codesize 0 on Sepolia at block 11785837:

- `0x00000011f84b9aa48e5f8aa8b9897600006289be`
- `0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4`
- `0x0000000015757c461808EA25Eb309638B62681cf`
- `0xB274d5F4b833b61B340b654d600A864fB604a87c`
- `0x000000005aF66799D1a6317714D66800f9CA1406`
- `0x000000001Ec5656dcdB24D90DFa42742738De729`
- `0x000000008a8330B5d1F43A62Bf4C673A49f27ba0`

A Sepolia entry cannot fill a live UniswapX order against those addresses. Instead, we take UniswapX-format orders off-chain, and fo routes each one to harp (Aqua) or to the v4 pool.

## What worked

- **A pool with no liquidity is possible.** `BEFORE_SWAP_RETURNS_DELTA` makes one work with no workaround: the pool's own step runs with 0 and needs no ticks and no liquidity. `take`, then `sync`, transfer and `settle` inside `beforeSwap` was enough to fill from an outside market maker in the swap's own transaction.
- **Hook permissions are caught at deploy time.** `Hooks.validateHookPermissions` in the constructor means a hook at a mis-mined address cannot be deployed.
- **The Sepolia addresses were usable without guessing.** PoolManager, PositionManager, Quoter, StateView and PoolSwapTest on the page's Sepolia section all had code at block 11785837. PoolSwapTest is listed, and it is the path our demo swap uses.

Measurements, and the commands behind the codesizes: [docs/research.md](docs/research.md).
