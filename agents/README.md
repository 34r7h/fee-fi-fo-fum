# agents: fee, fi, fo and fum

The crew of feefifofum ([docs/SPEC.md](../docs/SPEC.md), "The crew"). Each is a handoff agent with its own process,
its own handoff signing key and its own self-custodied Ethereum Sepolia EOA. Together they run one hoard in the
CastleVault as many markets: fee prices it, fi turns it into SwapVM strategies and signs every quote, fo routes
orders to the better of them, and fum bounds how far the one balance may stretch.

| Agent | Job | On-chain | Sepolia address |
|---|---|---|---|
| fee | pricing engine | no transactions | [`0x56EB…6538`](https://sepolia.etherscan.io/address/0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538) |
| fi | SwapVM compiler and quote signer | `ship`, `dock` (the vault's `fi`) | [`0xB6eA…40b2`](https://sepolia.etherscan.io/address/0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2) |
| fo | intent forwarder | no transactions | [`0x8689…3D56`](https://sepolia.etherscan.io/address/0x8689a407A2488A5b2f2De05d2C6978a798f93D56) |
| fum | inventory and risk | `setLeverage`, `setCap`, `dock` (the vault's `fum`) | [`0xcaD0…82D2`](https://sepolia.etherscan.io/address/0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2) |

## What each one does

**fee** (`roles/fee.mjs`) reads Chainlink ETH/USD every new block and keeps a window of 30 prices. The mid is the
feed's answer; the spread is `FEE_BASE_SPREAD_BPS` (10) plus `FEE_VOL_K` (2) times the window's realized volatility
in bps, clamped to 5..200. It also reads hen's curve (the ratio of hen's two Aqua balances). It reports the price to
the castle service, signed, when it changes and at least every `FEE_REPORT_S` (20 s). The gateway prices every harp
quote from that report and goes silent when it is older than 60 s. When the mid is more than `FEE_DRIFT_BPS` (50)
from hen's curve, the report carries `recentre: "hen"`, which is fee asking fi to re-centre.

**fi** (`roles/fi.mjs`) compiles two programs (`lib/programs.mjs`) and ships them from the one vault balance:

| Slot | Strategy | Program | Size |
|---|---|---|---|
| 0 | harp | `Extruction(PriceExtruction)`: an RFQ that fills only at a price fi signed | 80% of each token (`FI_PROMISE_BPS`) |
| 1 | hen | `flatFee(30 bps)` then `XYCSwap`: a curve over its own Aqua balances, which the v4 hook fills from | 80%, both sides in fee's mid ratio, so the curve starts at the price |
| 2 | greedy | hen's program, asked for another 0.5× of the hoard (`FI_GREEDY=1` only) | exists to be refused |

Each promise is capped by its slot's cap and the token's headroom under fum's leverage, so fi waits for fum first.
greedy goes out unsimulated with a manual 90k gas limit, because `estimateGas` fails on a revert; the vault reverts
`OverAllocated` on-chain, and fi reports the reverted tx so the stream can show the refusal. On `recentre: "hen"`, fi
docks hen and ships it again at the new mid. A slot that fum or the owner docked stays docked: fi does not overrule
fum. fi's other half, signing each Quote (EIP-712) and each gateway response, runs in the castle service on the host
that holds fi's key (`service/src/fi.mjs`).

**fo** (`roles/fo.mjs`) answers `POST /route {order}` on `127.0.0.1:FO_PORT` (8731); the service's MCP tool
`castle_route` forwards there. An order is UniswapX-shaped: `{swapper, nonce, deadline, input: {token, amount},
outputs: [{token, amount (the minimum), recipient}]}`, tokens `USDC`/`WETH` or addresses. fo asks the service for a
harp quote (`castle_quote`) and the V4Quoter for the Castle pool, and returns the better route that meets the minimum,
with its calls (approve, then `router.swap` or `PoolSwapTest.swap`). There is no UniswapX reactor on Sepolia, so the
swapper sends the calls itself. fo reports `intent.routed`, signed.

**fum** (`roles/fum.mjs`) sets leverage (`FUM_LEVERAGE_BPS`, 20000 = promises may total 2× the balance) for both
tokens and a cap per slot (`FUM_CAP_BPS` of the hoard, 100%) once the hoard is funded. Then it keeps the ledger:
balance, committed, headroom and leverage per token, and each live strategy's Aqua allocation. It docks only when
fills have pushed `committed(token)` past `balance × leverage`, lowest priority first (`FUM_DOCK_ORDER`: greedy,
harp, hen), one per check until the Castle is back under. A single promise larger than the balance is not a reason
to dock: that is shared liquidity, and the demo's 80% + 80% sits inside 2×.

## Run

```sh
cd agents && npm ci
cp .env.example .env            # optional: real values (a keyed RPC). Never commit it.
CASTLE_SERVICE_URL=https://handoff.lol/t/castle ./scripts/up.sh    # four processes; logs in agents/logs/<id>.log
./scripts/down.sh                                                  # SIGTERM everyone (each also stops its listener)
```

Every process signs its handoff calls with its own key, sends `agent_heartbeat`, runs one realtime listener, and
beats to the castle service (a signed `agent` report), which is how the stream knows who is up.

## Rehearse on a fork first

Sepolia ETH is real money, so everything runs on an anvil fork of live Sepolia first. `scripts/crew-fork.sh` is the
whole demo there with the real crew and the real castle service, and fails loudly at the first missing beat:

```sh
./scripts/crew-fork.sh                         # RECORD=<dir> keeps the run's record; STRESS=0 skips step 6
```

0. `scripts/fork-deploy.mjs` readies the fork: on a fork taken after c-deploy it adopts the deployed contracts and
   points the resolver at this run's service (`setUrls` as the owner, fork only); on an older fork it deploys them as
   `contracts/script/DeployHoard.s.sol` does. It funds the hoard as the treasury will (5 USDC plus 5/mid WETH).
1. fum sets leverage and caps; fi ships harp and hen at 80% each; fi's greedy reverts `OverAllocated`.
2. agy (`scripts/jack.mjs`, impersonated) resolves `quote.feefifofum.eth` by CCIP-Read through UniversalResolverV2
   and fills the quote through the router.
3. agy swaps 0.5 USDC on the Castle's v4 pool, and the hook fills it just in time from hen. fee sees hen drift, and
   fi re-centres it.
4. fo routes a UniswapX-format order (`castle_route`), and agy sends the calls.
5. The step-2 quote, 31 s later, reverts `QuoteExpired`.
6. Outside the demo: a harp fill sized to push committed WETH past `balance × 2` while hen alone would fit. fum
   docks harp and stops.
7. `service/test/gateway-fork.mjs` checks the gateway, all five MCP tools, `/stream`, `/state` and `/health`.

The crew runs with `CREW_OFFLINE=1` there (no `agent_heartbeat`, no listener), so a rehearsal never shows as the
live agents' liveness. A local RPC disables the fallbacks (`lib/chain.mjs`), so a rehearsal can't leak a
transaction onto Sepolia. `fork-run/` holds a recorded run.

## Env

| Variable | Default | Who |
|---|---|---|
| `SEPOLIA_RPC_URL`, `SEPOLIA_RPC_URL_FALLBACK`, `SEPOLIA_RPC_URL_FALLBACK_2` | public endpoints | all |
| `DEPLOYMENTS_PATH` | `../contracts/deployments/sepolia.json` | all |
| `CASTLE_SERVICE_URL` | unset (reports are only logged) | all |
| `<ID>_KEY_PATH` | `~/.handoff/agents/<id>/sepolia.key` | all |
| `CREW_OFFLINE`, `HEARTBEAT_MS` | `0`, 20000 | all |
| `FEE_BASE_SPREAD_BPS`, `FEE_VOL_K`, `FEE_MIN_SPREAD_BPS`, `FEE_MAX_SPREAD_BPS`, `FEE_WINDOW`, `FEE_DRIFT_BPS`, `FEE_REPORT_S` | 10, 2, 5, 200, 30, 50, 20 | fee |
| `FEE_SHIFT_FILE` | unset (fork runs: a file holding a bps shift of the reference) | fee |
| `FI_SHIP`, `FI_PROMISE_BPS`, `FI_HEN_FEE_BPS` | `harp,hen`, 8000, 30 | fi |
| `FI_GREEDY`, `FI_GREEDY_BPS`, `FI_GREEDY_GAS` | `0`, 5000, 90000 | fi |
| `FO_PORT` | 8731 | fo |
| `FUM_LEVERAGE_BPS`, `FUM_CAP_BPS`, `FUM_DOCK_ORDER` | 20000, 10000, `greedy,harp,hen` | fum |

## Layout

| Path | What |
|---|---|
| `run.mjs` | One crew member: heartbeat and service beat, realtime listener, role tick loop, JSON-line logs |
| `roles/<id>.mjs` | The role: `tick(ctx)` on an interval, `onMessage(ctx, msg)` for inbound handoff messages |
| `lib/vault.mjs` | The crew's view of CastleVault: the ledger (balances, committed, headroom, slots, Aqua allocations) and `send`, which simulates every write first |
| `lib/programs.mjs` | SwapVM programs: harp, hen, and a decoder |
| `lib/report.mjs` | Signed reports to the castle service (EIP-191 over a canonical message; `service/src/report.mjs` checks them) |
| `lib/chain.mjs`, `lib/abis.mjs` | viem on Sepolia (a local RPC never falls back), the key-file account, deployments and ABIs |
| `lib/handoff.mjs`, `lib/listener.mjs` | The signed handoff client and one realtime listener per agent |
| `crew.json` | Public crew data: jobs, addresses, capabilities, personas |
| `scripts/` | `crew-fork.sh`, `fork-deploy.mjs`, `jack.mjs` (fork rehearsal); `register-quote.mjs` (0x67Cc registers `quote`, simulate first, `--send` to send); `up.sh`, `down.sh`; `new-wallets.mjs`, `register-crew.mjs`, `balances.mjs`, `wrap-weth.mjs`, `mcp-call.mjs` |

The lease edition's crew (shifts, heartbeats co-signed by fo, the CCA) is at tag `lease-edition`.

## Rules the runtime keeps

- **Keys stay home.** EOA keys are `~/.handoff/agents/<id>/sepolia.key` and handoff signing keys are
  `~/.handoff/agents/<id>/config.json`, both mode 0600. The runtime refuses a key file readable by others.
  Nothing prints a key.
- **Every write is simulated first.** A revert the simulation predicts is logged and not sent. The one exception is
  greedy, whose revert is the point.
- **Liveness is `agent_heartbeat` and signed beats, never messages**, which are charged and rate-limited.
- **No hard-coded addresses.** Contracts come from `contracts/deployments/sepolia.json`.
- **Signing is code, not judgment.** Inbound messages are logged and routed to deterministic role handlers.
  No model decides what a funded key signs.
