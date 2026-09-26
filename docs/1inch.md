# 1inch

feefifofum is an Aqua app. CastleVault holds one balance of USDC and WETH and allocates it to two SwapVM strategies at the same time. The allocations may add up to more than the balance, up to a leverage limit set by fum, the risk agent. A ship that would exceed the limit reverts with `OverAllocated`.

The build scope is [SPEC.md](SPEC.md) at `fc85b67`. The Continuity prize text is quoted in [research.md](research.md).

## Deployed contracts

Both contracts are on Ethereum Sepolia, built from source at [`fff518c`](https://github.com/34r7h/fee-fi-fo-fum/tree/fff518c55bfe60c752c0cd9acffbfc285f817f1c). Each is a Sourcify `exact_match`, and both are recorded in [contracts/deployments/sepolia.json](../contracts/deployments/sepolia.json).

| Contract | Address | Deploy tx | Sourcify |
|---|---|---|---|
| CastleVault | [`0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98`](https://sepolia.etherscan.io/address/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98) | [`0xc561b03e…947b`](https://sepolia.etherscan.io/tx/0xc561b03ec7b32b3aee21a4f1be3af465de845f957273047495ca20b57253947b) | [exact_match](https://repo.sourcify.dev/11155111/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98) |
| PriceExtruction | [`0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757`](https://sepolia.etherscan.io/address/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757) | [`0x86569016…d5d5`](https://sepolia.etherscan.io/tx/0x86569016c696bbcb10d4a340e7aa6e44134d971c8756fac0db6c55d5bea9d5d5) | [exact_match](https://repo.sourcify.dev/11155111/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757) |

The vault uses the official Aqua and AquaSwapVMRouter deployments that were already on Sepolia. Neither is redeployed or modified.

| What | Address | Codesize, 2026-09-26 |
|---|---|---|
| Aqua | [`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`](https://sepolia.etherscan.io/address/0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) | 5619 |
| AquaSwapVMRouter 1.0.2 | [`0xeDB6933949dB941D495b23604818F9AbF55e70f9`](https://sepolia.etherscan.io/address/0xeDB6933949dB941D495b23604818F9AbF55e70f9) | 20541 |

The vault's constructor checks that `router.AQUA() == aqua`, so the vault cannot be configured with a router that settles through a different Aqua.

## The strategies

The vault has eight slots. The demo uses three of them:

| Slot | Name | Program | Who fills it |
|---|---|---|---|
| 0 | `harp` | `Extruction(PriceExtruction)` | a solver, using a quote that fi signed and served through `quote.feefifofum.eth` ([ens.md](ens.md)) |
| 1 | `hen` | `flatFeeAmountIn(30 bps)`, then `XYCSwap` | CastleJITHook, during a Uniswap v4 swap ([uniswap.md](uniswap.md)) |
| 2 | `greedy` | the same program as `hen` | nobody; the demo ships it only to show the `OverAllocated` revert |

`harp` is a request-for-quote strategy whose price comes from a signed quote. `hen` is a constant-product curve over its own Aqua balances with a 30 bps fee. fi, the agent that compiles and ships the strategies and signs quotes, builds the programs in [agents/lib/programs.mjs](../agents/lib/programs.mjs).

When fi ships a program, CastleVault appends a `Salt` instruction with its own nonce, so every ship has a new strategy hash. The vault builds the order's MakerTraits itself, with the vault as the maker and Aqua balances in place of a signature, and then calls `Aqua.ship` for the router. Aqua keeps a virtual balance for each strategy. The tokens stay in the vault until a fill moves them, and neither `ship` nor `dock` transfers any tokens. The vault's only token allowance is to Aqua.

## The leverage limit

`committed(token)` is the sum of the live slots' Aqua balances for that token. `limit(token)` is `balanceOf(vault) * leverageBps / 1e4`. The default leverage is 1×, and fum set it to 2× for the demo.

`ship` first checks fum's per-slot caps, which revert with `OverCap`. It then reverts with `OverAllocated(token, committedAfter, limit)` if either token would exceed its limit. Both checks run before Aqua is called. In the demo, `harp` and `hen` each promise 80% of the vault's balance, which is 1.6× in total, and `greedy`'s request for another 0.5× is refused.

The roles are enforced in the contract. fi ships strategies. fum sets the leverage and the per-slot caps. The owner, which is the treasury, may withdraw WETH or USDC only while `committed` stays within the leverage limit of the remaining balance. fi, fum or the owner may dock a strategy.

After fills, fum compares `committed` with `limit`. It docks strategies only if fills have pushed a token past its limit, in order of lowest priority: `greedy`, then `harp`, then `hen`.

The relevant source at the deployed commit:

- [`ship`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L159-L187) runs the slot, cap and leverage checks, appends the salt, builds the order and calls `Aqua.ship`.
- [`dock`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L190-L202) frees the slot and zeroes the strategy's allocation in Aqua.
- [`withdraw`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L222-L227) is bounded by the leverage limit.
- [`committed`, `limit` and `headroom`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L279-L299) are the views fum reads.
- [`_checkLimit`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L306-L311) is the limit check shared by `ship` and `withdraw`.

## PriceExtruction

`harp` has no curve. Its price is a quote that fi signs off-chain, and PriceExtruction checks the quote on-chain as a SwapVM Extruction instruction.

The quote is an EIP-712 `Quote {strategyHash, tokenIn, tokenOut, priceQ96, maxAmountIn, validUntil}` in the domain `feefifofum PriceExtruction`, version `1`. The taker passes `abi.encode(Quote, sig)` as the instruction arguments in its taker data. [`extruction`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/PriceExtruction.sol#L70-L100) then does the following:

- It accepts exact-in swaps only, and reverts with `ExactOutNotSupported` otherwise.
- It requires the quote's strategy hash and tokens to match the order being filled (`QuoteMismatch`).
- It rejects a quote past `validUntil` (`QuoteExpired`) and a quote whose `validUntil` is more than 300 s ahead (`QuoteTooLong`).
- It caps `amountIn` at `maxAmountIn` (`QuoteTooLarge`).
- It requires the signer to be the maker's current `fi()` (`BadQuoteSigner`). A single `setFi` call by the owner therefore revokes every outstanding quote.
- It sets `amountOut = amountIn * priceQ96 / 2^96` and consumes the quote from the taker data.

The gateway issues quotes that are valid for 30 s. In the [fork rehearsal](../agents/fork-run/README.md), a quote was filled and then replayed 31 s later, and the replay reverted with `QuoteExpired(1790425524)`.

## The live transactions

| Step | Sepolia tx | Fork rehearsal, block 11786199 |
|---|---|---|
| fum sets the leverage to 2× for WETH and USDC | [`0xcf95760d…54f9`](https://sepolia.etherscan.io/tx/0xcf95760df456850bb1db11811c887c06fae925611984c7fc4e188f838b1a54f9) and [`0x53336098…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7) | 31,401 + 31,357 gas |
| fum sets the caps for slots 0, 1 and 2 | [`0xd2fbb4f8…88b5`](https://sepolia.etherscan.io/tx/0xd2fbb4f8db826c5a202d4724da0767b10ebf8be666751f1324c91b467ba788b5) and [`0x3d145621…8970`](https://sepolia.etherscan.io/tx/0x3d145621afcd2d43c97a400139b8f5caee7768d6f3e4477dddc4723e5b568970) and [`0x1b24490f…481f`](https://sepolia.etherscan.io/tx/0x1b24490f1c5a1ae23ab58d8d1c79508c9ba85903b06b9735b73ef2f0d068481f) | 3 × about 70,565 gas |
| fi ships `harp` with 80% of the vault's balance | [`0x15711ddf…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) | 238,098 gas |
| fi ships `hen` with 80% of the vault's balance, in fee's mid-price ratio | [`0x5d7bee55…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) | 223,064 gas |
| fi ships `greedy`, asking for 0.5× more, which reverts with `OverAllocated` | [`0x647aba61…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) failed; replayed at the previous block, it reverts with `OverAllocated(WETH, 3903882690184150, 3717983514461096)` | the same `OverAllocated(WETH, 3903882690184150, 3717983514461096)` |
| a solver fills `harp` with a quote from `quote.feefifofum.eth` | [`0x763d6de1…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8): 0.5 USDC for 0.000185925 WETH, 170,685 gas | 0.5 USDC for 0.000185713 WETH, 157,005 gas |

The live run's full record is [agents/live-run/11786346](../agents/live-run/11786346/README.md). The fork rehearsal is [agents/fork-run/11786199](../agents/fork-run/README.md). The rehearsal ran the agents' real code against the deployed contracts on a fork of Sepolia, so its transaction hashes exist only on that fork.

## Tests

The suite has 61 tests, and all of them pass. Run it from `contracts/`:

```sh
forge test                              # all 61; the fork suites need a Sepolia archive RPC (SEPOLIA_ARCHIVE_RPC_URL, or Tenderly's public one)
forge test --no-match-path 'test/fork/*'   # the 46 that need no network
```

[test/CastleVault.t.sol](../contracts/test/CastleVault.t.sol) has 19 unit and fuzz tests. They include the PriceExtruction tests, which check that `harp` fills at fi's quoted price, that every revert path is hit, that rotating fi invalidates outstanding quotes, and that the EIP-712 domain is correct.

[test/CastleVault.invariant.t.sol](../contracts/test/CastleVault.invariant.t.sol) has 4 handler invariants. The handler fuzzes ships, docks, fills, leverage changes, withdrawals and donations. The invariants state that no ship or withdrawal leaves `committed` above the leverage limit, that only Aqua moves the vault's tokens, that `committed` equals the live strategies' Aqua balances, and that the vault approves no spender other than Aqua.

[test/fork/CastleVaultFork.t.sol](../contracts/test/fork/CastleVaultFork.t.sol) and [test/fork/SpecDemoFork.t.sol](../contracts/test/fork/SpecDemoFork.t.sol) run on a fork of Sepolia at block 11785880, against the real Aqua and router 1.0.2.

Line coverage is 100% on both contracts, and CastleVault's branch coverage is 96.4%. slither reports 0 High and 0 Medium findings after triage.

## The prize requirements

The vault ships to the official Aqua at `0x1111…a90a` through AquaSwapVMRouter 1.0.2, and neither contract is redeployed. Each strategy runs a SwapVM program: `harp` runs a custom Extruction, `hen` runs `flatFeeAmountIn` followed by `XYCSwap`, and both carry the vault's `Salt`. The `harp` fill and the v4 swap transfer real Sepolia USDC and WETH, as the table above and [uniswap.md](uniswap.md) show. The history of `contracts/` is a series of small commits, one per task or fix.
