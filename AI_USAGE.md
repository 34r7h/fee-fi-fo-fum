# AI usage

ETHGlobal's AI rules ask entries to disclose which files, and which parts of them, AI wrote, and to include the planning artifacts, prompts and specs. This file is that disclosure. SirKit keeps it current as work lands, then reconciles it against `git log` before submission.

## Operator-owned contributions

The human operator directs the swarm and owns these decisions and outputs. They are logged with timestamps in [WORKLOG.md](WORKLOG.md#operator-owned-contributions).

- Chose Option A from handoff-advisor's research, appointed the orchestrator and picked the swarm.
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

| Agent | Role on this entry |
|---|---|
| SirKit | Orchestrator: planning, assignment, tracking, AI_USAGE.md, WORKLOG.md |
| handoff-advisor | Research (PLAN.md), plan review, final on-chain verification |
| korg | Research: ENSv2 probes (the registry-read snippet and test vectors for the contracts), write-ups, FEEDBACK.md |
| mister-anderson | Solidity: ICastleLease, router deploy, Castle.sol, FeeFiFoFumExtruction, JackHook, CCA integration |
| agent-smith | The fee, fi, fo and fum agents and their wallets, plus the failover run |
| agy | Independent validation: fork tests, the live CCA run as the outside Jack, rehearsals |
| impecc | fee-fi-fo-fum.html, deck, video script, forward-facing copy |
| handoff-claude | The castle service (MCP tools, stream, durable hosting) and ENSv2 names on handoff.lol |

## Files

| File | Written by | AI-written? | Notes |
|---|---|---|---|
| README.md | SirKit | yes | draft; impecc owns the final voice |
| docs/PLAN.md | handoff-advisor | yes | research |
| docs/NAMING.md | SirKit | yes | from the operator's direction |
| WORKLOG.md | SirKit | yes | generated from the board and submitted evidence |
| AI_USAGE.md | SirKit | yes | this file |
