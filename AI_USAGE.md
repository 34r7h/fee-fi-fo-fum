# AI usage

ETHGlobal's AI rules ask each entry to disclose which files AI wrote, and which parts of them, and to include the planning artifacts, prompts and specs. This file is that disclosure. SirKit kept it current as work landed and reconciled it against `git log`, `git blame` and the chain on 26 September 2026 at 20:30 UTC, before submission.

## Operator-owned contributions

The human operator directed the swarm and owns the decisions and outputs below. Each is logged with its time in [WORKLOG.md](WORKLOG.md#operator-owned-contributions).

- Retired the first product (the lease edition, now at tag `lease-edition`) and pivoted the entry to agy's architecture: one Aqua balance backing many quotes, ENS CCIP-Read quote discovery, and Uniswap v4 fills from the vault. Kept the Castle Tapestry visual design, cleared the other agents' memory, and asked for a new handoff project with each task given to the agent best suited to it.
- Set the binding role map for the swarm, and ruled that validators never build.
- Ruled that all entry work lives in this public repo and none goes in the handoff repo.
- Confirmed the Continuity-track registration, linked the GitHub repo to handoff, and funded the Sepolia treasury with ETH (including PoW-faucet mining) and Circle USDC.
- Named the entry feefifofum. The storybook voice first set for its copy was later replaced by a plain-writing rule ([docs/NAMING.md](docs/NAMING.md)).
- Approved the XMBL_GATE=skip deploys of the handoff.lol platform fixes, and set the standing rule not to hold up progress.
- Set the cost rule that Sepolia ETH is treated as real money, so there is exactly one live run and every rehearsal runs on a fork, and required a short, specific project description.
- Approved a 0.02 ETH gas ceiling for the live deploy and the live run and asked that the total budget be watched, then asked later for the agents and the operator's own wallet to be funded for four live demos, which took the spend past that ceiling.
- Ruled that the main miniapp is the product's web3 interface, where users trade with the vault from their own wallet in live Sepolia transactions, because the demo must be live and prove the work on-chain. The storybook retelling became a second miniapp ([docs/SPEC.md](docs/SPEC.md#the-miniapps)).
- Ruled that no AI-style prose (slogans, fragments, metaphors standing in for mechanics) may appear anywhere a person might read, and rejected the first draft of the ETHGlobal form text on those grounds.
- Chose the prizes (Continuity, the finalist pool, and the ENS, Uniswap Foundation and 1inch partner prizes) and the grants and incubator interest on the ETHGlobal form, and asked for the handoff and xmbl logos on the cover image.
- Asked for the demo video as a 3–4 minute screencast of the dapp with a voiceover and captions, re-recorded from scratch whenever a problem showed up, and asked that it show the handoff project and its agents.
- Submitted the Uniswap developer feedback form with the link to FEEDBACK.md.
- Still to do: recording the final voiceover and uploading the video, the ETHGlobal submission itself, and the sponsor booth conversations.

## Planning artifacts

| Artifact | Author | Notes |
|---|---|---|
| [docs/PIVOT.md](docs/PIVOT.md) | agy (AI agent on handoff), at the operator's direction | The architecture brief for this product, kept verbatim. |
| [docs/SPEC.md](docs/SPEC.md) | SirKit (AI orchestrator) | The locked build scope, merged from PIVOT.md and korg's research and reviewed by agy. |
| [docs/research.md](docs/research.md) | korg (AI researcher) | The feasibility gates, each reproducible with the fork probe in `contracts/probes/quote-register/`. |
| handoff project `de902056` (description, 7 goals, 22 tasks with definitions of done) | SirKit | The task breakdown the swarm worked from. |
| [miniapp/STREAM.md](miniapp/STREAM.md) | impecc and agent-smith | The event schema the service and the miniapps share. |
| [docs/NAMING.md](docs/NAMING.md) | SirKit, at the operator's direction | The writing rule and the map of names and identifiers. |
| The lease edition's plan: [docs/PLAN.md](https://github.com/34r7h/fee-fi-fo-fum/blob/lease-edition/docs/PLAN.md) and handoff project `2af16779` (at tag `lease-edition`) | handoff-advisor (research) and SirKit (project) | Retired with that product and kept for the record. |

## Agents in the swarm

These are AI agents on handoff.lol, directed by the human operator.

| Agent | Role (from the operator's binding role map) |
|---|---|
| SirKit | Orchestrator: the spec, planning, assignment, tracking, verification of every task, AI_USAGE.md and WORKLOG.md. SirKit also filled in the ETHGlobal form with the operator, made the cover image, and recorded the demo video. |
| agy | The architecture brief (PIVOT.md), then validation: the spec review, the fork end-to-end runs, the outside solver in the live run, the on-chain check of the live run, and the live test of the published dapp. agy does not build. |
| mister-anderson | The contracts (CastleVault, PriceExtruction, CastleJITHook, OffchainQuoteResolver), their tests and the deploy, then the README and the sponsor write-ups, which it took over from korg. |
| agent-smith | The four agents fee, fi, fo and fum, the castle service (CCIP-Read gateway, MCP tools and event stream), and the dapp's browser library. |
| impecc | Presentation: the two miniapps, the deck, the video script, PRODUCT.md and DESIGN.md. |
| handoff-claude | handoff.lol platform support (CORS, hosting and Sepolia payouts). |
| korg | Research (research.md and the quote-register probe), the write-up skeletons and the contract-level fork passes, until it went offline on Saturday 26 September. |
| handoff-advisor | Research and validation for the lease edition only. It is not part of this product. |

## Files

This table covers the tree on `main`. The lease edition's files, and its own AI_USAGE.md, are at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition). The line counts are the lines each author still has in the tree according to `git blame`, leaving out JSON records, lockfiles and images.

Commits authored `34r7h <i34r7h@gmail.com>` (172 of them) come from the operator's local git identity, and every one of them was made by an AI agent. Almost all are SirKit's: WORKLOG.md, AI_USAGE.md, docs/SPEC.md, docs/NAMING.md, LICENSE, .gitignore, tools/demo-video/ and the rewrite of docs/e2e/dapp/README.md, plus docs/PIVOT.md, which is agy's text committed verbatim. One is agy's (`dbb243d`, the v-e2e fork records under docs/e2e/), and some lease-edition-era SirKit commits carried other agents' files, namely PRODUCT.md and .impeccable/ (impecc) and early README drafts. The 72 commits by `2566560+34r7h@users.noreply.github.com` are empty `task: …` commits (no files changed) from handoff.lol's GitHub task sync, which no person or agent wrote. Every other agent commits under its own name: agent-smith 71, mister-anderson 57, impecc 51, korg 15, handoff-claude 8 and agy 4.

| Path | Written by (lines in the tree) | AI-written? | Notes |
|---|---|---|---|
| contracts/src/ | mister-anderson (832) | yes | CastleVault, PriceExtruction, CastleJITHook, OffchainQuoteResolver and IENSv2 |
| contracts/test/ | mister-anderson (1912), korg (195) | yes | Unit, invariant and Sepolia-fork tests, including korg's SpecDemoFork contract-level passes |
| contracts/script/, contracts/broadcast/, contracts/deployments/, contracts/out-abi/, foundry config | mister-anderson (182) | yes | DeployHoard, the live broadcast record, sepolia.json (with the lease edition under `leaseEdition`) and the ABIs |
| contracts/scripts/ (ENS agent registry) | handoff-claude (293), agent-smith (27) | yes | The agents' ENSv2 names, carried over from the lease edition |
| contracts/probes/ | korg (238) | yes | The quote-register and UniversalResolverV2 fork probe |
| service/ | agent-smith (1341), mister-anderson (650), handoff-claude (493) | yes | The castle service. agent-smith wrote the ERC-3668 gateway, stream v2 and the MCP tools, mister-anderson wrote lib/ccip-sign.mjs and its tests, and handoff-claude wrote the original scaffold and the host deploy notes. |
| agents/ | agent-smith (2707), agy (15) | yes | fee, fi, fo and fum, crew-fork.sh, jack.mjs, and the fork-run and live-run records. agy's 15 lines are a surviving part of roles/fo.mjs from a lease-edition commit (6376485). |
| miniapp/ | impecc (2311), agent-smith (1047) | yes | impecc wrote fee-fi-fo-fum.html (the dapp), fee-fi-fo-fum-tale.html (the replay), build.mjs, config.json and most of STREAM.md. agent-smith wrote lib/dapplib.js, the dependency-free browser library the dapp inlines, with its tests. |
| docs/SPEC.md, docs/NAMING.md | SirKit (362) | yes | The locked build scope, and the writing rule with the map of names |
| docs/PIVOT.md | agy, committed by SirKit (27) | yes | The architecture brief, verbatim |
| docs/research.md | korg (143) | yes | The research gates |
| docs/e2e/ | korg (contract-level passes), agy (the pass1 and pass2 records in `dbb243d`, and the dapp test's screenshots and txs.json), SirKit (docs/e2e/dapp/README.md) | yes | Evidence from the fork end-to-end runs and the live test of the dapp. SirKit rewrote agy's dapp README in plain prose after agy missed the deadline for fixing it. |
| docs/1inch.md, docs/uniswap.md, docs/ens.md, FEEDBACK.md | mister-anderson (289), korg (73) | yes | The sponsor write-ups and the Uniswap feedback, written by mister-anderson from korg's skeletons |
| README.md | mister-anderson (90), korg (36), SirKit (14), impecc (12) | yes | mister-anderson wrote the technical sections and live links, korg the skeleton and layout, and impecc the opening and the Live section. |
| docs/video-script.md, PRODUCT.md, DESIGN.md, .impeccable/ | impecc | yes | The video's shot list and script, the product brief and the design system |
| tools/demo-video/ | SirKit | yes | The recorder and composer for the demo video, its narration, and the records of the take used |
| The demo video, its captions and the cover image | SirKit | yes | Recorded from the live dapp with a scripted test wallet. The voiceover in SirKit's cut is macOS text-to-speech, which the operator replaces with their own recording. |
| The deck (a claude.ai artifact) | impecc | yes | 10 slides, which the operator shares |
| WORKLOG.md, AI_USAGE.md, LICENSE | SirKit | yes | Generated from the handoff board, the submitted evidence and reads of the chain. LICENSE is the MIT text, matching the contracts' SPDX headers. |
| contracts/lib/ (aqua, swap-vm 1.0.2, v4-core 4.0.0, solidity-utils, openzeppelin-contracts, forge-std) and .gitmodules | third parties, pinned by mister-anderson (and by korg for one submodule entry) | no | Git submodules at pinned commits, not written for this entry |
| The private handoff repo: 95932ef, 0115146, 105f1dd, 3cfdb3f and 0495862 | handoff-claude | yes | Authored `34r7h` there (the operator's git identity) but written by handoff-claude. This is new work after baseline 079f8f0 that the entry depends on (ENSv2 names, Sepolia settlement, wallet proof of possession and payout dedupe), and it is listed in the README's "Pre-existing and new" section. |

## Prompts and specs

The swarm worked from docs/PIVOT.md (agy's brief), docs/SPEC.md (the locked scope), docs/research.md, and the handoff project `de902056` with its description, 7 goals and 22 tasks with definitions of done.

The agents coordinated through signed handoff messages, and the task results and verification reasons on the board record what each agent was asked for and what it delivered. SirKit checked every live transaction on-chain before it verified the task that claimed it. At this reconcile, 20 of the 22 tasks are verified. The two left are this reconcile (s-ai) and the operator's submission (s-submit).
