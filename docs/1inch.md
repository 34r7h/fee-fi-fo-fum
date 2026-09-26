# 1inch

feefifofum is an Aqua app. One balance in CastleVault backs two SwapVM strategies at once. The promises are allowed to add up to more than that balance, up to fum's leverage. A ship past the cap reverts.

Scope: [SPEC.md](SPEC.md) at `d70dafa`. Continuity prize text quoted in [research.md](research.md).

## One balance, two strategies

| Slot | Name | Program | Who fills it |
|---|---|---|---|
| 0 | `harp` | `Extruction(PriceExtruction)` | an outside solver, after CCIP-Read |
| 1 | `hen` | `XYCSwap` plus `flatFee` | CastleJITHook, on a v4 swap |
| 2 | `greedy` | any | nobody; this ship exists to revert `OverAllocated` |

Aqua keeps a virtual balance per strategy. Tokens stay in the Castle until a fill pulls them. `ship` checks the slot cap and the leverage before it calls Aqua.

`ROLE` on the vault: fi ships and docks. fum sets leverage and per-slot caps. The owner can withdraw only while the cap still holds afterwards.

## PriceExtruction

`harp`'s price is a quote fi signs off-chain. The fill passes `abi.encode(Quote, sig)` as taker data. PriceExtruction checks the signer is `vault.fi()`, the strategy and the tokens, `maxAmountIn`, and `validUntil`. Exact-in only: `amountOut = amountIn * priceQ96 >> 96`. A quote older than `validUntil` reverts `QuoteExpired`. The spec caps `validUntil` at now + 300 seconds, and the demo quote uses 30 seconds.

## Source on this commit

These two files are on `main` at `bf77b95`. Hook and resolver source are not in the tree yet, so they are not linked.

- [CastleVault.sol](https://github.com/34r7h/fee-fi-fo-fum/blob/bf77b958d4f3c19942d06ecda20d758310163f31/contracts/src/CastleVault.sol)
- [PriceExtruction.sol](https://github.com/34r7h/fee-fi-fo-fum/blob/bf77b958d4f3c19942d06ecda20d758310163f31/contracts/src/PriceExtruction.sol)

## Contracts already on Sepolia

| What | Address | Codesize, 2026-09-26 |
|---|---|---|
| Aqua | [`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`](https://sepolia.etherscan.io/address/0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) | 5619 |
| AquaSwapVMRouter 1.0.2 | [`0xeDB6933949dB941D495b23604818F9AbF55e70f9`](https://sepolia.etherscan.io/address/0xeDB6933949dB941D495b23604818F9AbF55e70f9) | 20541 |

CastleVault and PriceExtruction have no deployment address yet. The two `Shipped` transactions and the reverted `greedy` ship are filled in after the live run.

## What the prize asked for

Official Aqua is the address above. The router is the 1.0.2 deployment above, not a modified redeploy. The demo has to show a real token transfer. A local fork is allowed for that showing. SwapVM is the program inside `harp` and `hen`, which the prize text scores higher. Commit history stays a series of small commits. The single live run is still waiting on the gas approval in the spec.
