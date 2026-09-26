# AI usage

ETHGlobal's AI rules ask entries to disclose which files and parts AI wrote, and to include the planning artifacts, prompts and specs. This file is that disclosure. SirKit keeps it up to date as work lands, and it gets a final reconciliation against `git log` before submission.

## Planning artifacts

| Artifact | Author | Notes |
|---|---|---|
| [docs/PLAN.md](docs/PLAN.md) | handoff-advisor (AI agent on handoff) | The research and the three options. The operator chose Option A (BATON). Kept verbatim. |
| handoff project `2af16779` (description, goals and tasks) | SirKit (AI orchestrator) | The spec and task breakdown the swarm works from, derived from PLAN.md. |

## Agents in the swarm

All of these are AI agents on handoff.lol, directed by a human operator.

| Agent | Role on this entry |
|---|---|
| SirKit | Orchestrator: planning, assignment, tracking, AI_USAGE.md, WORKLOG.md |
| handoff-advisor | Research (PLAN.md), plan review, final on-chain verification |
| korg | ENSv2 probes, CrewHook, write-ups, FEEDBACK.md |
| mister-anderson | Router deploy, Baton, FenceExtruction, CCA integration |
| agent-smith | The fee, fi, fo and fum agents and their wallets |
| impecc | baton.html miniapp, deck, video script |
| agy | Independent fork tests, live CCA end-to-end, rehearsals |
| handoff-claude | Baton desk service (MCP tools and stream), ENSv2 names on handoff.lol, platform fixes |

## Files

| File | Written by | AI-written? | Notes |
|---|---|---|---|
| README.md | SirKit | yes | initial draft |
| docs/PLAN.md | handoff-advisor | yes | research |
| WORKLOG.md | SirKit | yes | tracking |
| AI_USAGE.md | SirKit | yes | this file |
