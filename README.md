# feefifofum

**One hoard, every market.** Fee, fi, fo, fum.

In the old tale the giant keeps a bag of gold, a harp that sings and a hen that lays golden eggs. In feefifofum the giant's gold works for every market at once.

- **The hoard** is one balance in the Castle vault, a 1inch Aqua maker. Its SwapVM strategies get promises, not deposits, so the same gold backs many quotes at once. fum, the guard, sets how far the promises may stretch (2× the hoard in the demo). The vault refuses a promise past that line with `OverAllocated`.
- **The harp** sings firm prices by name. A solver asks the ENS name `quote.feefifofum.eth` through CCIP-Read. The castle's gateway answers with a quote that fi signs, and the solver fills it through Aqua. Asking costs no gas, and a quote more than 30 s old reverts `QuoteExpired`.
- **The hen** lays just in time. The Castle's Uniswap v4 pool holds no liquidity of its own. CastleJITHook fills each swap from the hoard, inside the swap's own transaction.

Why it matters: a market maker's capital sits split across pools and chains, most of it idle, and its stale quotes leak value to arbitrage (LVR). One guarded hoard puts all of it to work. Its prices expire, so a stale one can't be used against the castle.

This is an ETHGlobal Tokyo 2026 Continuity entry (1inch Aqua, Uniswap v4, ENSv2). The existing project is handoff, and the crew are handoff agents:
- fee prices the hoard;
- fi writes the strategies and signs the quotes;
- fo carries the orders;
- fum guards the hoard.

The build scope is [docs/SPEC.md](docs/SPEC.md). Where this file and the spec differ, the spec wins.

## Live

Everything runs on Ethereum Sepolia.

- **Watch the castle.** The miniapp at https://handoff.lol/app/impecc/fee-fi-fo-fum tells the hoard, fum's promises, the harp's quotes and the hen's fills as they happen, from the castle service's stream at https://handoff.lol/t/castle/stream. It is published after the live run.
- **Ask the harp.** Resolve the text record `quote:USDC:WETH:1000000` on `quote.feefifofum.eth` with any ENS client that follows CCIP-Read, for example viem `getEnsText` through UniversalResolverV2. The name was registered in [0xebd3cb53…b258](https://sepolia.etherscan.io/tx/0xebd3cb532669b8c6a6ea2a2dbe0a1f6c30586a861105980f7fa726123e01b258).
- **The contracts.** All four are Sourcify exact_match, recorded in [contracts/deployments/sepolia.json](contracts/deployments/sepolia.json).

| Contract | Address |
|---|---|
| CastleVault (the hoard) | [`0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98`](https://sepolia.etherscan.io/address/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98) |
| PriceExtruction (fi's signed quotes) | [`0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757`](https://sepolia.etherscan.io/address/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757) |
| OffchainQuoteResolver (`quote.feefifofum.eth`) | [`0x2D18c04Aec64f93255a417d56Cfdc5577712A76a`](https://sepolia.etherscan.io/address/0x2D18c04Aec64f93255a417d56Cfdc5577712A76a) |
| CastleJITHook (the hen) | [`0x890125413c9FeDB770D872BbA9415f5E1B7C0888`](https://sepolia.etherscan.io/address/0x890125413c9FeDB770D872BbA9415f5E1B7C0888) |
| v4 pool {USDC, WETH, fee 0, tickSpacing 60} | pool id `0xb1d82d460c7ddb0f881b310b4c69fcb435fcddb05317ab70cad0643eacad112a` |

The live run's transactions are added to the beats below when it lands.

## The four beats

All four are on Ethereum Sepolia. Transaction links are filled after the one live deploy and the one live run. Nothing here is a live transaction yet.

| # | Beat | What you should see |
|---|---|---|
| 1 | One Castle balance backs `harp` and `hen`. Their promises add up to more than the balance. A third ship past fum's leverage cap reverts `OverAllocated`. | two `Shipped` transactions, one reverted ship |
| 2 | A solver resolves `quote.feefifofum.eth` through CCIP-Read, gets a firm quote signed by fi, and fills it. | the gateway log line and the fill transaction |
| 3 | A Uniswap v4 swap on the Castle's pool is filled just in time from the Castle. The pool holds no LP deposit. | one transaction that contains both a v4 `Swap` and Aqua `Pulled` / `Pushed` |
| 4 | The miniapp shows all three from a clean browser. | the published URL, after the miniapp task |

## How to verify

The spec's demo is the check. Until the live run, the proof is a Sepolia fork, not mainnet and not a live Sepolia transaction.

1. The Castle holds USDC and WETH. fum sets leverage to 2×.
2. fi ships `harp` and `hen`, each promising the full hoard. fi ships `greedy`. That third ship reverts `OverAllocated`.
3. A solver asks `quote.feefifofum.eth` for the text record `quote:USDC:WETH:<amount>`. The resolver reverts `OffchainLookup`. The gateway answers. The solver fills through AquaSwapVMRouter. The Castle's balances move.
4. The same solver swaps on the v4 pool through PoolSwapTest. CastleJITHook fills the swap from `hen` in that transaction.

Fork probe already run for the ENS half: [contracts/probes/quote-register](contracts/probes/quote-register), recorded in [docs/research.md](docs/research.md). `quote` registers in one `register()` call, and UniversalResolverV2 surfaces `OffchainLookup` for `text()` only when the resolver supports interface `0x9061b923`.

## Pre-existing and new

The private handoff baseline is commit `079f8f0`, 2026-09-25 17:09 JST, before hacking began. Five commits in that private repo, after the baseline, are part of the entry. All five are by handoff-claude. They are not in this public repo:

| Commit | Time (JST) | What |
|---|---|---|
| `95932ef` | 09-26 14:20 | `ens_name` accepts an ENSv2 name, checked on-chain via UniversalResolverV2 |
| `0115146` | 09-26 14:58 | ethereum-sepolia projects are paid on ethereum-sepolia through a direct EIP-3009 rail |
| `105f1dd` | 09-26 15:07 | an agent rotates its own `wallet_address` with an EIP-191 proof of possession |
| `3cfdb3f` | 09-26 15:18 | one payout submission per task on the self-submitted rails |
| `0495862` | 09-26 16:03 | the EIP-3009 payout nonce is derived from the payout, so a duplicate reverts on-chain |

The previous product in this repo, the lease edition, is retired. Its tree is tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition). New work does not read Castle, the fence, or JackHook from that tag.

New, against the spec: CastleVault, PriceExtruction, CastleJITHook, OffchainQuoteResolver, the quote name, the castle gateway, and the four crew agents. Source that is already on `main` is linked from the sponsor notes. Hook and resolver permalinks, and every transaction, wait for the deploy.

## Addresses already on Sepolia

| What | Address |
|---|---|
| Aqua | [`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`](https://sepolia.etherscan.io/address/0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) |
| AquaSwapVMRouter 1.0.2 | [`0xeDB6933949dB941D495b23604818F9AbF55e70f9`](https://sepolia.etherscan.io/address/0xeDB6933949dB941D495b23604818F9AbF55e70f9) |
| Circle USDC | [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |
| WETH9 | [`0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`](https://sepolia.etherscan.io/address/0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14) |
| v4 PoolManager | [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543) |
| v4 PoolSwapTest | [`0x9b6b46e2c869aa39918db7f52f5557fe577b6eee`](https://sepolia.etherscan.io/address/0x9b6b46e2c869aa39918db7f52f5557fe577b6eee) |
| v4 StateView | [`0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c`](https://sepolia.etherscan.io/address/0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c) |
| v4 Quoter | [`0x61b3f2011a92d183c7dbadbda940a7555ccf9227`](https://sepolia.etherscan.io/address/0x61b3f2011a92d183c7dbadbda940a7555ccf9227) |
| ENSv2 feefifofum registry | [`0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`](https://sepolia.etherscan.io/address/0x2F2164507471a1a46506f902aBfdfB9d22e4bE09) |
| UniversalResolverV2 | [`0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3`](https://sepolia.etherscan.io/address/0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3) |
| Registrar (`ROLE_REGISTRAR`) | [`0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99`](https://sepolia.etherscan.io/address/0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99) |

Codesizes for the v4 rows and for Aqua are in [docs/research.md](docs/research.md). AquaSwapVMRouter's codesize was 20541 at the same public Sepolia endpoint on 2026-09-26. CastleVault, PriceExtruction, CastleJITHook and OffchainQuoteResolver are not deployed. Their addresses will be added in `contracts/deployments/sepolia.json` after the deploy.

## Repository layout

| Path | What it is |
|---|---|
| `contracts/` | Foundry project: vault and extruction sources, fork probes, deployment records |
| `service/` | Castle gateway, its tests, and the host deploy notes |
| `agents/` | fee, fi, fo, and fum: roles, crew config, and the runner |
| `miniapp/` | The browser page and its stream schema |
| `docs/` | The notes below |

| Doc | One line |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | Locked build scope at `d70dafa`. It wins over the pivot brief. |
| [docs/research.md](docs/research.md) | Fork measurements for the quote register, v4 addresses, UniswapX, and the prize text. |
| [docs/PIVOT.md](docs/PIVOT.md) | agy's architecture brief, kept verbatim. |
| [docs/NAMING.md](docs/NAMING.md) | Voice, and what the hoard, the harp, and the hen mean. |
| [docs/1inch.md](docs/1inch.md) | The Aqua app: one balance, harp, hen, leverage, PriceExtruction. |
| [docs/uniswap.md](docs/uniswap.md) | CastleJITHook: a v4 pool with no LP deposit. |
| [docs/ens.md](docs/ens.md) | `quote.feefifofum.eth` through UniversalResolverV2. |
| [docs/video-script.md](docs/video-script.md) | Shot list for the submission video. |

## Write-ups

- [docs/1inch.md](docs/1inch.md) — the Aqua app
- [docs/uniswap.md](docs/uniswap.md) — the v4 hook
- [docs/ens.md](docs/ens.md) — the quote name
- [FEEDBACK.md](FEEDBACK.md) — what the Uniswap docs and testnet actually did
- [docs/research.md](docs/research.md) — the measurements behind the spec's research gates
