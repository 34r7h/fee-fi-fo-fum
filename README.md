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

- **Trade with the giant.** The dapp at https://handoff.lol/app/impecc/fee-fi-fo-fum is feefifofum's web3 interface. Connect a Sepolia wallet, ask the harp for a price by its ENS name from your browser and fill it through 1inch Aqua, or swap on the hen (the v4 pool the castle fills just in time); fo shows which pays more. Every number is read from Sepolia or the castle service, and every action is a tx from your wallet with exact-amount approves and an Etherscan link. From the published page, 0.25 USDC filled the harp in [0xb825bdd0…a59d](https://sepolia.etherscan.io/tx/0xb825bdd056ac2c8724b3e49dfd9b222dd2652341ad3724d93dc9e714ebb3a59d) and swapped on the hen in [0xf840c09a…466b](https://sepolia.etherscan.io/tx/0xf840c09a95177625e57420694cb94a06548cd54dd23ae202c13800b567be466b) (version 2.0.1, validator 100/100).
- **Read the tale.** https://handoff.lol/app/impecc/fee-fi-fo-fum-tale tells the hoard, fum's promises, the harp's quotes and the hen's fills as a tapestry while they happen, from the castle service's stream at https://handoff.lol/t/castle/stream, and retells the whole live run from a clean browser (validator 100/100).
- **Ask the harp.** `quote.feefifofum.eth` answers any ENS client that follows CCIP-Read, for example viem `getEnsText` through UniversalResolverV2 ([docs/ens.md](docs/ens.md#try-it) has the commands). The key `quote:USDC:WETH:500000` returns a price for 0.5 USDC that fi signed, good for 30 s, and the key `castle` returns the vault's address. Both come through the gateway and are checked against fi's signature. The name was registered in [0xebd3cb53…b258](https://sepolia.etherscan.io/tx/0xebd3cb532669b8c6a6ea2a2dbe0a1f6c30586a861105980f7fa726123e01b258).
- **The contracts.** All four are Sourcify exact_match, recorded in [contracts/deployments/sepolia.json](contracts/deployments/sepolia.json).

| Contract | Address |
|---|---|
| CastleVault (the hoard) | [`0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98`](https://sepolia.etherscan.io/address/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98) |
| PriceExtruction (fi's signed quotes) | [`0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757`](https://sepolia.etherscan.io/address/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757) |
| OffchainQuoteResolver (`quote.feefifofum.eth`) | [`0x2D18c04Aec64f93255a417d56Cfdc5577712A76a`](https://sepolia.etherscan.io/address/0x2D18c04Aec64f93255a417d56Cfdc5577712A76a) |
| CastleJITHook (the hen) | [`0x890125413c9FeDB770D872BbA9415f5E1B7C0888`](https://sepolia.etherscan.io/address/0x890125413c9FeDB770D872BbA9415f5E1B7C0888) |
| v4 pool {USDC, WETH, fee 0, tickSpacing 60} | pool id `0xb1d82d460c7ddb0f881b310b4c69fcb435fcddb05317ab70cad0643eacad112a` |

## The four beats

All four happened on Ethereum Sepolia in the one live run, 12:43–13:03 UTC on 26 Sep. Its record, with every tx read from its receipt, the quote that was filled, the castle stream and the crew's logs, is [agents/live-run/11786346](agents/live-run/11786346/README.md). Before that run, the crew rehearsed every beat with its real code against the deployed contracts, on a fork of Sepolia ([agents/fork-run/11786199](agents/fork-run/README.md)). The sponsor notes give that rehearsal's numbers. Its hashes exist only on the fork.

| # | Beat | Live on Sepolia | What to look for |
|---|---|---|---|
| 1 | One Castle balance backs `harp` and `hen`, each promising 80% of it: 1.6× in all, inside fum's 2×. A third ship, `greedy`, asks for 0.5× more and reverts `OverAllocated`. | harp [`0x15711ddf…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) <br> hen [`0x5d7bee55…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) <br> greedy [`0x647aba61…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) | two ships, each with CastleVault's `Shipped` and Aqua's `Shipped`; greedy's tx failed with `OverAllocated(token, committedAfter, limit)` |
| 2 | A solver resolves `quote.feefifofum.eth` through CCIP-Read, gets a firm quote signed by fi, and fills it. | [`0x763d6de1…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8) | AquaSwapVMRouter `Swapped` with harp's order hash; Aqua `Pushed` and `Pulled` on the Castle |
| 3 | A Uniswap v4 swap on the Castle's pool is filled just in time from the Castle. The pool holds no LP deposit. | [`0x53f773de…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116) | in one tx: `JitFill`, router `Swapped` with hen's order hash, Aqua `Pushed` and `Pulled`; the PoolManager's `Swap` reads 0 by design ([why](docs/uniswap.md#reading-a-hook-filled-swap)) |
| 4 | The miniapp tells all three from a clean browser. | the miniapp link in [Live](#live) | the hoard, fum's promises, the harp's quote and the hen's fill, as they happen |

The run, step by step, as [docs/SPEC.md](docs/SPEC.md) sets it and as it went on Sepolia:

1. The treasury funds the Castle with 5 USDC and 5/mid WETH ([`0x7e0b4a9f…e8a6`](https://sepolia.etherscan.io/tx/0x7e0b4a9f0fa7b8920b2f5188de6cfcebbed61c5dfdbf80110da4c1604cb5e8a6), [`0xd125c491…f543`](https://sepolia.etherscan.io/tx/0xd125c4919b722aeebda218b7ae2f794e5956afa6e325784829ea215b26d8f543) and [`0x34840128…eb3b`](https://sepolia.etherscan.io/tx/0x3484012803e8bc9a1b687326cfc27a727755d03d3c4ec80fd9a52b68d1a3eb3b)). fum sets leverage to 2× for WETH ([`0xcf95760d…54f9`](https://sepolia.etherscan.io/tx/0xcf95760df456850bb1db11811c887c06fae925611984c7fc4e188f838b1a54f9)) and USDC ([`0x53336098…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7)), and sets the caps for slots 0 to 2.
2. fi ships `harp` and `hen`, each promising 80% of the hoard. fi ships `greedy`, asking for another 0.5×, and it reverts `OverAllocated`. The 0.4× of headroom left over means the demo's fills never make fum dock.
3. A solver asks `quote.feefifofum.eth` for `quote:USDC:WETH:500000`. The resolver reverts `OffchainLookup`, the gateway answers with fi's signed quote, and the solver fills 0.5 USDC through AquaSwapVMRouter.
4. The same solver swaps 0.5 USDC on the v4 pool through PoolSwapTest. CastleJITHook fills the swap from `hen` in that transaction.
5. fee sees hen's curve drift from the mid (3,399.91 against 2,686.57) and asks for a re-centre. fi docks hen ([`0x32a20d16…638a`](https://sepolia.etherscan.io/tx/0x32a20d169556fd013eaa69cb2dc2db2108275c9513d36e24b0886ceab23d638a)) and ships it again at the mid ([`0x03dbf62b…67f3`](https://sepolia.etherscan.io/tx/0x03dbf62b16214b7bf36dce5b742ad80c7deccc466a9925328f9b26a817e267f3)). The hook follows the new hen, because it reads slot 1 on every swap.

## How to verify

No key is needed to check any of this.

**On-chain.** With Foundry and any Sepolia RPC:

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

The hook's address ends in `0888`: its low 14 bits are exactly its three v4 flags. To resolve the quote name yourself, see [docs/ens.md](docs/ens.md#try-it).

**Source.** All four contracts are Sourcify `exact_match` against the deployed commit [`fff518c`](https://github.com/34r7h/fee-fi-fo-fum/tree/fff518c55bfe60c752c0cd9acffbfc285f817f1c):
- [CastleVault](https://repo.sourcify.dev/11155111/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98)
- [PriceExtruction](https://repo.sourcify.dev/11155111/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757)
- [OffchainQuoteResolver](https://repo.sourcify.dev/11155111/0x2D18c04Aec64f93255a417d56Cfdc5577712A76a)
- [CastleJITHook](https://repo.sourcify.dev/11155111/0x890125413c9FeDB770D872BbA9415f5E1B7C0888)

The deploy's own record is [contracts/broadcast/DeployHoard.s.sol/11155111/run-latest.json](contracts/broadcast/DeployHoard.s.sol/11155111/run-latest.json).

**Tests.** `cd contracts && forge test` runs 61 tests:
- 46 unit, fuzz and invariant tests, which need no network;
- 15 on a fork of Sepolia, against the real Aqua, AquaSwapVMRouter, PoolManager, PoolSwapTest, the ENSv2 registry and UniversalResolverV2.

Line coverage is 100% on all four contracts, and CastleVault's branch coverage is 96.4%. slither shows 0 High and 0 Medium after triage.

**The rehearsal.** [agents/fork-run/11786199](agents/fork-run/README.md) is the full demo, run by the crew and the castle service against the deployed contracts on a fork. It has every step's gas and result, the castle stream, and each agent's log.

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

New, against the spec: CastleVault, PriceExtruction, CastleJITHook, OffchainQuoteResolver, the quote name, the castle gateway, and the four crew agents. The sponsor notes link each contract's source at the deployed commit [`fff518c`](https://github.com/34r7h/fee-fi-fo-fum/tree/fff518c55bfe60c752c0cd9acffbfc285f817f1c).

## Addresses the Castle builds on

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

These were on Sepolia before the entry, and the Castle uses them as they are. Codesizes for the v4 rows and for Aqua are in [docs/research.md](docs/research.md). AquaSwapVMRouter's codesize was 20541 at the same public Sepolia endpoint on 2026-09-26. The four contracts this entry deployed are in [Live](#live).

## Repository layout

| Path | What it is |
|---|---|
| `contracts/` | Foundry project: CastleVault, PriceExtruction, CastleJITHook and OffchainQuoteResolver, their unit, invariant and fork tests, the deploy script, the fork probes, and `deployments/sepolia.json` |
| `service/` | Castle gateway, its tests, and the host deploy notes |
| `agents/` | fee, fi, fo, and fum: roles, crew config, the runner, and the fork rehearsal's records (`fork-run/`) |
| `miniapp/` | The browser page and its stream schema |
| `docs/` | The notes below |

| Doc | One line |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | Build scope, last changed at `43e57ac`. It wins over the pivot brief. |
| [docs/research.md](docs/research.md) | Fork measurements for the quote register, v4 addresses, UniswapX, and the prize text. |
| [docs/PIVOT.md](docs/PIVOT.md) | agy's architecture brief, kept verbatim. |
| [docs/NAMING.md](docs/NAMING.md) | Voice, and what the hoard, the harp, and the hen mean. |
| [docs/1inch.md](docs/1inch.md) | The Aqua app: one balance, harp, hen, leverage, PriceExtruction, with permalinks and txs. |
| [docs/uniswap.md](docs/uniswap.md) | CastleJITHook: a v4 pool with no LP deposit, filled just in time from the Castle. |
| [docs/ens.md](docs/ens.md) | `quote.feefifofum.eth` through UniversalResolverV2, the gateway, and a live resolution. |
| [docs/video-script.md](docs/video-script.md) | Shot list for the submission video. |

## Write-ups

- [docs/1inch.md](docs/1inch.md) — the Aqua app
- [docs/uniswap.md](docs/uniswap.md) — the v4 hook
- [docs/ens.md](docs/ens.md) — the quote name
- [FEEDBACK.md](FEEDBACK.md) — what building the v4 hook ran into, for Uniswap
- [docs/research.md](docs/research.md) — the measurements behind the spec's research gates
