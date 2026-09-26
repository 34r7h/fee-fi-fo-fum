# fee-fi-fo-fum

**The giant never sleeps.**

A dead agent can't send the transaction that cancels its quotes. To every Jack watching the market, a crashed market-making agent is a sleeping giant with its gold left out. **fee-fi-fo-fum** is the giant that wakes up. Its liquidity is live only while its operator holds an ENS lease. The moment the lease lapses, the giant smells the intruder, and stale fills die on-chain with no transaction from the agent that fell. When no one takes the castle, the hoard isn't looted: it goes to a fair Uniswap auction, and any Jack with a name can climb up and bid.

It is a DeFi swarm on [handoff.lol](https://handoff.lol): four agents (**fee**, **fi**, **fo** and **fum**) and one miniapp for humans. It is built on **1inch Aqua/SwapVM**, **Uniswap CCA** and **ENSv2**, and everything on-chain runs on **Ethereum Sepolia**.

It is an ETHGlobal Tokyo 2026 entry in the Continuity track. The existing project is **handoff** (baseline `079f8f0`); this repo is the new work.

## Pre-existing and new

The private handoff baseline is commit `079f8f0`, 2026-09-25 17:09 JST, before hacking began at 21:00 JST. New work lives in this public repo, plus five commits the entry depends on in the private handoff repo after the baseline, all by handoff-claude (AI) and deployed to handoff.lol:

| Commit | Time (JST) | What |
|---|---|---|
| `95932ef` | 09-26 14:20 | `ens_name` accepts an ENSv2 name, verified on-chain via UniversalResolverV2 (replayable `ens_proof`) |
| `0115146` | 09-26 14:58 | ethereum-sepolia projects are paid on ethereum-sepolia through a direct EIP-3009 rail |
| `105f1dd` | 09-26 15:07 | an agent rotates its own `wallet_address` with an EIP-191 proof of possession |
| `3cfdb3f` | 09-26 15:18 | one payout submission per task on the self-submitted rails |
| `0495862` | 09-26 16:03 | the EIP-3009 payout nonce is derived from the payout, so a duplicate reverts on-chain |

Pre-existing, in handoff: the broker, signed messaging, agent heartbeat, `ens_name` on the agent record, the ENSv1 subnames, the ethereum-sepolia rail, and the ringout scaffolding.

New, in this repo: Castle, the ENSv2 parent `feefifofum.eth` and its subregistry, the four crew agents, the castle service, and the miniapp. The sponsor write-ups are [docs/1inch.md](docs/1inch.md), [docs/uniswap.md](docs/uniswap.md) and [docs/ens.md](docs/ens.md). The address table is filled only with deployments that are already on Sepolia.

| What | Address | Where it was checked |
|---|---|---|
| ETHRegistry | `0x657ea849311d3d5823348dded7c2aaafb3ede09e` | `docs/ens-probes.md` |
| ETHRegistrar | `0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca` | `docs/ens-probes.md` |
| UniversalResolverV2 | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` | `docs/ens-probes.md` |
| feefifofum subregistry | `0x2F2164507471a1a46506f902aBfdfB9d22e4bE09` | register tx `0xc51ab2660dd9a0029a201a4acd5330d7e7c2eac063cbfe58bb31039d30338378` |
| feefifofum resolver | `0x9D2251b5162701BC2bD97d61bc8aa3e53446285E` | same transaction |
| Aqua | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` | `contracts/deployments/sepolia.json` |
| AquaSwapVMRouter 1.0.2 | `0xeDB6933949dB941D495b23604818F9AbF55e70f9` | deploy tx `0xb2b319a23732ade788971450ed30498b0dbf6cbb54d86c9ad343e7b42a32cd4d` |
| WETH | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | `contracts/deployments/sepolia.json` |
| Circle USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | `contracts/deployments/sepolia.json` |
| CCA factory | `0x000000001F26a0044BaA66024e7b6599c61963F8` | `contracts/deployments/sepolia.json` |
| Castle | `0x6bF53228d8c5c3b0192B2028bD52fc4E9d1be8Ec` | `contracts/deployments/sepolia.json` (block 11784308) |
| FeeFiFoFumExtruction | `0xfA0455bca2B521664021A883aA78fBEAa470f271` | deploy tx `0x14ac049eeac5f13512c99c67942a4eb88e56f04910b3bc0a5e760fe3ab03629f` |
| JackHook | `0x50919ddaaf8294865652D53b45f210019AB2fcAd` | deploy tx `0x94cdb321f6279e83bd718dd20ac613a525d45ebf15ac0714b90c2356827dc539` |

## The loop

```
(1) ENSv2 lease: castle.feefifofum.eth
      The holder renews it with fo's attestation. After expiry anyone may claim it,
      and the regenerated token id becomes the fencing epoch.
      linkToNode points castle.* at the current shift.
        │  read at fill time, directly from the registry
        ▼
(2) 1inch Aqua + SwapVM 1.0.2. The maker is Castle.sol (the giant's castle and its hoard).
      Program = FeeFiFoFumExtruction → XYCConcentrateGrowLiquidity2D → FlatFeeIn
        live and same epoch → fill
        expired             → wind down (reduce-only, wide spread)
        epoch changed       → revert FeeFiFoFum()   (the giant smells a stale shift)
        │  shift change, or nobody claims the castle
        ▼
(3) Uniswap CCA is the exit, not the entrance
      JackHook: any agent with a name in handoff's ENSv2 registry may bid,
      and the incoming giant gets no privilege.
      clearingPrice goes back to ENS (setData), and the next shift centres its curve on it.
        └────────► back to (1)
```

## The four syllables

| Agent | Role |
|---|---|
| **fee** | Shift trader. Holds the castle, renews the lease, ships and re-ships the book. |
| **fi** | Hot standby. Wakes when fee falls, claims the castle, relinks it, and re-ships at a new epoch. |
| **fo** | Fencer and witness. Signs or withholds the attestation every renewal needs, replays fills, and reports incidents. |
| **fum** | Auctioneer. Runs the shift-change and dissolution CCAs, and writes the clearing price back to ENS. |

## Layout

| Path | Contents |
|---|---|
| `contracts/` | Foundry: Castle.sol, FeeFiFoFumExtruction.sol, JackHook.sol, and Sepolia-fork tests |
| `agents/` | fee, fi, fo and fum: handoff agents with viem on Ethereum Sepolia |
| `service/` | The castle service: MCP tools and the live stream |
| `miniapp/` | `fee-fi-fo-fum.html`: a world-clock ring of shifts, the lease countdown, the fence state, the hoard, a live CCA chart, a tapestry of every event and a replay tab that re-judges each fill; `STREAM.md` is the stream schema |
| `docs/` | The plan, naming, sponsor write-ups, FEEDBACK.md and AI_USAGE.md |
| `WORKLOG.md` | A running record of what was built, by whom, and where it lives on-chain |

## Live

- Castle service (MCP, REST, SSE): https://handoff.lol/t/castle/, with MCP at `/mcp`, tools at `/tools` and the stream at `/stream`
- Miniapp: https://handoff.lol/app/impecc/fee-fi-fo-fum (v1.0.5, app hash `bb5c4695d1688f490aebde9161535f9405cfd4498d550278`, validator 100/100). It reads the castle stream. If the service is quiet, it reads Castle, Aqua and the CCA on Sepolia directly and says "Chain replay". The labelled mock plays only if neither answers. Build it with `node miniapp/build.mjs --live`.

## Trust assumptions

Three residual trusts. None of them is removed by the lease or the auction.

**R1. Registry admin.** `0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99` is the castle EOA and still holds root `ROLE_REGISTRAR` (`1 << 0`) on the feefifofum subregistry `0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`. It can register new labels. It can no longer unregister a name, repoint its resolver or subregistry, or grant those powers again. `hasRootRoles` is false for `ROLE_UNREGISTER` (bit 12), `UNREGISTER_ADMIN` (140), `SET_RESOLVER` (20), `SET_RESOLVER_ADMIN` (148), `SET_SUBREGISTRY` (24) and `SET_SUBREGISTRY_ADMIN` (152). The revokes are `0x14b20820366ad908fc06bb3a3d16a6c86977b42db464d3a32df503147586b844` (block 11784392) and `0x5973bca0ee11925f48a9d5b2e05d7185067e77879b4b2e7eec996cd182bdae9a` (block 11784434). REGISTRAR remains, so that EOA is still trusted the way Castle's owner `0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73` is trusted: it can put a new name on the registry.

**R2. Self-bid.** The holder or the auctioneer can bid in an auction Castle itself opened. The floor is 80% of the anchor (`FLOOR_PCT` in `Castle.sol`) and the auction lasts 25 blocks (`AUCTION_BLOCKS`). Graduation requires currency equal to 50% of the lot valued at that floor (`GRADUATION_PCT`); below that, the anchor does not move. A bid that does graduate can clear at the floor, which moves the anchor by 20% in that round. Nothing in the contracts stops the holder or the auctioneer from being that bidder. The bound holds only if an outside Jack bids.

**R3. Verification.** Castle `0x6bF53228d8c5c3b0192B2028bD52fc4E9d1be8Ec` and JackHook `0x50919ddaaf8294865652D53b45f210019AB2fcAd` are Sourcify `exact_match` at commit `7b863212f649c07327ac53966e8fae40f813cfb7`. Etherscan verification is still pending an operator API key (`contracts/deployments/sepolia.json`).

**R4. Repeat dissolve.** `dissolve()` has no once-per-epoch guard and does not look at whether an auction is open. After `settleAuction()` the unsold WETH is back in Castle and `auction` is `address(0)`. If the lease is still past `expiry + dissolveGrace`, anyone can call `dissolve()` again. A graduated auction writes the clearing price, which can be the 80% floor, so each round can set the anchor 20% lower. Castle was deployed with `dissolveGrace` at `1800` seconds. The owner has since raised it to `86400`, which is `1 days` (`MAX_DISSOLVE_GRACE`), in tx `0xf8be3efb437ef996c1d457461e06b2f62bde4324ac93df7a599d50fa1e6a4def` (block 11784702). fi also claims immediately after settle. The next redeploy should allow at most one dissolve per epoch, and none while an auction is open.

## Status

Work in progress. See [WORKLOG.md](WORKLOG.md).
