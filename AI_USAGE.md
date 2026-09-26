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
- Still to come (tracked on the board): the gas approval for the live run, recording and voicing the video, the ETHGlobal and Uniswap feedback forms, and the sponsor booth conversations.

## Planning artifacts

| Artifact | Author | Notes |
|---|---|---|
| [docs/PIVOT.md](docs/PIVOT.md) | agy (AI agent on handoff), at the operator's direction | The architecture brief for this product, kept verbatim. |
| [docs/SPEC.md](docs/SPEC.md) | SirKit (AI orchestrator) | The locked build scope, merged from PIVOT.md and korg's research, and reviewed by agy. |
| [docs/research.md](docs/research.md) | korg (AI researcher) | The feasibility gates, each reproducible (fork probe `contracts/probes/quote-register/`). |
| handoff project `de902056` (description, 7 goals, 18 task definitions of done) | SirKit | The task breakdown the swarm works from. |
| [miniapp/STREAM.md](miniapp/STREAM.md) | impecc | The event schema the service and the miniapp share. |
| [docs/NAMING.md](docs/NAMING.md) | SirKit, at the operator's direction | Name, voice and identifier map. |
| The lease edition's plan: [docs/PLAN.md](docs/PLAN.md) and handoff project `2af16779` | handoff-advisor (research); SirKit (project) | Retired with that product; kept for the record. |

## Agents in the swarm

These are AI agents on handoff.lol, directed by the human operator.

| Agent | Role (operator's binding role map) |
|---|---|
| SirKit | Orchestrator: the spec, planning, assignment, tracking, AI_USAGE.md, WORKLOG.md |
| agy | Architecture brief (PIVOT.md); validator: spec review, fork end-to-end runs, the outside Jack in the live run, live verification (no building) |
| mister-anderson | Contracts: CastleVault, PriceExtruction, CastleJITHook, OffchainQuoteResolver, their tests and the deploy |
| agent-smith | Agents: fee, fi, fo, fum and the castle service (CCIP-Read gateway, MCP tools, stream) |
| impecc | Presentation: the miniapp, the deck, the video script, forward-facing copy |
| handoff-claude | handoff.lol platform support (CORS, hosting, Sepolia payouts) |
| korg | Research and write-ups: research.md, the sponsor docs, FEEDBACK.md |
| handoff-advisor | Lease edition only: research (PLAN.md) and validation. Not part of this product. |

## Files

Commit identity: this repo's commits authored `34r7h` come from two sources. The 95 with `i34r7h@gmail.com` are **SirKit** (AI orchestrator) using the operator's local git identity: WORKLOG.md, AI_USAGE.md, docs/NAMING.md, docs/PLAN.md (handoff-advisor's research, committed by SirKit) and README drafts. PRODUCT.md and .impeccable/surfaces/ also landed in a SirKit commit, but impecc wrote them. The 49 with `2566560+34r7h@users.noreply.github.com` are empty `task: … submitted for review / verified` commits (0 files changed) from handoff.lol's GitHub task sync, not a person or an agent. Every other agent commits under its own name.

| Path | Written by (per `git log`) | AI-written? | Notes |
|---|---|---|---|
| docs/SPEC.md | SirKit | yes | the locked build scope |
| docs/PIVOT.md | agy (committed by SirKit) | yes | the architecture brief, verbatim |
| docs/research.md, contracts/probes/quote-register/ | korg | yes | research gates and the fork probe |
| contracts/src/CastleVault.sol, PriceExtruction.sol, CastleJITHook.sol, OffchainQuoteResolver.sol and their tests | mister-anderson | yes | this product's contracts (in progress) |
| service/src/gateway.mjs, service/src/quote.mjs | agent-smith | yes | the CCIP-Read gateway and quote builder (in progress) |
| README.md | SirKit, korg, impecc | yes | pitch and loop (SirKit), trust assumptions and technical sections (korg), Live section and voice (impecc) |
| docs/PLAN.md | handoff-advisor | yes | research; the operator chose Option A |
| docs/NAMING.md | SirKit | yes | from the operator's direction |
| WORKLOG.md | SirKit | yes | generated from the handoff board, submitted evidence and live chain reads |
| AI_USAGE.md | SirKit | yes | this file |
| contracts/src/, contracts/script/, contracts/out-abi/, contracts/broadcast/, foundry config | mister-anderson | yes | Castle, FeeFiFoFumExtruction, JackHook, deploy scripts, exported ABIs |
| contracts/test/ | mister-anderson, agy | yes | unit and Sepolia-fork tests; agy wrote FoAttestation.t.sol (6376485) and three fork-test commits (8cc9a7f, 84b369d, 3ccbe78), all before the validator-only ruling |
| contracts/deployments/ | mister-anderson, handoff-claude, agent-smith | yes | addresses, txs and constructor args for contracts, the ENS registry and the agent names |
| contracts/scripts/ (ENS) | handoff-claude, then agent-smith | yes | ENSv2 agent-registry scripts |
| contracts/probes/, docs/ens-probes.md, docs/ens.md, docs/1inch.md, docs/uniswap.md, FEEDBACK.md | korg | yes | ENSv2 probes, sponsor write-ups, builder feedback |
| docs/cca-auction.md | mister-anderson | yes | the live CCA run and its parameters |
| agents/ | agent-smith; agy (one commit) | yes | fee, fi, fo, fum: roles, shift library, scripts, tests. agy's commit 6376485 wrote fo's first version (roles/fo.mjs, lib/attest, fo-policy, incidents, lease and replay .mjs, test/fo.test.mjs; 495 lines) before the validator-only ruling. agent-smith owns and maintains it since |
| service/ | handoff-claude (scaffold), then agent-smith | yes | the castle service: MCP tools, SSE stream, indexer |
| miniapp/ | impecc | yes | fee-fi-fo-fum.html, build.mjs, config.json, STREAM.md |
| docs/video-script.md, DESIGN.md, PRODUCT.md, .impeccable/ | impecc | yes | video script and shot list, design system, product brief |
| Deck (claude.ai artifact) | impecc | yes | 12 slides; shared by the operator |
| contracts/lib/ (aqua, swap-vm v1.0.2, solidity-utils, openzeppelin-contracts, forge-std), .gitmodules, contracts/foundry.lock, contracts/.gitignore | third-party, pinned by mister-anderson | no | git submodules at pinned commits; not written in this entry |
| private handoff repo: 95932ef, 0115146, 105f1dd, 3cfdb3f, 0495862 | handoff-claude | yes | authored `34r7h` there too (the operator's git identity), but written by handoff-claude; new work after baseline 079f8f0 that the entry depends on (ENSv2 ens_name, Sepolia settlement, wallet proof of possession, payout dedupe); listed in README 'Pre-existing and new' |

## Prompts and specs

The swarm worked from the handoff project spec (project `2af16779`: description, 7 goals, 35 task definitions of done), docs/PLAN.md and docs/NAMING.md. Agents coordinated through signed handoff messages; the task results and verification reasons on the board record what each agent was asked for and what it delivered.
