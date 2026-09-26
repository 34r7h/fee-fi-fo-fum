# WORKLOG

A running record of the fee-fi-fo-fum build: what was done, who did it, the commit, and where it lives on-chain. SirKit (the orchestrator) keeps it in step with the handoff board and the git log.

- **Handoff project:** `2af16779-4c0f-4c93-94b7-6a0281fc6846` (requester SirKit, budget 12 USDC, settles on `ethereum-sepolia`)
- **Repo:** https://github.com/34r7h/fee-fi-fo-fum
- **Spec:** [docs/PLAN.md](docs/PLAN.md), Option A (BATON)
- **Deadline:** Sun 27 Sep 09:00 JST (00:00 UTC)
- **Pre-existing product:** handoff (private), baseline `079f8f0` (2026-09-25 17:09 JST)

Status key: `todo` · `in_progress` · `review` (pending verification) · `done` (verified) · `blocked`

## Board

### P0 BLOCKERS: Continuity registration, ENSv2 lease probes, wallets, handoff baseline

| Task | Owner | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|
| **BLOCKER** OPERATOR: confirm the team is registered in the Continuity track on the ETHGlobal Hacker Dashboard <br>`p0-continuity` `d5c5a9d3` | OPERATOR | Sat 15:00 | todo | | |
| **BLOCKER** Register feefifofum.eth on ENSv2 (Sepolia) and answer the four lease probes <br>`p0-ens-probes` `b22e3c07` | korg | Sat 15:00 | todo | | |
| **BLOCKER** Create the fee, fi, fo, fum handoff agents and fund their Ethereum Sepolia wallets <br>`p0-wallets` `a27aa444` | agent-smith | Sat 15:30 | todo | | |

### P1 CONTRACTS: SwapVM router 1.0.2, Baton.sol, FenceExtruction.sol

| Task | Owner | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|
| Foundry scaffold, then deploy the SwapVM router (release/1.0.2) on Sepolia <br>`p1-router` `902378f6` | mister-anderson | Sat 16:00 | todo | | |
| **BLOCKER** Baton.sol: desk treasury, Aqua maker and ENSv2 lease <br>`p1-baton` `c3a2dfdf` | mister-anderson | Sat 19:00 | todo | | |
| **BLOCKER** FenceExtruction.sol: the ENS-lease fence inside the SwapVM program <br>`p1-fence` `9019b3b9` | mister-anderson | Sat 19:00 | todo | | |
| Independent Sepolia-fork test suite for Baton and FenceExtruction <br>`p1-forktests` `f4d2ae68` | agy | Sat 19:45 | todo | | |
| **BLOCKER** Deploy and verify Baton and FenceExtruction on Sepolia, then ship the first live strategy <br>`p1-deploy` `1fed769f` | mister-anderson | Sat 20:30 | todo | | |

### P1 DESK SERVICE + PLATFORM: ENSv2 agent names, baton MCP tools and stream, handoff.lol Sepolia fixes

| Task | Owner | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|
| handoff.lol platform: make sure the ethereum-sepolia rail works for the entry (fix on handoff.lol only if broken) <br>`p2-rail` `a2308925` | handoff-claude | Sat 16:30 | todo | | |
| handoff's ENSv2 agent registry: agents get ENSv2 names, and ens_name is live on handoff.lol <br>`p2-ensv2-registry` `495228e6` | handoff-claude | Sat 20:00 | todo | | |
| baton desk service: seven desk and auction MCP tools in fee-fi-fo-fum/service <br>`p2-capabilities` `a7ab1050` | handoff-claude | Sat 22:00 | todo | | |
| baton desk stream (SSE) served through the baton agent's handoff tunnel <br>`p2-stream` `9bd248fa` | handoff-claude | Sat 23:00 | todo | | |

### P1 AGENTS: fee, fi, fo, fum on handoff

| Task | Owner | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|
| agents/ scaffold: shared runtime for fee, fi, fo, fum <br>`p3-scaffold` `17b80082` | agent-smith | Sat 17:00 | todo | | |
| fee (shift trader) and fi (hot standby): lease renewal and failover logic <br>`p3-feefi` `fa22a44e` | agent-smith | Sat 20:30 | todo | | |
| fo, fencer and witness: EIP-712 attestations, fill replay, incident channel <br>`p3-fo` `9b450702` | agent-smith | Sat 20:30 | todo | | |
| **BLOCKER** Live failover on Sepolia: kill -9 fee, FENCED, fi claims, fills resume, stale fee rejected <br>`p3-failover-e2e` `ad888e60` | agent-smith | Sat 22:30 | todo | | |
| fum, auctioneer: shift-change and dissolution CCAs, checkpoint, sweep, setData <br>`p3-fum` `c78ba379` | agent-smith | Sun 00:00 | todo | | |

### P2 UNISWAP CCA: CrewHook, shift-change and dissolution auctions, price write-back

| Task | Owner | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|
| CrewHook.sol: CCA validation hook gated on handoff's ENSv2 agent registry <br>`p4-crewhook` `67f5a962` | korg | Sat 20:00 | todo | | |
| **BLOCKER** Baton and CCA: shift-change and dissolution auctions, with the clearing price written back to ENS <br>`p4-cca` `d4a7c73a` | mister-anderson | Sat 23:30 | todo | | |
| **BLOCKER** Live: an outside agent bids via MCP, a shift-change CCA clears on Sepolia, and the next curve moves <br>`p4-cca-e2e` `3becce17` | agy | Sun 01:30 | todo | | |

### P1 MINIAPP: baton.html

| Task | Owner | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|
| baton.html against a mock desk stream <br>`p5-mock` `198a1550` | impecc | Sat 21:00 | todo | | |
| Wire baton.html to the live desk stream and publish it on handoff.lol <br>`p5-live` `fd20d4c5` | impecc | Sun 02:00 | todo | | |

### P3 SUBMISSION: write-ups, feedback, deck/video, rehearsal, submit

| Task | Owner | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|
| README before/after, the three sponsor integration write-ups, and the contract address table <br>`p6-writeups` `3fb7f7a3` | korg | Sun 07:00 | todo | | |
| FEEDBACK.md for Uniswap and the developers.uniswap.org/hackathon-feedback form <br>`p6-feedback` `d0587b18` | korg | Sun 07:00 | todo | | |
| Pitch deck, plus the script and shot list for a 2-4 min demo video <br>`p6-deck` `005db56f` | impecc | Sun 07:00 | todo | | |
| **BLOCKER** Two full rehearsals of the five-beat demo on Sepolia from a clean browser <br>`p6-rehearsal` `3eb4aa41` | agy | Sun 05:00 | todo | | |
| AI_USAGE.md and the final WORKLOG.md pass <br>`p6-ai-usage` `8abb390e` | SirKit | Sun 08:00 | todo | | |
| **BLOCKER** OPERATOR: record the video, submit on ETHGlobal and select 1inch, Uniswap and ENS <br>`p6-submit` `6aa606a5` | OPERATOR | Sun 08:45 | todo | | |

## Contracts (Ethereum Sepolia)

| Contract | Address | Verified | Deployed by | Tx |
|---|---|---|---|---|
| Aqua (official, pre-existing) | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | n/a | 1inch | |
| Uniswap CCA factory (pre-existing) | `0x000000001F26a0044BaA66024e7b6599c61963F8` | n/a | Uniswap | |
| ENSv2 UniversalResolverV2 (pre-existing) | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` | n/a | ENS | |
| Circle USDC (pre-existing) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | n/a | Circle | |
| SwapVM router release/1.0.2 | | | | |
| Baton.sol | | | | |
| FenceExtruction.sol | | | | |
| CrewHook.sol | | | | |
| ENSv2 agent registry | | | | |

## ENS names

| Name | Owner | Expiry / epoch | Tx |
|---|---|---|---|
| feefifofum.eth | | | |
| desk.feefifofum.eth | | | |

## Agents

| Agent | handoff id | Sepolia address | ENSv2 name | Funded (ETH / USDC / WETH) |
|---|---|---|---|---|
| fee | | | | |
| fi | | | | |
| fo | | | | |
| fum | | | | |

## Miniapp

| Item | Value |
|---|---|
| Source | `miniapp/baton.html` |
| Published URL | |
| Validation score | |
| Stream URL | |

## Documentation

| Doc | Owner | Status |
|---|---|---|
| README.md (pitch, before/after, addresses) | korg | draft (SirKit, commit a09a598) |
| docs/PLAN.md | handoff-advisor | done (3cb55b7, sha256 774b7475…) |
| docs/ens-probes.md | korg | todo |
| docs/1inch.md, docs/uniswap.md, docs/ens.md | korg | todo |
| FEEDBACK.md | korg | todo |
| docs/video-script.md + deck | impecc | todo |
| AI_USAGE.md | SirKit | skeleton |
| miniapp/STREAM.md | impecc | todo |

## Demo evidence (beats 1–5)

| Beat | Tx / link | Verified by |
|---|---|---|
| 1. kill -9 fee | | |
| 2. taker fill reverts FENCED | | |
| 3. fi claims, fills resume | | |
| 4. stale fee rejected on-chain | | |
| 5. dissolution CCA clears, price to ENS | | |

## Log

| Time (JST) | Who | What |
|---|---|---|
| Sat 13:20 | operator | Chose Option A (BATON). SirKit is orchestrator. Swarm: agent-smith, mister-anderson, impecc, korg, agy, handoff-advisor, handoff-claude. |
| Sat 13:24 | SirKit | Pushed README (a09a598) to github.com/34r7h/fee-fi-fo-fum. |
| Sat 13:24 | SirKit | Created handoff project 2af16779 (budget 12 USDC, ethereum-sepolia). |
| Sat 13:25 | handoff-advisor | Confirmed the research is theirs; relayed the operator rule that nothing for this entry goes in the handoff repo. |
| Sat 13:26 | SirKit | Pushed docs/PLAN.md (3cb55b7), byte-identical to the advisor original. |
| Sat 13:28 | SirKit | Created 7 goals and 28 tasks (11 blockers, 21 with deps), set the parallel ordering. |
