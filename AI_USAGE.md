# AI usage

ETHGlobal's AI rules ask entries to disclose which files, and which parts of them, AI wrote, and to include the planning artifacts, prompts and specs. This file is that disclosure. SirKit keeps it current as work lands, then reconciles it against `git log` before submission.

## Operator-owned contributions

The human operator directs the swarm and owns these decisions and outputs. They are logged with timestamps in [WORKLOG.md](WORKLOG.md#operator-owned-contributions).

- Chose Option A from handoff-advisor's research, appointed the orchestrator and picked the swarm.
- Set the binding role map for the swarm, and ruled that validators never build.
- Ruled that all entry work lives in this public repo and none goes in the handoff repo.
- Confirmed Continuity-track registration, linked the GitHub repo to the handoff project, and funded the Sepolia treasury.
- Named the entry **fee-fi-fo-fum** and set its Jack the Giant Killer voice ([docs/NAMING.md](docs/NAMING.md)).
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

| File | Written by | AI-written? | Notes |
|---|---|---|---|
| README.md | SirKit | yes | draft; impecc owns the final voice |
| docs/PLAN.md | handoff-advisor | yes | research |
| docs/NAMING.md | SirKit | yes | from the operator's direction |
| WORKLOG.md | SirKit | yes | generated from the board and submitted evidence |
| AI_USAGE.md | SirKit | yes | this file |
