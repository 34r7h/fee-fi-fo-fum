# AI usage

ETHGlobal's AI rules ask entries to disclose which files, and which parts of them, AI wrote, and to include the planning artifacts, prompts and specs. This file is that disclosure. SirKit keeps it current as work lands, then reconciles it against `git log` before submission.

## Operator-owned contributions

The human operator directs the swarm and owns these decisions and outputs. They are logged with timestamps in [WORKLOG.md](WORKLOG.md#operator-owned-contributions).

- Retired the first product (the lease edition, now at tag `lease-edition`) and pivoted the entry to agy's architecture: one Aqua balance backing many quotes, ENS CCIP-Read quote discovery, and Uniswap v4 JIT fills. Kept the Castle Tapestry design and motif, cleared the other agents' memory, and asked for a new handoff project with tasks oriented to the best agent for each.
- Set the binding role map for the swarm, and ruled that validators never build.
- Ruled that all entry work lives in this public repo and none goes in the handoff repo.
- Confirmed Continuity-track registration, linked the GitHub repo to handoff, and funded the Sepolia treasury (ETH, including PoW-faucet mining, and Circle USDC).
- Named the entry **fee-fi-fo-fum** and set its Jack the Giant Killer voice ([docs/NAMING.md](docs/NAMING.md)).
- Approved the XMBL_GATE=skip deploys of the handoff.lol platform fixes, and set the standing rule not to hold up progress.
- Set the cost rule: Sepolia ETH is real money, so there is exactly one live run and every rehearsal runs on a fork. Required that the project description be short and on point.
- Approved a 0.02 ETH gas ceiling for the one live deploy and live run, and asked that the total budget be watched.
- Ruled that the main miniapp is the product's web3 interface, where users trade with the castle from their own wallet as live Sepolia txs, because the demo must be live and prove the work on-chain. The storybook retelling became a second miniapp ([docs/SPEC.md](docs/SPEC.md#the-miniapps)).
- Still to come (tracked on the board): recording and voicing the video, the ETHGlobal and Uniswap feedback forms, and the sponsor booth conversations.

## Planning artifacts

| Artifact | Author | Notes |
|---|---|---|
| [docs/PIVOT.md](docs/PIVOT.md) | agy (AI agent on handoff), at the operator's direction | The architecture brief for this product, kept verbatim. |
| [docs/SPEC.md](docs/SPEC.md) | SirKit (AI orchestrator) | The locked build scope, merged from PIVOT.md and korg's research, and reviewed by agy. |
| [docs/research.md](docs/research.md) | korg (AI researcher) | The feasibility gates, each reproducible (fork probe `contracts/probes/quote-register/`). |
| handoff project `de902056` (description, 7 goals, 18 task definitions of done) | SirKit | The task breakdown the swarm works from. |
| [miniapp/STREAM.md](miniapp/STREAM.md) | impecc | The event schema the service and the miniapp share. |
| [docs/NAMING.md](docs/NAMING.md) | SirKit, at the operator's direction | Name, voice and identifier map. |
| The lease edition's plan: [docs/PLAN.md](https://github.com/34r7h/fee-fi-fo-fum/blob/lease-edition/docs/PLAN.md) and handoff project `2af16779` (at tag `lease-edition`) | handoff-advisor (research); SirKit (project) | Retired with that product; kept for the record. |

## Agents in the swarm

These are AI agents on handoff.lol, directed by the human operator.

| Agent | Role (operator's binding role map) |
|---|---|
| SirKit | Orchestrator: the spec, planning, assignment, tracking, AI_USAGE.md, WORKLOG.md |
| agy | Architecture brief (PIVOT.md); validator: spec review, fork end-to-end runs, the outside Jack in the live run, live verification (no building) |
| mister-anderson | Contracts: CastleVault, PriceExtruction, CastleJITHook, OffchainQuoteResolver, their tests and the deploy; then the README and sponsor write-ups (taken over from korg) |
| agent-smith | Agents: fee, fi, fo, fum and the castle service (CCIP-Read gateway, MCP tools, stream) |
| impecc | Presentation: the miniapp, the deck, the video script, forward-facing copy |
| handoff-claude | handoff.lol platform support (CORS, hosting, Sepolia payouts) |
| korg | Research: research.md and the quote-register probe; the write-up skeletons and contract-level fork passes, until going offline on Sat 26 Sep |
| handoff-advisor | Lease edition only: research (PLAN.md) and validation. Not part of this product. |

## Files

This table covers the tree on `main`, product by product. The lease edition's files, and its own AI_USAGE.md, are at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition). "Lines" counts the lines each author still has in the tree (`git blame`, excluding JSON records and lockfiles).

**Commit identity.** Commits authored `34r7h <i34r7h@gmail.com>` (150) come from the operator's local git identity, and every one of them is an AI agent's:
- **SirKit** (AI orchestrator) wrote WORKLOG.md, AI_USAGE.md, docs/SPEC.md, docs/NAMING.md and .gitignore, and committed docs/PIVOT.md, which is agy's text verbatim.
- One of those commits is **agy**'s: `dbb243d`, the v-e2e fork records under docs/e2e/.
- Some lease-edition-era SirKit commits carried other agents' files: PRODUCT.md and .impeccable/surfaces/ (impecc) and early README drafts.

The 72 commits by `2566560+34r7h@users.noreply.github.com` are empty `task: …` commits (0 files changed) from handoff.lol's GitHub task sync; no person or agent wrote them. Every other agent commits under its own name.

| Path | Written by (lines in the tree) | AI-written? | Notes |
|---|---|---|---|
| contracts/src/ | mister-anderson (832) | yes | CastleVault, PriceExtruction, CastleJITHook, OffchainQuoteResolver, IENSv2 |
| contracts/test/ | mister-anderson (1912), korg (195) | yes | unit, invariant and Sepolia-fork tests; korg's SpecDemoFork contract-level passes |
| contracts/script/, contracts/broadcast/, contracts/deployments/, contracts/out-abi/, foundry config | mister-anderson | yes | DeployHoard, the live broadcast record, sepolia.json (the lease edition under `leaseEdition`), ABIs |
| contracts/scripts/ (ENS agent registry) | handoff-claude (293), agent-smith (27) | yes | the agents' ENSv2 names, carried over from the lease edition |
| contracts/probes/ | korg (238) | yes | the quote-register and UniversalResolverV2 fork probe |
| service/ | agent-smith (1316), mister-anderson (650), handoff-claude (499) | yes | the castle service: the ERC-3668 gateway, stream v2, MCP tools (agent-smith); lib/ccip-sign.mjs and its tests (mister-anderson); the original scaffold and host deploy notes (handoff-claude) |
| agents/ | agent-smith (1919), agy (15) | yes | fee, fi, fo, fum, crew-fork.sh, jack.mjs, the fork-run and live-run records. agy's 15 lines are a surviving part of roles/fo.mjs from a lease-edition commit (6376485) |
| miniapp/ | impecc (1467) | yes | fee-fi-fo-fum.html, build.mjs, config.json, STREAM.md |
| docs/SPEC.md, docs/NAMING.md | SirKit | yes | the locked build scope; voice and identifier map |
| docs/PIVOT.md | agy (committed by SirKit) | yes | the architecture brief, verbatim |
| docs/research.md | korg | yes | the research gates |
| docs/e2e/ | korg (contract-level passes), agy (pass1 and pass2 records, `dbb243d`) | yes | v-e2e evidence |
| docs/1inch.md, docs/uniswap.md, docs/ens.md, FEEDBACK.md | mister-anderson, from korg's skeletons | yes | sponsor write-ups and Uniswap builder feedback |
| README.md | mister-anderson (56), korg (51), impecc (32), SirKit (14) | yes | technical sections and live links (mister-anderson); skeleton and layout (korg); opening, Live section and voice (impecc) |
| docs/video-script.md, PRODUCT.md, DESIGN.md, .impeccable/ | impecc | yes | video script, product brief, design system |
| Deck (claude.ai artifact) | impecc | yes | 10 slides; the operator shares it |
| WORKLOG.md, AI_USAGE.md | SirKit | yes | generated from the handoff board, submitted evidence and live chain reads |
| contracts/lib/ (aqua, swap-vm 1.0.2, v4-core 4.0.0, solidity-utils, openzeppelin-contracts, forge-std), .gitmodules | third-party, pinned by mister-anderson (and korg for one submodule entry) | no | git submodules at pinned commits; not written in this entry |
| private handoff repo: 95932ef, 0115146, 105f1dd, 3cfdb3f, 0495862 | handoff-claude | yes | authored `34r7h` there (the operator's git identity) but written by handoff-claude; new work after baseline 079f8f0 that the entry depends on (ENSv2 ens_name, Sepolia settlement, wallet proof of possession, payout dedupe); listed in README 'Pre-existing and new' |

## Prompts and specs

The swarm worked from:
- docs/PIVOT.md (agy's brief);
- docs/SPEC.md (the locked scope);
- docs/research.md;
- the handoff project `de902056`: its description, 7 goals and 18 task definitions of done.

Agents coordinated through signed handoff messages. The task results and verification reasons on the board record what each agent was asked for and what it delivered. SirKit verified every live tx on-chain before it verified the task that claimed it.
