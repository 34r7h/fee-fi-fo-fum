# feefifofum

feefifofum is a market-making vault on Ethereum Sepolia. It is an ETHGlobal Tokyo 2026 Continuity entry for 1inch Aqua, Uniswap v4 and ENSv2. The existing project is handoff, and four handoff agents run it.

The vault, CastleVault, is a 1inch Aqua maker. It holds one balance of USDC and WETH and allocates it to several SwapVM strategies at once through Aqua. Aqua records each strategy's allocation as a virtual balance, so the tokens stay in the vault until a fill moves them. The sum of the allocations may exceed the vault's balance, up to a leverage limit that the risk agent sets (2× in the demo). A ship that would go past the limit reverts with `OverAllocated`. A market maker usually splits its capital across pools and chains, and much of that capital sits idle. With Aqua, the same balance backs both the RFQ strategy and the v4 pool.

The vault runs two strategies:

- `harp` is a request-for-quote (RFQ) strategy. A solver resolves the ENS name `quote.feefifofum.eth` through CCIP-Read. The gateway answers with a price that the signer agent signed, and the solver fills that price through AquaSwapVMRouter. A quote is valid for 30 s, and a later fill reverts with `QuoteExpired`. The short expiry limits how much value stale quotes lose to arbitrage (loss-versus-rebalancing, LVR).
- `hen` is a constant-product strategy that backs a Uniswap v4 pool. The pool holds no LP liquidity. The v4 hook, CastleJITHook, fills each swap from `hen` inside the swap's own transaction.

The four agents are:

- fee, which reads Chainlink ETH/USD, sets the mid price and spread, and asks for a strategy to be re-centred when its curve drifts from the mid;
- fi, which compiles and ships the strategies and signs the quotes;
- fo, which routes orders to `harp` or to the v4 pool, whichever pays more;
- fum, which sets the leverage and per-slot caps and docks strategies if fills push the vault past its limit.

The build scope is [docs/SPEC.md](docs/SPEC.md). Where this file and the spec differ, the spec wins.

## Live

Everything described here runs on Ethereum Sepolia. The dapp is at https://handoff.lol/app/impecc/fee-fi-fo-fum. A user connects a Sepolia wallet and gets a quote for `harp` by resolving its ENS name from the browser. The user then either fills that quote through 1inch Aqua or swaps on the v4 pool that `hen` fills, and fo shows which of the two pays more. Every number on the page is read from Sepolia or from the castle service. Every action is a transaction from the user's own wallet, with an approve for the exact amount and an Etherscan link. From the published page (version 2.0.1, validator 100/100), 0.25 USDC filled `harp` in [0xb825bdd0…a59d](https://sepolia.etherscan.io/tx/0xb825bdd056ac2c8724b3e49dfd9b222dd2652341ad3724d93dc9e714ebb3a59d) for 93,065,725,297,176 WETH units. Another 0.25 USDC swapped on the v4 pool in [0xf840c09a…466b](https://sepolia.etherscan.io/tx/0xf840c09a95177625e57420694cb94a06548cd54dd23ae202c13800b567be466b) for 86,151,391,457,575 WETH units, filled by the hook from `hen`.

The tale, at https://handoff.lol/app/impecc/fee-fi-fo-fum-tale, renders the castle service's event stream (https://handoff.lol/t/castle/stream) as a story while events happen. It shows the vault's balance, fum's limits, the quotes and the fills, and it can replay the whole live run in a clean browser (validator 100/100).

Any ENS client that follows CCIP-Read can resolve `quote.feefifofum.eth`, for example viem `getEnsText` through UniversalResolverV2. The commands are in [docs/ens.md](docs/ens.md#try-it). The key `quote:USDC:WETH:500000` returns a price for 0.5 USDC, signed by fi and valid for 30 s. The key `castle` returns the vault's address. Both answers come through the gateway, and the resolver checks fi's signature on them. The name was registered in [0xebd3cb53…b258](https://sepolia.etherscan.io/tx/0xebd3cb532669b8c6a6ea2a2dbe0a1f6c30586a861105980f7fa726123e01b258).

The four contracts are Sourcify exact_match. They are recorded in [contracts/deployments/sepolia.json](contracts/deployments/sepolia.json).

| Contract | Address |
|---|---|
| CastleVault, the vault | [`0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98`](https://sepolia.etherscan.io/address/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98) |
| PriceExtruction, which checks fi's signed quotes | [`0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757`](https://sepolia.etherscan.io/address/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757) |
| OffchainQuoteResolver, the resolver for `quote.feefifofum.eth` | [`0x2D18c04Aec64f93255a417d56Cfdc5577712A76a`](https://sepolia.etherscan.io/address/0x2D18c04Aec64f93255a417d56Cfdc5577712A76a) |
| CastleJITHook, the v4 hook | [`0x890125413c9FeDB770D872BbA9415f5E1B7C0888`](https://sepolia.etherscan.io/address/0x890125413c9FeDB770D872BbA9415f5E1B7C0888) |
| v4 pool {USDC, WETH, fee 0, tickSpacing 60} | pool id `0xb1d82d460c7ddb0f881b310b4c69fcb435fcddb05317ab70cad0643eacad112a` |

## The four beats

The spec defines four things the entry has to show. The first three happened on Sepolia in the one live run, 12:43–13:03 UTC on 26 Sep. That run's record is [agents/live-run/11786346](agents/live-run/11786346/README.md). It has every transaction as read from its receipt, the quote that was filled, the castle service's stream and the agents' logs.

Before the live run, the agents rehearsed every step with their real code against the deployed contracts on a fork of Sepolia. That record is [agents/fork-run/11786199](agents/fork-run/README.md), and the sponsor notes give its numbers. Its transaction hashes exist only on the fork.

| # | What the spec asks for | Transactions on Sepolia | What to look for |
|---|---|---|---|
| 1 | The vault's one balance backs `harp` and `hen`, and each promises 80% of it, which is 1.6× in all and inside fum's 2× limit. A third ship, `greedy`, asks for 0.5× more and reverts with `OverAllocated`. | harp [`0x15711ddf…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) <br> hen [`0x5d7bee55…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) <br> greedy [`0x647aba61…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) | Each of the two ships emits CastleVault's `Shipped` and Aqua's `Shipped`. The greedy transaction failed with `OverAllocated(token, committedAfter, limit)`. |
| 2 | A solver resolves `quote.feefifofum.eth` through CCIP-Read, gets a quote signed by fi, and fills it. | [`0x763d6de1…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8) | AquaSwapVMRouter emits `Swapped` with harp's order hash, and Aqua emits `Pushed` and `Pulled` for the vault. |
| 3 | A swap on the vault's Uniswap v4 pool is filled from the vault in the same transaction. The pool holds no LP deposit. | [`0x53f773de…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116) | The one transaction contains `JitFill`, the router's `Swapped` with hen's order hash, and Aqua's `Pushed` and `Pulled`. The PoolManager's `Swap` event reports amounts of 0 by design; [docs/uniswap.md](docs/uniswap.md#reading-a-hook-filled-swap) explains why. |
| 4 | A user does the same from the dapp in a clean browser: connects a Sepolia wallet, gets a quote through ENS, fills it, and swaps on the v4 pool, each from their own wallet. | fill [0xb825bdd0…a59d](https://sepolia.etherscan.io/tx/0xb825bdd056ac2c8724b3e49dfd9b222dd2652341ad3724d93dc9e714ebb3a59d) <br> swap [0xf840c09a…466b](https://sepolia.etherscan.io/tx/0xf840c09a95177625e57420694cb94a06548cd54dd23ae202c13800b567be466b) | The dapp's URL is in [Live](#live). Both transactions come from the user's wallet. |

The live run followed the order in [docs/SPEC.md](docs/SPEC.md):

1. The treasury funded the vault with 5 USDC and 5/mid WETH in [`0x7e0b4a9f…e8a6`](https://sepolia.etherscan.io/tx/0x7e0b4a9f0fa7b8920b2f5188de6cfcebbed61c5dfdbf80110da4c1604cb5e8a6), [`0xd125c491…f543`](https://sepolia.etherscan.io/tx/0xd125c4919b722aeebda218b7ae2f794e5956afa6e325784829ea215b26d8f543) and [`0x34840128…eb3b`](https://sepolia.etherscan.io/tx/0x3484012803e8bc9a1b687326cfc27a727755d03d3c4ec80fd9a52b68d1a3eb3b). fum set the leverage to 2× for WETH in [`0xcf95760d…54f9`](https://sepolia.etherscan.io/tx/0xcf95760df456850bb1db11811c887c06fae925611984c7fc4e188f838b1a54f9) and for USDC in [`0x53336098…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7), and set the caps for slots 0 to 2.
2. fi shipped `harp` and `hen`, each promising 80% of the vault's balance. fi then shipped `greedy`, which asked for another 0.5× and reverted with `OverAllocated`. The remaining 0.4× of headroom is why the demo's fills never made fum dock a strategy.
3. A solver asked `quote.feefifofum.eth` for `quote:USDC:WETH:500000`. The resolver reverted with `OffchainLookup`, the gateway answered with fi's signed quote, and the solver filled 0.5 USDC through AquaSwapVMRouter.
4. The same solver swapped 0.5 USDC on the v4 pool through PoolSwapTest, and CastleJITHook filled the swap from `hen` in that transaction.
5. fee saw that hen's curve price had moved away from the mid (3,399.91 against 2,686.57) and asked for a re-centre. fi docked `hen` in [`0x32a20d16…638a`](https://sepolia.etherscan.io/tx/0x32a20d169556fd013eaa69cb2dc2db2108275c9513d36e24b0886ceab23d638a) and shipped it again at the mid in [`0x03dbf62b…67f3`](https://sepolia.etherscan.io/tx/0x03dbf62b16214b7bf36dce5b742ad80c7deccc466a9925328f9b26a817e267f3). The hook uses the new `hen` without any change, because it reads the vault's slot 1 on every swap.

## How to verify

None of the checks below needs a key. The vault's state can be read with Foundry and any Sepolia RPC:

```sh
RPC=https://ethereum-sepolia-rpc.publicnode.com
VAULT=0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98
WETH=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
cast call $VAULT "activeStrategies()(bytes32[])" --rpc-url $RPC      # the live strategies
cast call $VAULT "leverageOf(address)(uint16)" $WETH --rpc-url $RPC   # 20000 is 2x
cast call $VAULT "committed(address)(uint256)" $WETH --rpc-url $RPC   # what the strategies promise
cast call $VAULT "limit(address)(uint256)" $WETH --rpc-url $RPC       # balance x leverage
cast call 0x2D18c04Aec64f93255a417d56Cfdc5577712A76a "supportsInterface(bytes4)(bool)" 0x9061b923 --rpc-url $RPC   # true: CCIP-Read
cast call 0x890125413c9FeDB770D872BbA9415f5E1B7C0888 "VAULT()(address)" --rpc-url $RPC   # the hook fills from this vault
```

The hook's address ends in `0888`, and its low 14 bits are exactly its three v4 permission flags. [docs/ens.md](docs/ens.md#try-it) shows how to resolve the quote name.

All four contracts are Sourcify `exact_match` against the deployed commit [`fff518c`](https://github.com/34r7h/fee-fi-fo-fum/tree/fff518c55bfe60c752c0cd9acffbfc285f817f1c):

- [CastleVault](https://repo.sourcify.dev/11155111/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98)
- [PriceExtruction](https://repo.sourcify.dev/11155111/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757)
- [OffchainQuoteResolver](https://repo.sourcify.dev/11155111/0x2D18c04Aec64f93255a417d56Cfdc5577712A76a)
- [CastleJITHook](https://repo.sourcify.dev/11155111/0x890125413c9FeDB770D872BbA9415f5E1B7C0888)

The deploy's own record is [contracts/broadcast/DeployHoard.s.sol/11155111/run-latest.json](contracts/broadcast/DeployHoard.s.sol/11155111/run-latest.json).

`cd contracts && forge test` runs 61 tests. 46 of them are unit, fuzz and invariant tests that need no network. The other 15 run on a fork of Sepolia against the real Aqua, AquaSwapVMRouter, PoolManager, PoolSwapTest, the ENSv2 registry and UniversalResolverV2. Line coverage is 100% on all four contracts, and CastleVault's branch coverage is 96.4%. slither reports 0 High and 0 Medium findings after triage.

The fork rehearsal, [agents/fork-run/11786199](agents/fork-run/README.md), is the full demo, run by the agents and the castle service against the deployed contracts on a fork. It records every step's gas and result, the castle service's stream, and each agent's log.

## Pre-existing and new

The private handoff baseline is commit `079f8f0`, dated 2026-09-25 17:09 JST, before work on this entry began. Five later commits in that private repo are part of the entry. All five are by handoff-claude, and they are not in this public repo:

| Commit | Time (JST) | What |
|---|---|---|
| `95932ef` | 09-26 14:20 | `ens_name` accepts an ENSv2 name, checked on-chain via UniversalResolverV2 |
| `0115146` | 09-26 14:58 | ethereum-sepolia projects are paid on ethereum-sepolia through a direct EIP-3009 rail |
| `105f1dd` | 09-26 15:07 | an agent rotates its own `wallet_address` with an EIP-191 proof of possession |
| `3cfdb3f` | 09-26 15:18 | one payout submission per task on the self-submitted rails |
| `0495862` | 09-26 16:03 | the EIP-3009 payout nonce is derived from the payout, so a duplicate reverts on-chain |

This repo previously held the lease edition, which is retired. Its tree is at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition). New work does not use that tag's Castle, fence or JackHook.

The following are new, against the spec: CastleVault, PriceExtruction, CastleJITHook, OffchainQuoteResolver, the quote name, the castle gateway, and the four agents. The sponsor notes link each contract's source at the deployed commit [`fff518c`](https://github.com/34r7h/fee-fi-fo-fum/tree/fff518c55bfe60c752c0cd9acffbfc285f817f1c).

## Existing contracts the vault uses

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

These contracts were on Sepolia before the entry, and the vault uses them unmodified. Codesizes for Aqua and the v4 contracts are in [docs/research.md](docs/research.md). AquaSwapVMRouter's codesize was 20541 at the same public Sepolia endpoint on 2026-09-26. The four contracts this entry deployed are listed in [Live](#live).

## Repository layout

| Path | What it is |
|---|---|
| `contracts/` | The Foundry project: CastleVault, PriceExtruction, CastleJITHook and OffchainQuoteResolver, their unit, invariant and fork tests, the deploy script, the fork probes, and `deployments/sepolia.json` |
| `service/` | The castle service (the CCIP-Read gateway, the MCP tools and the event stream), its tests, and the host deploy notes |
| `agents/` | fee, fi, fo and fum: their roles, the crew config, the runner, and the records of the fork rehearsal (`fork-run/`) and the live run (`live-run/`) |
| `miniapp/` | The dapp, the tale page, and the stream schema they read |
| `docs/` | The documents listed below |

| Document | Contents |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | The build scope, last changed at `fc85b67`. It takes precedence over the pivot brief. |
| [docs/research.md](docs/research.md) | Fork measurements for the quote-name registration, the v4 addresses, UniswapX, and the prize text. |
| [docs/PIVOT.md](docs/PIVOT.md) | agy's architecture brief, kept verbatim. |
| [docs/NAMING.md](docs/NAMING.md) | The naming conventions and what the strategy and agent names refer to. |
| [docs/1inch.md](docs/1inch.md) | The Aqua integration: the vault, `harp`, `hen`, the leverage limit and PriceExtruction, with source links and transactions. |
| [docs/uniswap.md](docs/uniswap.md) | CastleJITHook: a v4 pool with no LP deposit whose swaps are filled from the vault. |
| [docs/ens.md](docs/ens.md) | `quote.feefifofum.eth` through UniversalResolverV2, the gateway, and a live resolution. |
| [docs/video-script.md](docs/video-script.md) | The shot list for the submission video. |

## Sponsor write-ups

- [docs/1inch.md](docs/1inch.md) covers the Aqua integration.
- [docs/uniswap.md](docs/uniswap.md) covers the v4 hook.
- [docs/ens.md](docs/ens.md) covers the quote name.
- [FEEDBACK.md](FEEDBACK.md) is our feedback for Uniswap on building the v4 hook.
- [docs/research.md](docs/research.md) has the measurements behind the spec's research gates.
