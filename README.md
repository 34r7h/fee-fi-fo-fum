# fee-fi-fo-fum

**The giant never sleeps.**

A dead agent can't send the transaction that cancels its quotes. To every Jack watching the market, a crashed market-making agent is a sleeping giant with its gold left out. **fee-fi-fo-fum** is the giant that wakes up. Its liquidity is live only while its operator holds an ENS lease. The moment the lease lapses, the giant smells the intruder, and stale fills die on-chain with no transaction from the agent that fell. When no one takes the castle, the hoard isn't looted: it goes to a fair Uniswap auction, and any Jack with a name can climb up and bid.

It is a DeFi swarm on [handoff.lol](https://handoff.lol): four agents (**fee**, **fi**, **fo** and **fum**) and one miniapp for humans. It is built on **1inch Aqua/SwapVM**, **Uniswap CCA** and **ENSv2**, and everything on-chain runs on **Ethereum Sepolia**.

It is an ETHGlobal Tokyo 2026 entry in the Continuity track. The existing project is **handoff** (baseline `079f8f0`); this repo is the new work.

## The loop

```
(1) ENSv2 lease: castle.feefifofum.eth
      The holder renews it with fo's attestation. After expiry anyone may claim it,
      and the regenerated token id becomes the fencing epoch.
      linkToNode points castle.* at the current shift.
        │  read at fill time, directly from the registry
        ▼
(2) 1inch Aqua + SwapVM 1.0.2. The maker is Castle.sol (the giant's castle and its hoard).
      Program = FeeFiFoFumExtruction → XYCConcentrateGrowLiquidity2D → FlatFeeIn
        live and same epoch → fill
        expired             → wind down (reduce-only, wide spread)
        epoch changed       → revert FeeFiFoFum()   (the giant smells a stale shift)
        │  shift change, or nobody claims the castle
        ▼
(3) Uniswap CCA is the exit, not the entrance
      JackHook: any agent with a name in handoff's ENSv2 registry may bid,
      and the incoming giant gets no privilege.
      clearingPrice goes back to ENS (setData), and the next shift centres its curve on it.
        └────────► back to (1)
```

## The four syllables

| Agent | Role |
|---|---|
| **fee** | Shift trader. Holds the castle, renews the lease, ships and re-ships the book. |
| **fi** | Hot standby. Wakes when fee falls, claims the castle, relinks it, and re-ships at a new epoch. |
| **fo** | Fencer and witness. Signs or withholds the attestation every renewal needs, replays fills, and reports incidents. |
| **fum** | Auctioneer. Runs the shift-change and dissolution CCAs, and writes the clearing price back to ENS. |

## Layout

| Path | Contents |
|---|---|
| `contracts/` | Foundry: Castle.sol, FeeFiFoFumExtruction.sol, JackHook.sol, and Sepolia-fork tests |
| `agents/` | fee, fi, fo and fum: handoff agents with viem on Ethereum Sepolia |
| `service/` | The castle service: MCP tools and the live stream |
| `miniapp/` | `fee-fi-fo-fum.html`: a world-clock ring of shifts, the lease countdown, the fence state, and a live CCA chart |
| `docs/` | The plan, naming, sponsor write-ups, FEEDBACK.md and AI_USAGE.md |
| `WORKLOG.md` | A running record of what was built, by whom, and where it lives on-chain |

## Status

Work in progress. See [WORKLOG.md](WORKLOG.md).
