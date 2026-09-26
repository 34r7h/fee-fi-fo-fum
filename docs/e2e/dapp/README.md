# Live validation of the dapp (v-dapp)

This is the record of task v-dapp (`93e81dc2-9b78-4ea0-8398-5c243b83b0d3`). The validator agy tested the published dapp, `fee-fi-fo-fum` version 2.0.2 at https://handoff.lol/app/impecc/fee-fi-fo-fum, on Ethereum Sepolia on 26 September 2026 between 17:08 and 17:12 UTC. The result is a pass.

## Method

agy opened the page in a fresh Chrome profile with an injected EIP-1193 wallet backed by its own Sepolia key, for the address `0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c`. Every action went through the page's own buttons. agy connected the wallet, kept the page's default amount of 0.25 USDC, filled the RFQ strategy's quote with "Fill this quote", and then swapped the same amount on the v4 pool with "Swap through the v4 pool". Each trade needed an approval for the exact amount first, so the test sent four transactions. The page sent them with a maximum fee of 1.8 gwei.

## Transactions

| Step | Transaction | Block | Gas used | Effective gas price |
|---|---|---|---|---|
| Approve 0.25 USDC for the 1inch SwapVM router | [`0x66f9863b…850d`](https://sepolia.etherscan.io/tx/0x66f9863bfee8e11149355c606b3476eb57cb163c0ca75d2dc59dcdad44aa850d) | 11787567 | 55,437 | 1.203 gwei |
| Fill the RFQ quote through the router | [`0x84bd78b6…1414`](https://sepolia.etherscan.io/tx/0x84bd78b6613915c92ca3a8be2e022578450dcb0f3594690fd9998e4b16151414) | 11787568 | 157,005 | 1.137 gwei |
| Approve 0.25 USDC for PoolSwapTest | [`0x9dd4e78a…3b5e`](https://sepolia.etherscan.io/tx/0x9dd4e78aef85df87747761666178ee278a233f1590deadb46ad491bed67f3b5e) | 11787577 | 55,437 | 1.169 gwei |
| Swap on the v4 pool | [`0x2cc0d568…b86c`](https://sepolia.etherscan.io/tx/0x2cc0d568d8234715a7d9748092491f95ad443f2e838ff0048e9089d5e04cb86c) | 11787578 | 278,636 | 1.091 gwei |

All four succeeded. Together they used 546,515 gas, which cost 0.000614 ETH. [txs.json](txs.json) lists the same hashes with their targets and calldata.

## What the transactions show

The fill `0x84bd78b6…1414` used quote `q-1790442385-3`, which the page read from `quote.feefifofum.eth` over CCIP-Read. In that transaction agy paid 0.25 USDC to CastleVault and received 92,770,501,331,752 WETH units (0.0000928 WETH) from it, and Aqua emitted `Pulled` and `Pushed` for the vault.

The swap `0x2cc0d568…b86c` went through PoolSwapTest to the v4 pool. In the same transaction the hook CastleJITHook filled it from the vault's hen strategy and emitted `JitFill(poolId, hen, sender, USDC, 250000, 86476092014462)`, Aqua emitted `Pulled` and `Pushed` for the vault, and the PoolManager emitted its `Swap` event. agy paid 0.25 USDC and received 86,476,092,014,462 WETH units (0.0000865 WETH).

## Balances afterwards

After the test, agy's wallet held 0.000829 ETH, 13.90 USDC and 0.000530 WETH. It had spent 0.000614 ETH on gas and 0.50 USDC on the two trades, and received 0.000179 WETH. The vault held 4.910627 USDC and 0.001950 WETH. CastleJITHook held no USDC and no WETH, as it should after a swap, because it passes every token straight through.

## Screenshots

- [01-initial.png](01-initial.png) shows the page after the wallet connected, before any trade, with 14.40 USDC in the wallet and both quotes loaded.
- [02-hen-quote-ready.png](02-hen-quote-ready.png) shows the page after the RFQ fill, with 14.15 USDC in the wallet and the v4 pool's quote ready.
- [03-hen-swapped.png](03-hen-swapped.png) shows the page after the v4 swap, with 13.90 USDC in the wallet.
- [04-final-full.png](04-final-full.png) shows the whole page at the end. Your trades lists this test's fill and swap at the top, above agy's two trades from the live run at 12:59 UTC. The page prints times in the browser's time zone, UTC+9.
