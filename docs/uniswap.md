# Uniswap

Beat 3 is a Uniswap v4 pool with no LP deposit. CastleJITHook fills every exact-in swap from the Castle's `hen` strategy inside `beforeSwap`, in the swap's own transaction. `beforeAddLiquidity` reverts, so the Castle is the pool's only market maker.

Scope: [SPEC.md](SPEC.md) at `43e57ac`. Address measurements: [research.md](research.md). What building the hook ran into: [FEEDBACK.md](../FEEDBACK.md).

## Deployed

Everything is on Ethereum Sepolia, built from source at [`fff518c`](https://github.com/34r7h/fee-fi-fo-fum/tree/fff518c55bfe60c752c0cd9acffbfc285f817f1c). The hook is a Sourcify `exact_match` and is recorded in [contracts/deployments/sepolia.json](../contracts/deployments/sepolia.json).

| What | Address or id | Tx |
|---|---|---|
| CastleJITHook ([Sourcify exact_match](https://repo.sourcify.dev/11155111/0x890125413c9FeDB770D872BbA9415f5E1B7C0888)) | [`0x890125413c9FeDB770D872BbA9415f5E1B7C0888`](https://sepolia.etherscan.io/address/0x890125413c9FeDB770D872BbA9415f5E1B7C0888) | [`0x70bca459…b9e5`](https://sepolia.etherscan.io/tx/0x70bca459512ff6f5c59bb3333b19d013f8b2f9b3069dcdffe9f5768ac427b9e5), CREATE2 through `0x4e59b44847b379578588920cA78FbF26c0B4956C`, salt `0x3738` |
| The Castle's pool, initialized | pool id `0xb1d82d460c7ddb0f881b310b4c69fcb435fcddb05317ab70cad0643eacad112a` | [`0x9cf53df8…379e`](https://sepolia.etherscan.io/tx/0x9cf53df8517a4e38d99ee6b03fbcc641d0dfefea4cd64822d9540a83fad7379e) |

The pool key:
- `currency0`: Circle USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- `currency1`: WETH9 `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`
- fee 0 and tick spacing 60
- `hooks`: CastleJITHook

It was initialized at `sqrtPriceX96 = 1446501726624926496477173928747177`, which is 3,000 USDC per WETH. That price is for display only, because hen prices every fill.

The hook's address ends in `0888`. Its low 14 bits are exactly the three flags it uses:
- `BEFORE_ADD_LIQUIDITY` (`0x800`)
- `BEFORE_SWAP` (`0x80`)
- `BEFORE_SWAP_RETURNS_DELTA` (`0x8`)

The deploy script mines the salt in [a short loop](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/script/DeployHoard.s.sol#L98-L105). It deploys the hook through the CREATE2 deployer and [initializes the pool](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/script/DeployHoard.s.sol#L67-L81) in the same run. The hook's constructor calls `Hooks.validateHookPermissions`, so a hook at a wrong address cannot be deployed.

## How the hook fills a swap

[`beforeSwap`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleJITHook.sol#L87-L123) runs these steps for an exact-in swap:

1. It checks three things: the pair is USDC/WETH (`NotCastlePool`), the swap is exact-in (`ExactOutNotSupported`), and a `hen` is live in the vault's slot 1 (`NoHen`). If fi re-ships hen, the hook follows it with no redeploy.
2. It `take`s `amountIn` of the input from the PoolManager.
3. It calls `AquaSwapVMRouter.swap(henOrder, tokenIn, tokenOut, amountIn, takerData)` as the SwapVM taker. Aqua pushes the input into the Castle and pulls the output out of it.
4. It honours an optional `hookData` of `abi.encode(uint256 minAmountOut)` by reverting `TooLittleOut`. This is the swap's slippage guard. The pool's own step is 0, so v4 never checks `sqrtPriceLimitX96` here ([FEEDBACK.md](../FEEDBACK.md#sqrtpricelimitx96-does-nothing-on-a-pool-like-this)).
5. It calls `sync`, transfers `amountOut` to the PoolManager, and calls `settle`.
6. It emits `JitFill(poolId, strategyHash, sender, tokenIn, amountIn, amountOut)`.
7. It returns `toBeforeSwapDelta(+amountIn, -amountOut)`. The pool's own swap step then runs with an amount of 0 and never needs liquidity.

[`beforeAddLiquidity`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleJITHook.sol#L126-L133) reverts `LiquidityNotAllowed`. The swap's fee is hen's SwapVM `flatFeeAmountIn`, 30 bps. The pool's fee is 0.

The hook never touches the Castle's tokens itself. Every movement is an Aqua pull or push on hen, so fum's cap and leverage bound what a v4 swap can take. The hook holds nothing between calls. Its only allowances are to the router, which pulls only from its own `msg.sender`.

## Reading a hook-filled swap

The PoolManager's `Swap` event for this pool reads `amount0: 0, amount1: 0, liquidity: 0`. That is by design. v4 emits `Swap` for the pool's own step, and the hook's delta has already reduced that step to zero. The [live swap](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116) shows the same: its `Swap` reads 0, 0 and liquidity 0, and its `JitFill` reads 500000 USDC units in and 164969810023109 WETH units out. The swap's real amounts are in the same transaction:

- CastleJITHook `JitFill`, with `amountIn` and `amountOut`;
- AquaSwapVMRouter `Swapped`, where `orderHash` is hen, the maker is CastleVault and the taker is the hook;
- Aqua `Pushed` (the input into the Castle) and `Pulled` (the output out of it) on hen's strategy hash;
- the USDC and WETH `Transfer`s.

The fork test's trace, for a 1 USDC swap:

```
emit Swapped(orderHash: 0x0abd…4172, maker: CastleVault, taker: CastleJITHook, tokenIn: USDC, tokenOut: WETH, amountIn: 1000000, amountOut: 362644357552059)
emit JitFill(poolId: 0x95e0…889c, strategyHash: 0x0abd…4172, sender: PoolSwapTest, tokenIn: USDC, amountIn: 1000000, amountOut: 362644357552059)
emit Swap(id: 0x95e0…889c, sender: PoolSwapTest, amount0: 0, amount1: 0, sqrtPriceX96: 1446501726624926496477173928747177, liquidity: 0, tick: 196256, fee: 0)
```

## Beat 3, live

| Step | Sepolia tx | Fork rehearsal, block 11786199 |
|---|---|---|
| a solver swaps USDC for WETH on the Castle's pool through PoolSwapTest; the hook fills it from hen | [`0x53f773de…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116): 0.5 USDC in, 0.000164970 WETH out, 278,346 gas | 0.5 USDC in, 0.000164803 WETH out, 278,346 gas |
| fee asks for a re-centre; fi docks hen and ships it again at the mid | dock [`0x32a20d16…638a`](https://sepolia.etherscan.io/tx/0x32a20d169556fd013eaa69cb2dc2db2108275c9513d36e24b0886ceab23d638a) <br> ship [`0x03dbf62b…67f3`](https://sepolia.etherscan.io/tx/0x03dbf62b16214b7bf36dce5b742ad80c7deccc466a9925328f9b26a817e267f3) | dock 47,007 gas, ship 223,064 gas |

Live, after the swap, fee saw hen's curve at 3,399.91 against a mid of 2,686.57 (2,098 bps) and asked for a re-centre, and fi docked hen and shipped it again at the mid. The fork rehearsal did the same, at 3,402.92 against 2,689.63. The live run's record is [agents/live-run/11786346](../agents/live-run/11786346/README.md). The rehearsal is [agents/fork-run/11786199](../agents/fork-run/README.md), and its transaction hashes exist only on that fork.

## Tests

[test/fork/CastleJITHookFork.t.sol](../contracts/test/fork/CastleJITHookFork.t.sol) has 8 tests on a fork of Sepolia at block 11785880, against the real PoolManager, PoolSwapTest, Aqua and router. They cover:
- the mined address carries exactly its flags;
- a swap is filled just in time, in both directions;
- exact-out, a short `minAmountOut` and no hen each revert;
- only the PoolManager may call the hook, and no liquidity can be added;
- another pair reverts `NotCastlePool`;
- the unflagged callbacks revert;
- the constructor rejects a bad config.

Line coverage of CastleJITHook is 100%. Run them from `contracts/` with `forge test --match-path test/fork/CastleJITHookFork.t.sol`.

## Uniswap's addresses

These come from Uniswap's deployments page, section "Sepolia: 11155111", checked with `eth_getCode` at block 11785837. Codesizes are in [research.md](research.md).

| Contract | Address |
|---|---|
| PoolManager | [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543) |
| PoolSwapTest | [`0x9b6b46e2c869aa39918db7f52f5557fe577b6eee`](https://sepolia.etherscan.io/address/0x9b6b46e2c869aa39918db7f52f5557fe577b6eee) |
| StateView | [`0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c`](https://sepolia.etherscan.io/address/0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c) |
| Quoter | [`0x61b3f2011a92d183c7dbadbda940a7555ccf9227`](https://sepolia.etherscan.io/address/0x61b3f2011a92d183c7dbadbda940a7555ccf9227) |
| PositionManager | [`0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`](https://sepolia.etherscan.io/address/0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4) |
| Universal Router, unlabeled current row | [`0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b`](https://sepolia.etherscan.io/address/0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b) |

The hook is built against v4-core `v4.0.0` (`e50237c`), and its fork tests pass against the Sepolia PoolManager above.

## UniswapX

No UniswapX reactor is published for Sepolia, and the reactors published for other chains have no code on Sepolia. fo still takes UniswapX-format orders off-chain through `castle_route` and prices them both ways, against harp and against the v4 pool, then routes to whichever pays more. In the live run, a 0.5 USDC order from agy got 185,924,989,671,030 WETH units from harp against 160,819,112,822,369 from the v4 pool, so fo routed it to harp (`intent.routed` i-1790427777-1, in [the live record](../agents/live-run/11786346/README.md)). Filling a live UniswapX reactor is a stretch goal, on a chain that has one.

The lease edition's CCA auction and JackHook are not this product. They remain at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition).
