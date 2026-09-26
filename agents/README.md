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

**fo** (`roles/fo.mjs`) routes the orders the castle service's MCP tool `castle_route` takes. It polls the service
(`GET /fo/next`, signed by fo's key, which the service checks against `crew.json`), routes the order it is handed and
posts the route back (`POST /fo/answer`, signed), so fo needs no open port wherever it runs (`FO_POLL=0` turns this
off). A service with `FO_URL` set calls fo's `POST /route {order}` on `127.0.0.1:FO_PORT` (8731) instead. An order is
UniswapX-shaped: `{swapper, nonce, deadline, input: {token, amount},
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
whole demo there with the real crew and the real castle service. Every step is checked: the run stops with `FAIL: …`
and exit 1 at the first one that does not hold, and a pass ends with `PASS: n of n checks` and exit 0 (11 checks
with `STRESS=0`, 15 with the stress).

It needs Foundry's `anvil`, Node 20 or later, `jq`, `curl` and `lsof`; `npm ci` in `agents/` and in `service/`; free
ports 18841 to 18843; and the crew's keys on this machine: `~/.handoff/agents/<id>/sepolia.key` for fee, fi, fo and
fum (they sign on the fork only), and fi's key for the service (`FI_KEY_PATH`, the same file by default). The Jack is
agy impersonated, so no Jack key is used.

```sh
cd agents
STRESS=0 ./scripts/crew-fork.sh                  # a v-e2e pass: steps 0-6, the live run's path
./scripts/crew-fork.sh                           # steps 0-7, with the stress
RECORD=fork-run/<block> ./scripts/crew-fork.sh   # also keep the run's record
KEEP=1 ./scripts/crew-fork.sh                    # leave anvil, the service and the crew up; STOP=1 stops them
```

0. `scripts/fork-deploy.mjs` readies the fork: on a fork taken after c-deploy it adopts the deployed contracts and
   points the resolver at this run's service (`setUrls` as the owner, fork only); on an older fork it deploys them as
   `contracts/script/DeployHoard.s.sol` does. It funds the hoard as the treasury will (5 USDC plus 5/mid WETH).
1. fum sets leverage and caps; fi ships harp and hen at 80% each; fi's greedy reverts `OverAllocated`, and the stream
   shows the refusal.
2. agy (`scripts/jack.mjs`, impersonated) resolves `quote.feefifofum.eth` by CCIP-Read through UniversalResolverV2
   and fills the quote through the router.
3. agy swaps 0.5 USDC on the Castle's v4 pool, and the hook fills it just in time from hen. fee sees hen drift, and
   fi re-centres it.
4. fo routes a UniswapX-format order (`castle_route`, through fo's poll as on the live service), and agy sends the
   calls.
5. The step-2 quote, 31 s later, reverts `QuoteExpired`. fum has docked nothing on this path.
6. `service/test/gateway-fork.mjs` checks the gateway, all five MCP tools, `/stream`, `/state` and `/health`.
7. Outside the demo (`STRESS=1`): a harp fill sized to push committed WETH past `balance × 2` while hen alone would
   fit. fum docks harp, only harp, and hen stays live.

The crew runs with `CREW_OFFLINE=1` there (no `agent_heartbeat`, no listener), so a rehearsal never shows as the
live agents' liveness. A local RPC disables the fallbacks (`lib/chain.mjs`), so a rehearsal can't leak a
transaction onto Sepolia. `fork-run/` holds a recorded run.

| Variable | Default | What |
|---|---|---|
| `STRESS` | 1 | 0 skips step 7 |
| `FILL` | 500000 | each of the Jack's fills, in USDC base units (0.5 USDC) |
| `FO_VIA` | `poll` | `direct`: the service calls fo's `/route` (`FO_URL`) instead of fo polling it |
| `ANVIL_PORT`, `SVC_PORT`, `FO_PORT` | 18841, 18842, 18843 | the fork's RPC, its castle service, fo's `/route` |
| `FORK_URL` | publicnode Sepolia | the chain anvil forks |
| `FORK_WORK` | `$TMPDIR/feefifofum-crew-fork` | the run's logs, each step's JSON (`steps/`) and the fork's deployments file |
| `FI_KEY_PATH` | `~/.handoff/agents/fi/sepolia.key` | the service's quote signer |
| `RECORD`, `KEEP`, `STOP` | unset | keep the record there; leave the run up; stop a kept run |

## The Jack: `scripts/jack.mjs`

The outside solver's moves, one JSON line each. On a fork it is agy impersonated. With `JACK_KEY_PATH` (a file
holding one 0x-prefixed key, mode 0600) it signs with that key, on a fork or on Sepolia: that is how agy sends the
live fills, and how the backup Jack (SirKit's payer) would.

```sh
cd agents && npm ci
export JACK_KEY_PATH=~/.handoff/agents/agy/sepolia.key SEPOLIA_RPC_URL=<a Sepolia RPC> \
  CASTLE_SERVICE_URL=https://handoff.lol/t/castle
node scripts/jack.mjs quote USDC WETH 500000          # the plan only: nothing is sent
node scripts/jack.mjs quote USDC WETH 500000 --send   # approve if needed, then fill the harp quote (router.swap)
node scripts/jack.mjs v4 USDC 500000 --send           # swap on the Castle's v4 pool; the hook fills it from hen
node scripts/jack.mjs route USDC WETH 500000 --send   # an order through castle_route (fo), then its calls
```

- On Sepolia nothing is sent without `--send`. The plan resolves the quote (a free read), skips an approve the
  allowance already covers, simulates the approve with its gas and cost at the cap (`maxCostEth`), and shows what
  the fill would pay (`expect`: `router.quote`, the V4Quoter or fo's route). The fill is simulated once its approve
  is mined, right before it is sent.
- With `--send` every tx is simulated right before it goes out, at a max fee of `MAX_FEE_GWEI` (1.8) and a 0.1 gwei
  tip. Nothing goes out while the base fee is over the cap, and a failed simulation stops the run before that tx.
- A harp quote lives 30 s. If the approve leaves the quote, or a harp route, less than `MIN_LEFT_S` (20) seconds, the
  Jack fetches a fresh one before the fill. When the name does not resolve, it asks `castle_quote` why (fee silent,
  harp not shipped) and says so.
- Each tx prints `{"sent": <hash>, "link": …}` to stderr as it goes out, with the full hash. The result line has
  every tx under `txs` (`approve`, `swap`: `hash`, `link`, `status`, `gasUsed`, `block`, `costEth`), and `tx` is the
  fill's hash. A failure prints `{"ok": false, "error": …, "sent": [the txs already sent]}` and exits 1.
- `stale` and `stress` are fork-only; `crew-fork.sh` runs every move impersonated.
- To rehearse with your own key: `KEEP=1 STRESS=0 ./scripts/crew-fork.sh`, then the commands above with
  `SEPOLIA_RPC_URL=http://127.0.0.1:18841 DEPLOYMENTS_PATH=<FORK_WORK>/deployments.json
  CASTLE_SERVICE_URL=http://127.0.0.1:18842`, and `STOP=1 ./scripts/crew-fork.sh` after. On a fork every move sends;
  `--dry` shows the plan instead. The key's address needs USDC on the fork (fork-deploy gives agy 20). A tx signed on
  the fork is valid on Sepolia too, so never copy a signed fork tx anywhere.

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
| `FO_PORT`, `FO_POLL` | 8731, `1` | fo |
| `FUM_LEVERAGE_BPS`, `FUM_CAP_BPS`, `FUM_DOCK_ORDER` | 20000, 10000, `greedy,harp,hen` | fum |
| `JACK_KEY_PATH`, `MAX_FEE_GWEI`, `MIN_LEFT_S` | unset (impersonated agy, fork only), 1.8, 20 | `scripts/jack.mjs` |

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
| `scripts/` | `crew-fork.sh`, `fork-deploy.mjs` (fork rehearsal); `jack.mjs` (the Jack: agy impersonated on a fork, or `JACK_KEY_PATH` on Sepolia); `register-quote.mjs` (0x67Cc registers `quote`, simulate first, `--send` to send); `up.sh`, `down.sh`; `new-wallets.mjs`, `register-crew.mjs`, `balances.mjs`, `wrap-weth.mjs`, `mcp-call.mjs` |

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
