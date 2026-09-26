# fee-fi-fo-fum

A DeFi swarm on [handoff.lol](https://handoff.lol): four agents (**fee**, **fi**, **fo** and **fum**) and one miniapp for humans, built on **1inch Aqua/SwapVM**, **Uniswap CCA** and **ENSv2**. Everything on-chain runs on **Ethereum Sepolia**.

Entry for ETHGlobal Tokyo 2026 (Continuity track). The existing project is **handoff**, with baseline commit `079f8f0`. This repo holds the new work from the hackathon weekend.

## BATON: fenced liquidity handoffs for a follow-the-sun agent desk

Agents crash, and a dead agent can't send the transaction that cancels its quotes. BATON keeps an agent desk's liquidity **live only while its operator holds an ENS lease**. The book passes from agent to agent (Tokyo → London → New York) with no gap and no zombie fills. If nobody picks the book up, a **Uniswap CCA** auctions it off fairly instead of dumping it.

```
(1) ENSv2 lease on desk.feefifofum.eth
      The holder renews it with fo's attestation. After expiry anyone may claim it.
      The regenerated token id is the fencing epoch.
      linkToNode points desk.* at the current shift.
        │  read at fill time, directly from the registry
        ▼
(2) 1inch Aqua + SwapVM 1.0.2. The maker is Baton.sol, which is also the desk treasury.
      Program = FenceExtruction → XYCConcentrateGrowLiquidity2D → FlatFeeIn
        live and same epoch → fill
        expired             → wind down (reduce-only, wide spread)
        epoch changed       → revert FENCED
        │  on a shift change, or when nobody claims the book
        ▼
(3) Uniswap CCA is the exit, not the entrance
      CrewHook gates bidders to handoff's ENSv2 agent registry.
      The clearingPrice is written back to ENS with setData,
      and the next shift's curve is centred on it.
        └────────► back to (1)
```

## The swarm

| Agent | Role |
|---|---|
| **fee** | Shift trader. Holds the baton, renews the lease, and ships and re-ships strategies through Baton. |
| **fi** | Hot standby and next shift. Watches fee's heartbeats. On expiry it claims, docks stale strategies, relinks `desk` and re-ships. |
| **fo** | Fencer and witness. Signs the quote-sanity attestation that every renewal needs, replays fills against the lease timeline, and publishes incident reports. |
| **fum** | Auctioneer. Runs the shift-change and dissolution CCAs, and writes the clearing price back to ENS. |

## Layout

| Path | Contents |
|---|---|
| `contracts/` | Foundry: Baton.sol, FenceExtruction.sol, CrewHook.sol, and tests on a Sepolia fork |
| `agents/` | fee, fi, fo and fum: handoff agents with viem clients on Ethereum Sepolia |
| `miniapp/` | `baton.html`: a world-clock ring of shifts, the lease countdown, the fence state and a live CCA chart |
| `docs/` | The plan, the sponsor write-ups, FEEDBACK.md and AI_USAGE.md |
| `WORKLOG.md` | A running record of what was built, by whom, and where it lives on-chain |

## Status

Work in progress. See [WORKLOG.md](WORKLOG.md).
