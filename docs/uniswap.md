# Uniswap

Beat 3 is a Uniswap v4 pool that holds no liquidity. CastleJITHook fills every exact-in swap from the Castle's `hen` strategy in `beforeSwap`, and `beforeAddLiquidity` reverts so nobody else can deposit.

Scope: [SPEC.md](SPEC.md) at `d70dafa`. Address measurements: [research.md](research.md).

## The pool

`currency0` is Circle USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`. `currency1` is WETH9 `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`. Fee is 0. Tick spacing is 60. The hook is CastleJITHook. The fee the swap pays is `hen`'s SwapVM `flatFee`, not the pool fee.

The hook's flags are `BEFORE_SWAP`, `BEFORE_SWAP_RETURNS_DELTA`, and `BEFORE_ADD_LIQUIDITY`. The salt is mined against the CREATE2 deployer `0x4e59b44847b379578588920ca78fbf26c0b4956c`.

`beforeSwap` takes `amountIn` from the pool, swaps the Castle's `hen` order through AquaSwapVMRouter, settles `amountOut` back to the PoolManager, and returns the delta. Exact-out reverts `ExactOutNotSupported`. Optional `hookData` of `abi.encode(uint256 minAmountOut)` reverts `TooLittleOut` when the quote is short.

The demo swap goes through PoolSwapTest, not a frontend router. One transaction should show a v4 `Swap` and Aqua `Pulled` / `Pushed`. That transaction does not exist yet.

## Addresses

From Uniswap's deployments page, section "Sepolia: 11155111", checked with `eth_getCode` at block 11785837. Codesizes are in [research.md](research.md).

| Contract | Address |
|---|---|
| PoolManager | [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543) |
| PoolSwapTest | [`0x9b6b46e2c869aa39918db7f52f5557fe577b6eee`](https://sepolia.etherscan.io/address/0x9b6b46e2c869aa39918db7f52f5557fe577b6eee) |
| StateView | [`0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c`](https://sepolia.etherscan.io/address/0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c) |
| Quoter | [`0x61b3f2011a92d183c7dbadbda940a7555ccf9227`](https://sepolia.etherscan.io/address/0x61b3f2011a92d183c7dbadbda940a7555ccf9227) |
| PositionManager | [`0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`](https://sepolia.etherscan.io/address/0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4) |
| Universal Router, unlabeled current row | [`0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b`](https://sepolia.etherscan.io/address/0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b) |

CastleJITHook is not in the tree yet. No permalink, no address, no pool id.

## UniswapX

No reactor is published for Sepolia, and the reactors published for other chains have no code on Sepolia. fo still accepts UniswapX-format orders off-chain through `castle_route` and picks `harp` or the v4 route. Filling a live UniswapX reactor is stretch, on a chain that has one.

The lease edition's CCA auction and JackHook are not this product. They remain at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition).
