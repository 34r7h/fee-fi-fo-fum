# 1inch

feefifofum is an Aqua app. One balance in CastleVault backs two SwapVM strategies at once. Their promises add up to more than that balance, up to fum's leverage. A ship past the leverage reverts `OverAllocated`.

Scope: [SPEC.md](SPEC.md) at `43e57ac`. The Continuity prize text is quoted in [research.md](research.md).

## Deployed

Everything is on Ethereum Sepolia, built from source at [`fff518c`](https://github.com/34r7h/fee-fi-fo-fum/tree/fff518c55bfe60c752c0cd9acffbfc285f817f1c). Each contract is a Sourcify `exact_match`, and all are recorded in [contracts/deployments/sepolia.json](../contracts/deployments/sepolia.json).

| Contract | Address | Deploy tx | Sourcify |
|---|---|---|---|
| CastleVault | [`0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98`](https://sepolia.etherscan.io/address/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98) | [`0xc561b03e…947b`](https://sepolia.etherscan.io/tx/0xc561b03ec7b32b3aee21a4f1be3af465de845f957273047495ca20b57253947b) | [exact_match](https://repo.sourcify.dev/11155111/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98) |
| PriceExtruction | [`0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757`](https://sepolia.etherscan.io/address/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757) | [`0x86569016…d5d5`](https://sepolia.etherscan.io/tx/0x86569016c696bbcb10d4a340e7aa6e44134d971c8756fac0db6c55d5bea9d5d5) | [exact_match](https://repo.sourcify.dev/11155111/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757) |

The Castle uses the official Aqua and router that are already on Sepolia. Neither one is redeployed or modified.

| What | Address | Codesize, 2026-09-26 |
|---|---|---|
| Aqua | [`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`](https://sepolia.etherscan.io/address/0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) | 5619 |
| AquaSwapVMRouter 1.0.2 | [`0xeDB6933949dB941D495b23604818F9AbF55e70f9`](https://sepolia.etherscan.io/address/0xeDB6933949dB941D495b23604818F9AbF55e70f9) | 20541 |

The vault's constructor checks `router.AQUA() == aqua`, so it cannot be pointed at a router that settles through another Aqua.

## One balance, two strategies

| Slot | Name | Program | Who fills it |
|---|---|---|---|
| 0 | `harp` | `Extruction(PriceExtruction)` | a solver, with a quote fi signed, found through `quote.feefifofum.eth` ([ens.md](ens.md)) |
| 1 | `hen` | `flatFeeAmountIn(30 bps)`, then `XYCSwap` | CastleJITHook, inside a Uniswap v4 swap ([uniswap.md](uniswap.md)) |
| 2 | `greedy` | hen's program | nobody. This ship exists to revert `OverAllocated`. |

fi compiles the programs in [agents/lib/programs.mjs](../agents/lib/programs.mjs). CastleVault does three things itself:
- It appends a `Salt` instruction with its own nonce, so every ship has a fresh strategy hash.
- It builds the order's MakerTraits: the maker is the vault, and the order uses Aqua balances instead of a signature.
- It calls `Aqua.ship` to the router.

Aqua keeps a virtual balance per strategy. The tokens stay in the vault until a fill moves them, and neither `ship` nor `dock` moves any. The vault's only token allowance is to Aqua.

## Leverage, the line fum draws

`committed(token)` is the sum of the live slots' Aqua balances. `limit(token)` is `balanceOf(vault) * leverageBps / 1e4`. The default leverage is 1×, and fum sets 2× for the demo.

`ship` reverts `OverAllocated(token, committedAfter, limit)` if either token would go past its limit. The check runs before Aqua is called. fum's per-slot caps apply first and revert `OverCap`. Shared liquidity is the point: harp and hen each promise 80% of the hoard, 1.6× in all, and `greedy` asking for 0.5× more is refused.

Who may do what:
- **fi** ships.
- **fum** sets leverage and per-slot caps.
- **The owner** (the treasury) may withdraw WETH or USDC only while `committed` stays within the leverage of what is left.
- **fi, fum or the owner** may dock a strategy.

After fills, fum watches `committed` against `limit`. It docks only if fills have pushed a token past its limit, lowest priority first: `greedy`, then `harp`, then `hen`.

Source at the deployed commit:
- [`ship`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L159-L187): the slot, cap and leverage checks, the salt, the order, and `Aqua.ship`.
- [`dock`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L190-L202).
- [`withdraw`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L222-L227): bounded by the leverage rule.
- [`committed`, `limit`, `headroom`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L279-L299).
- [`_checkLimit`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/CastleVault.sol#L306-L311).

## PriceExtruction

harp has no curve. Its price is a quote fi signs off-chain, which PriceExtruction checks on-chain as a SwapVM Extruction instruction.

The quote is an EIP-712 `Quote {strategyHash, tokenIn, tokenOut, priceQ96, maxAmountIn, validUntil}`, in the domain `feefifofum PriceExtruction`, version `1`. The taker passes `abi.encode(Quote, sig)` as the instruction args in its taker data. [`extruction`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/PriceExtruction.sol#L70-L100) then:

- accepts exact-in only (`ExactOutNotSupported`);
- requires the quote's strategy hash and tokens to match the order being filled (`QuoteMismatch`);
- rejects a quote past `validUntil` (`QuoteExpired`), or one set more than 300 s ahead (`QuoteTooLong`);
- caps `amountIn` at `maxAmountIn` (`QuoteTooLarge`);
- requires the signer to be the maker's current `fi()` (`BadQuoteSigner`), so one `setFi` by the owner revokes every outstanding quote;
- sets `amountOut = amountIn * priceQ96 / 2^96` and consumes the quote from the taker data.

The gateway issues quotes that are valid for 30 s. The [fork rehearsal](../agents/fork-run/README.md) filled a quote and then replayed it 31 s later, and the replay reverted `QuoteExpired(1790425524)`.

## Beat 1 and the harp fill, live

| Step | Sepolia tx | Fork rehearsal, block 11786199 |
|---|---|---|
| fum sets leverage 2× for WETH and USDC | [`0xcf95760d…54f9`](https://sepolia.etherscan.io/tx/0xcf95760df456850bb1db11811c887c06fae925611984c7fc4e188f838b1a54f9) and [`0x53336098…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7) | 31,401 + 31,357 gas |
| fum sets the caps for slots 0, 1 and 2 | [`0xd2fbb4f8…88b5`](https://sepolia.etherscan.io/tx/0xd2fbb4f8db826c5a202d4724da0767b10ebf8be666751f1324c91b467ba788b5) and [`0x3d145621…8970`](https://sepolia.etherscan.io/tx/0x3d145621afcd2d43c97a400139b8f5caee7768d6f3e4477dddc4723e5b568970) and [`0x1b24490f…481f`](https://sepolia.etherscan.io/tx/0x1b24490f1c5a1ae23ab58d8d1c79508c9ba85903b06b9735b73ef2f0d068481f) | 3 × about 70,565 gas |
| fi ships `harp`, 80% of the hoard | [`0x15711ddf…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) | 238,098 gas |
| fi ships `hen`, 80% of the hoard in fee's mid ratio | [`0x5d7bee55…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) | 223,064 gas |
| fi ships `greedy`, 0.5× more: reverts `OverAllocated` | [`0x647aba61…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba), failed; replayed at the block before, it reverts `OverAllocated(WETH, 3903882690184150, 3717983514461096)` | the same `OverAllocated(WETH, 3903882690184150, 3717983514461096)` |
| a solver fills harp with a quote from `quote.feefifofum.eth` | [`0x763d6de1…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8): 0.5 USDC for 0.000185925 WETH, 170,685 gas | 0.5 USDC for 0.000185713 WETH, 157,005 gas |

The fork rehearsal is [agents/fork-run/11786199](../agents/fork-run/README.md). It ran the crew's real code against the deployed contracts on a fork of Sepolia. Its transaction hashes exist only on that fork.

## Tests

The suite has 61 tests, all passing. Run it from `contracts/`:

```sh
forge test                              # all 61; the fork suites need a Sepolia archive RPC (SEPOLIA_ARCHIVE_RPC_URL, or Tenderly's public one)
forge test --no-match-path 'test/fork/*'   # the 46 that need no network
```

The two contracts here are covered by:
- **Unit and fuzz tests:** [test/CastleVault.t.sol](../contracts/test/CastleVault.t.sol) has 19. They include PriceExtruction's:
  - harp fills at fi's quote;
  - every revert path;
  - rotating fi kills outstanding quotes;
  - the EIP-712 domain.
- **Invariants:** [test/CastleVault.invariant.t.sol](../contracts/test/CastleVault.invariant.t.sol) has 4 handler invariants. The handler fuzzes ships, docks, fills, leverage changes, withdrawals and donations. The invariants are:
  - no ship or withdraw goes past leverage;
  - only Aqua moves the hoard;
  - `committed` equals the live Aqua balances;
  - the vault approves only Aqua.
- **Fork tests:** [test/fork/CastleVaultFork.t.sol](../contracts/test/fork/CastleVaultFork.t.sol) and [test/fork/SpecDemoFork.t.sol](../contracts/test/fork/SpecDemoFork.t.sol) run on a fork of Sepolia at block 11785880, against the real Aqua and router 1.0.2.

Coverage is 100% of lines on both contracts (CastleVault branches 96.4%). slither shows 0 High and 0 Medium after triage.

## What the prize asked for

- **Official Aqua:** the Castle ships to Aqua `0x1111…a90a` through AquaSwapVMRouter 1.0.2. Neither is redeployed.
- **A SwapVM program in each strategy:**
  - harp runs a custom Extruction;
  - hen runs `flatFeeAmountIn` then `XYCSwap`;
  - both carry the vault's `Salt`.
- **A real token transfer:** the harp fill and the v4 swap move real Sepolia USDC and WETH, as shown in the table above and in [uniswap.md](uniswap.md).
- **Small commits:** the history of `contracts/` is a series of small commits, one per task and fix.
