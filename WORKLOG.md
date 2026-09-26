# WORKLOG

This is the running record of the fee-fi-fo-fum build: what was done, who did it, which commit, and where it lives on-chain. SirKit (orchestrator) regenerates it from the handoff board and the evidence agents submit. Agents do not edit it by hand.

- **Handoff project:** `2af16779-4c0f-4c93-94b7-6a0281fc6846`: team `team_d5195308`, requester SirKit, budget 12 USDC, settles on `ethereum-sepolia`
- **Repo:** https://github.com/34r7h/fee-fi-fo-fum
- **Spec:** [docs/PLAN.md](docs/PLAN.md) (research, Option A) plus the handoff board, which wins where they differ. Naming: [docs/NAMING.md](docs/NAMING.md)
- **Deadline:** Sun 27 Sep 09:00 JST (00:00 UTC)
- **Pre-existing product:** handoff (private), baseline `079f8f0` (2026-09-25 17:09 JST)
- **Last regenerated:** 2026-09-26 13:45 JST

Status key: `todo`, `in_progress`, `review` (pending verification), `done` (verified). Owner is the planned owner; Assignee is the agent that has claimed the task on the board.

## Board

### P0 BLOCKERS: Continuity registration, ENSv2 lease probes, wallets, handoff baseline

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| **BLOCKER** OPERATOR: confirm the team is registered in the Continuity track on the ETHGlobal Hacker Dashboard <br>`p0-continuity` `d5c5a9d3` | OPERATOR |  | Sat 15:00 | todo |  |  |
| **BLOCKER** Register feefifofum.eth on ENSv2 (Sepolia) and answer the four lease probes <br>`p0-ens-probes` `b22e3c07` | korg | korg | Sat 15:00 | in_progress |  |  |
| **BLOCKER** Create the fee, fi, fo, fum handoff agents and fund their Ethereum Sepolia wallets <br>`p0-wallets` `a27aa444` | agent-smith | agent-smith | Sat 15:30 | in_progress |  |  |

### P1 CONTRACTS: SwapVM router 1.0.2, Castle.sol, FeeFiFoFumExtruction.sol

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| Foundry scaffold, then deploy the SwapVM router (release/1.0.2) on Sepolia <br>`p1-router` `902378f6` | mister-anderson | mister-anderson | Sat 16:00 | in_progress | 3301492 (scaffold) |  |
| **BLOCKER** Castle.sol: the giant's castle (desk treasury, Aqua maker and ENSv2 lease) <br>`p1-castle` `c3a2dfdf` | mister-anderson |  | Sat 19:00 | todo |  |  |
| **BLOCKER** FeeFiFoFumExtruction.sol: the giant smells a stale shift (the ENS-lease fence in the SwapVM program) <br>`p1-extruction` `9019b3b9` | korg |  | Sat 19:00 | todo |  |  |
| Independent Sepolia-fork test suite for Castle and FeeFiFoFumExtruction <br>`p1-forktests` `f4d2ae68` | agy |  | Sat 19:45 | todo |  |  |
| **BLOCKER** Deploy and verify Castle and FeeFiFoFumExtruction on Sepolia, then ship the first live strategy <br>`p1-deploy` `1fed769f` | mister-anderson |  | Sat 20:30 | todo |  |  |
| **BLOCKER** ICastleLease interface, published before 15:30 JST so the fence and fo can build in parallel <br>`p1-iface` `17a2de4c` | mister-anderson | mister-anderson | Sat 15:30 | review | 3301492, 980fd97, f0c7d65, e11f755 |  |

### P1 CASTLE SERVICE + ENS: ENSv2 agent names, castle MCP tools and stream, Sepolia rail check

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| handoff.lol: check that the ethereum-sepolia rail works for the entry (public API only) <br>`p2-rail` `a2308925` | handoff-claude | handoff-claude | Sat 16:30 | review |  | defect report (no ethereum-sepolia settlement on handoff); workaround adopted |
| handoff's ENSv2 agent registry: pre-existing handoff agents get load-bearing ENSv2 names <br>`p2-ensv2-registry` `495228e6` | handoff-claude | handoff-claude | Sat 20:00 | in_progress |  |  |
| castle service: seven MCP tools in fee-fi-fo-fum/service <br>`p2-capabilities` `a7ab1050` | handoff-claude | handoff-claude | Sat 22:00 | in_progress |  |  |
| castle stream (SSE) for the miniapp <br>`p2-stream` `9bd248fa` | handoff-claude | handoff-claude | Sat 23:00 | in_progress |  |  |

### P1 AGENTS: fee, fi, fo, fum on handoff

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| agents/ scaffold: shared runtime for fee, fi, fo, fum <br>`p3-scaffold` `17b80082` | agent-smith | agent-smith | Sat 17:00 | in_progress |  |  |
| fee (shift trader) and fi (hot standby): lease renewal and failover logic <br>`p3-feefi` `fa22a44e` | agent-smith | agent-smith | Sat 20:30 | in_progress |  |  |
| fo, fencer and witness: EIP-712 attestations, fill replay, incident channel <br>`p3-fo` `9b450702` | agy |  | Sat 20:30 | todo |  |  |
| **BLOCKER** Live failover on Sepolia: kill -9 fee, wind-down gap, fi claims, stale epoch fenced, stale fee rejected <br>`p3-failover-e2e` `ad888e60` | agent-smith | agent-smith | Sat 22:30 | in_progress |  |  |
| fum, auctioneer: shift-change and dissolution CCAs, checkpoint, sweep, setData <br>`p3-fum` `c78ba379` | agent-smith | agent-smith | Sun 00:00 | in_progress |  |  |

### P2 UNISWAP CCA: JackHook, shift-change and dissolution auctions, price write-back

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| JackHook.sol: any Jack with an ENSv2 name can climb and bid (CCA validation hook) <br>`p4-jackhook` `67f5a962` | korg |  | Sat 20:00 | todo |  |  |
| **BLOCKER** Castle and CCA: shift-change and dissolution auctions, with the clearing price written back to ENS <br>`p4-cca` `d4a7c73a` | mister-anderson |  | Sat 23:30 | todo |  |  |
| **BLOCKER** Live: an outside agent bids via MCP, a shift-change CCA clears on Sepolia, and the next curve moves <br>`p4-cca-e2e` `3becce17` | agy |  | Sun 01:30 | todo |  |  |

### P1 MINIAPP + LIVE DEMO: fee-fi-fo-fum.html, durable hosting

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| fee-fi-fo-fum.html against a mock castle stream <br>`p5-mock` `198a1550` | impecc | impecc | Sat 21:00 | in_progress |  |  |
| Wire fee-fi-fo-fum.html to the live castle stream and publish it on handoff.lol <br>`p5-live` `fd20d4c5` | impecc | impecc | Sun 02:00 | in_progress |  |  |
| Durable hosting for the castle service, so the live demo survives past the event <br>`p5-durable` `7ab03bab` | handoff-claude | handoff-claude | Sun 02:00 | in_progress |  |  |

### P3 SUBMISSION: write-ups, feedback, deck/video, rehearsal, submit

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| README before/after, the three sponsor integration write-ups, and the contract address table <br>`p6-writeups` `3fb7f7a3` | korg |  | Sun 07:00 | todo |  |  |
| FEEDBACK.md for Uniswap and the developers.uniswap.org/hackathon-feedback form <br>`p6-feedback` `d0587b18` | korg |  | Sun 07:00 | todo |  |  |
| Pitch deck, plus the script and shot list for a 2-4 min demo video <br>`p6-deck` `005db56f` | impecc | impecc | Sun 07:00 | in_progress |  |  |
| **BLOCKER** Two full rehearsals of the five-beat demo on Sepolia from a clean browser <br>`p6-rehearsal` `3eb4aa41` | agy |  | Sun 05:00 | todo |  |  |
| AI_USAGE.md and the final WORKLOG.md pass <br>`p6-ai-usage` `8abb390e` | SirKit | SirKit | Sun 08:00 | in_progress |  |  |
| **BLOCKER** OPERATOR: record the video, submit on ETHGlobal and select 1inch, Uniswap and ENS <br>`p6-submit` `6aa606a5` | OPERATOR |  | Sun 08:45 | todo |  |  |
| **BLOCKER** OPERATOR: owned contributions on the record (design calls, review sign-offs, the video, booth conversations) <br>`p6-operator` `0b628549` | OPERATOR |  | Sun 08:00 | todo |  |  |

## Contracts (Ethereum Sepolia)

| Contract | Address | Verified | Deployed by | Tx |
|---|---|---|---|---|
| Aqua (official, pre-existing) | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | n/a | 1inch |  |
| Uniswap CCA factory (pre-existing) | `0x000000001F26a0044BaA66024e7b6599c61963F8` | n/a | Uniswap |  |
| ENSv2 UniversalResolverV2 (pre-existing) | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` | n/a | ENS |  |
| Circle USDC (pre-existing) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | n/a | Circle |  |
| SwapVM router release/1.0.2 |  |  | mister-anderson |  |
| Castle.sol |  |  | mister-anderson |  |
| FeeFiFoFumExtruction.sol |  |  | korg |  |
| JackHook.sol |  |  | korg |  |
| ENSv2 agent registry |  |  | handoff-claude |  |

## ENS names

| Name | Owner | Expiry / epoch | Tx |
|---|---|---|---|
| feefifofum.eth |  |  |  |
| castle.feefifofum.eth |  |  |  |

## Agents

| Agent | handoff id | Sepolia address | ENSv2 name | Funded (ETH / USDC / WETH) |
|---|---|---|---|---|
| treasury (SirKit) | SirKit | `0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2` |  |  |
| deployer (mister-anderson) | mister-anderson | `0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73` |  |  |
| korg | korg | `0xAa6F74eBb7cd5F04c49a6a1306bD98B6fAEDABDE` |  |  |
| fee | fee (agent-smith) | `0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538` |  |  |
| fi | fi (agent-smith) | `0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2` |  |  |
| fo | fo (agent-smith) | `0x8689a407A2488A5b2f2De05d2C6978a798f93D56` |  |  |
| fum | fum (agent-smith) | `0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2` |  |  |

## Miniapp and live demo

| Item | Value |
|---|---|
| Source | `miniapp/fee-fi-fo-fum.html` |
| Published URL |  |
| Validation score |  |
| Castle service URL (durable) |  |
| Stream URL |  |

## Documentation

| Doc | Owner | Status |
|---|---|---|
| README.md (pitch, before/after, addresses) | impecc (voice) + korg (technical) | draft by SirKit (00d5ccf) |
| docs/PLAN.md | handoff-advisor | done (research 3cb55b7; identifier rename 4d5afc0) |
| docs/NAMING.md | SirKit, per operator | done (c0f0241) |
| docs/ens-probes.md | korg | todo |
| docs/1inch.md, docs/uniswap.md, docs/ens.md | korg | todo |
| FEEDBACK.md | korg | todo |
| docs/video-script.md + deck | impecc | todo |
| AI_USAGE.md | SirKit | in progress |
| miniapp/STREAM.md | impecc | done (6a50934) |

## Demo evidence

| Step | Tx / link | Verified by |
|---|---|---|
| (a) gap after kill -9: old fill winds down |  |  |
| (b) after fi's claim: old-epoch fill reverts FeeFiFoFum() |  |  |
| (c) new-epoch fill passes |  |  |
| (d) restarted fee rejected on-chain |  |  |
| (5) kill everyone: dissolve(), CCA clears, price to ENS |  |  |

## Operator-owned contributions

ETHGlobal may exclude entries that rely entirely on AI. The operator's own decisions and work are listed here and mirrored in AI_USAGE.md.

| Time (JST) | Contribution |
|---|---|
| Sat 13:20 | Chose Option A from handoff-advisor's research; appointed SirKit orchestrator and picked the swarm |
| Sat 13:25 | Ruled that nothing for the entry goes in the handoff repo; all work lives in feefifofum |
| Sat 13:40 | Renamed the entry fee-fi-fo-fum, with Jack the Giant Killer overtones for forward-facing copy |

## Log

| Time (JST) | Who | What |
|---|---|---|
| Sat 13:20 | operator | Chose Option A. SirKit is orchestrator. Swarm: agent-smith, mister-anderson, impecc, korg, agy, handoff-advisor, handoff-claude. |
| Sat 13:24 | SirKit | Pushed the README (a09a598) to github.com/34r7h/fee-fi-fo-fum. |
| Sat 13:24 | SirKit | Created handoff project 2af16779 (budget 12 USDC, ethereum-sepolia). |
| Sat 13:25 | handoff-advisor | Confirmed the research is theirs; relayed the operator rule that nothing for the entry goes in the handoff repo. |
| Sat 13:26 | SirKit | Pushed docs/PLAN.md (3cb55b7), byte-identical to the advisor's original. |
| Sat 13:28 | SirKit | Created 7 goals and 28 tasks with parallel ordering. |
| Sat 13:32 | handoff-advisor | Alignment verdict: PASS WITH EDITS (rebalance load, ICastleLease, ENS load-bearing for pre-existing agents, fixes to the state-machine beats, durable demo, ETH budget, AI-eligibility). |
| Sat 13:40 | SirKit | Applied every edit and renamed the product to fee-fi-fo-fum on the board (31 tasks, 13 blockers, 11.35 USDC allocated); 0 old-name mentions on the board. |
| Sat 13:42 | SirKit | Replaced the old-name team with team_d5195308, sent official invites to all 7, set the hierarchy, and sent 6 assignment messages. |
| Sat 13:43 | handoff-advisor | Re-check: PASS. Accepted the verifier role. |
| Sat 13:44 | handoff-claude | Live; accepted the role; claimed p2-rail, p2-ensv2-registry, p2-capabilities, p2-stream and p5-durable. |
| Sat 13:45 | korg / mister-anderson | Both blocked: 0 Sepolia ETH, and no ETHERSCAN_API_KEY. |
| Sat 13:46 | handoff-claude | p2-rail defect report: handoff cannot settle on ethereum-sepolia (the x402 facilitator is Base-only, payouts ignore settlement_network, no WETH rail). Workaround: self-custodied Sepolia EOAs. |
| Sat 13:50 | SirKit | Adopted the self-custodied EOA workaround. Created treasury 0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2 for the operator to fund. Told the swarm to work on an anvil fork until funds land. |
| Sat 13:52 | agent-smith | Created self-custodied Sepolia EOAs for fee, fi, fo and fum (keys 0600, not in git) and claimed all 5 of its tasks. |
| Sat 13:55 | impecc | miniapp/STREAM.md is on main (6a50934); building fee-fi-fo-fum.html against the mock. |
| Sat 13:57 | mister-anderson | Foundry scaffold pinned to swap-vm v1.0.2 (3301492); ICastleLease (980fd97) and MockCastleLease (f0c7d65); p1-iface submitted. |
| Sat 13:58 | handoff-claude | ens_name cannot take an ENSv2 name without a platform change (escalated to the operator). Durable host approved: the existing sandbox host. castle agent approved. |
