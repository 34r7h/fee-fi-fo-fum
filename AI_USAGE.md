# AI usage

ETHGlobal's AI rules ask entries to disclose which files, and which parts of them, AI wrote, and to include the planning artifacts, prompts and specs. This file is that disclosure. SirKit keeps it current as work lands, then reconciles it against `git log` before submission.

## Operator-owned contributions

The human operator directs the swarm and owns these decisions and outputs. They are logged with timestamps in [WORKLOG.md](WORKLOG.md#operator-owned-contributions).

- Chose Option A from handoff-advisor's research, appointed the orchestrator and picked the swarm.
- Set the binding role map for the swarm, and ruled that validators never build.
- Ruled that all entry work lives in this public repo and none goes in the handoff repo.
- Confirmed Continuity-track registration, linked the GitHub repo to the handoff project, and funded the Sepolia treasury (ETH, including PoW-faucet mining, and Circle USDC).
- Named the entry **fee-fi-fo-fum** and set its Jack the Giant Killer voice ([docs/NAMING.md](docs/NAMING.md)).
- Approved the XMBL_GATE=skip deploys of the handoff.lol platform fixes, and set the standing rule not to hold up progress.
- Set the cost rule: Sepolia ETH is real money, so there is exactly one live demo run and every rehearsal runs on a fork. Required that the project description be short and on point.
- Challenged the running cost of on-chain lease renewals, which led to the zero-idle-gas liveness redesign (Castle v3), and approved its redeploy budget.
- Still to come (tracked on the board): review sign-offs, recording and voicing the video, and the sponsor booth conversations.

## Planning artifacts

| Artifact | Author | Notes |
|---|---|---|
| [docs/PLAN.md](docs/PLAN.md) | handoff-advisor (AI agent on handoff) | Research and three options; the operator chose Option A. Identifiers were renamed to fee-fi-fo-fum names; the original is commit `3cb55b7`. |
| handoff project `2af16779` (description, goals, tasks) | SirKit (AI orchestrator), reviewed by handoff-advisor | The spec and task breakdown the swarm works from. |
| [docs/NAMING.md](docs/NAMING.md) | SirKit, at the operator's direction | Name, voice and identifier map. |

## Agents in the swarm

These are AI agents on handoff.lol, directed by the human operator.

| Agent | Role (operator's binding role map) |
|---|---|
| SirKit | Orchestrator: planning, assignment, tracking, AI_USAGE.md, WORKLOG.md |
| agent-smith | Makes the agents: fee, fi, fo, fum and the castle agent (code, service, stream, wallets, ENSv2 names) |
| mister-anderson | Crypto: ICastleLease, router deploy, Castle.sol, FeeFiFoFumExtruction, JackHook, the CCA integration, and all their tests |
| handoff-advisor | Validator: research (PLAN.md), plan review, on-chain verification and co-signing payouts |
| agy | Validator: runs the suites, checks on-chain outcomes, the live CCA run as the outside Jack, rehearsals (no building) |
| impecc | Presentation and miniapps: fee-fi-fo-fum.html, the deck, the video script, forward-facing copy |
| handoff-claude | Fixes handoff properly: platform fixes on handoff.lol (ENSv2 ens_name, ethereum-sepolia settlement) |
| korg | Researcher: ENSv2 probes, write-ups, FEEDBACK.md |

## Files

Commit identity: this repo's commits authored `34r7h` come from two sources. The 95 with `i34r7h@gmail.com` are **SirKit** (AI orchestrator) using the operator's local git identity: WORKLOG.md, AI_USAGE.md, docs/NAMING.md, docs/PLAN.md (handoff-advisor's research, committed by SirKit) and README drafts. PRODUCT.md and .impeccable/surfaces/ also landed in a SirKit commit, but impecc wrote them. The 49 with `2566560+34r7h@users.noreply.github.com` are empty `task: … submitted for review / verified` commits (0 files changed) from handoff.lol's GitHub task sync, not a person or an agent. Every other agent commits under its own name.

| Path | Written by (per `git log`) | AI-written? | Notes |
|---|---|---|---|
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
| private handoff repo: 95932ef, 0115146, 105f1dd, 3cfdb3f, 0495862 | handoff-claude | yes | new work after baseline 079f8f0 that the entry depends on (ENSv2 ens_name, Sepolia settlement, wallet proof of possession, payout dedupe); listed in README 'Pre-existing and new' |

## Prompts and specs

The swarm worked from the handoff project spec (project `2af16779`: description, 7 goals, 35 task definitions of done), docs/PLAN.md and docs/NAMING.md. Agents coordinated through signed handoff messages; the task results and verification reasons on the board record what each agent was asked for and what it delivered.
