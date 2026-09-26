# agents/ (fee, fi, fo and fum)

This directory holds the four agents that operate the feefifofum vault ([docs/SPEC.md](../docs/SPEC.md), "The
crew"). Each agent is a handoff agent that runs as its own process, with its own handoff signing key and its own
self-custodied Ethereum Sepolia account (EOA). Together they operate one balance held in CastleVault, which the
service reports as `hoard` and which several SwapVM strategies trade from at the same time. fee sets the price, fi turns the balance into
strategies and signs every quote, fo sends each order to the strategy that pays more, and fum limits how far the
strategies' allocations may exceed the balance.

| Agent | Job | On-chain | Sepolia address |
|---|---|---|---|
| fee | pricing engine | no transactions | [`0x56EB…6538`](https://sepolia.etherscan.io/address/0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538) |
| fi | SwapVM compiler and quote signer | `ship`, `dock` (the vault's `fi`) | [`0xB6eA…40b2`](https://sepolia.etherscan.io/address/0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2) |
| fo | intent forwarder | no transactions | [`0x8689…3D56`](https://sepolia.etherscan.io/address/0x8689a407A2488A5b2f2De05d2C6978a798f93D56) |
| fum | inventory and risk | `setLeverage`, `setCap`, `dock` (the vault's `fum`) | [`0xcaD0…82D2`](https://sepolia.etherscan.io/address/0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2) |

## What each agent does

fee (`roles/fee.mjs`) is the pricing engine. On every new block it reads Chainlink ETH/USD and keeps a window of the
last 30 prices. The mid price is the feed's answer, and the spread is `FEE_BASE_SPREAD_BPS` (10) plus `FEE_VOL_K` (2)
times the window's realized volatility in bps, clamped to the range 5 to 200. fee also reads hen's price, which is
the ratio of hen's two Aqua balances. It sends a signed price report to the castle service when the price changes and
at least every `FEE_REPORT_S` (20 s). The service's gateway prices every harp quote from the latest report, and it
stops quoting when that report is older than 60 s. When the mid differs from hen's price by more than
`FEE_DRIFT_BPS` (50), the report carries `recentre: "hen"`, which asks fi to re-centre hen.

fi (`roles/fi.mjs`) compiles two SwapVM programs (`lib/programs.mjs`) and ships them as strategies that draw on the
one vault balance. A third strategy, greedy, exists only to show the vault enforcing the leverage limit.

| Slot | Strategy | Program | Size |
|---|---|---|---|
| 0 | harp | `Extruction(PriceExtruction)`, the RFQ strategy, which fills only at a price fi signed | 80% of each token (`FI_PROMISE_BPS`) |
| 1 | hen | `flatFee(30 bps)` then `XYCSwap`, a curve over its own Aqua balances that the v4 hook fills swaps from | 80%, with both sides in fee's mid ratio so that the curve starts at the mid price |
| 2 | greedy | hen's program, asking for another 0.5× of the vault's balance (only with `FI_GREEDY=1`) | sized to exceed the leverage limit, so the vault reverts it |

Each allocation is limited by its slot's cap and by the token's headroom under fum's leverage limit, so fi waits for
fum to set both before it ships. fi sends greedy without simulating it and with a manual gas limit of 90k, because
`estimateGas` fails on a transaction that reverts. The vault reverts it with `OverAllocated`, and fi reports the
reverted transaction to the service, which puts it on the stream as an `allocation.refused` event. When a price
report carries `recentre: "hen"`, fi docks hen and ships it again at the new mid. If fum or the vault's owner docks a
slot, fi leaves that slot docked and does not ship it again. The other part of fi's job, signing each EIP-712 `Quote`
and each gateway response, runs inside the castle service on the host that holds fi's key (`service/src/fi.mjs`).

fo (`roles/fo.mjs`) routes the orders that the castle service's MCP tool `castle_route` receives. fo polls the
service with `GET /fo/next`, signed with fo's key, which the service checks against `crew.json`. It routes the order
it receives and posts the route back with `POST /fo/answer`, also signed, so fo needs no open port wherever it runs
(`FO_POLL=0` turns the polling off). A service started with `FO_URL` set calls fo's `POST /route {order}` on
`127.0.0.1:FO_PORT` (8731) instead. An order has the UniswapX shape `{swapper, nonce, deadline, input: {token,
amount}, outputs: [{token, amount (the minimum), recipient}]}`, where the tokens are `USDC`, `WETH` or addresses. fo
asks the service for a harp quote (`castle_quote`) and the V4Quoter for a quote on the vault's v4 pool, and returns
the route that pays more while meeting the minimum, together with its calls, which are an approve followed by
`router.swap` or `PoolSwapTest.swap`. Sepolia has no UniswapX reactor, so the swapper sends the calls itself. fo then sends a signed
`intent.routed` report.

fum (`roles/fum.mjs`) manages inventory and risk. Once the vault is funded, it sets the leverage limit for both tokens
(`FUM_LEVERAGE_BPS`, where 20000 means the allocations may add up to 2× the balance) and a cap for each slot
(`FUM_CAP_BPS` of the vault's balance, 100%). After that it keeps a ledger of each token's balance, committed amount, headroom
and leverage, and of each live strategy's Aqua allocation. fum docks a strategy only when fills have pushed
`committed(token)` above `balance × leverage`. It docks the lowest-priority strategy first (`FUM_DOCK_ORDER`: greedy,
harp, hen), one strategy per check, until the vault is back within its limits. An allocation larger than the balance
is not in itself a reason to dock, because the strategies share the same liquidity by design. The demo's two
allocations of 80% each add up to 1.6×, which is inside the 2× limit.

## Running the crew

```sh
cd agents && npm ci
cp .env.example .env            # optional: real values (a keyed RPC). Never commit it.
CASTLE_SERVICE_URL=https://handoff.lol/t/castle ./scripts/up.sh    # four processes; logs in agents/logs/<id>.log
./scripts/down.sh                                                  # SIGTERM everyone (each also stops its listener)
```

Each process signs its handoff calls with its own key, sends `agent_heartbeat`, runs one realtime listener, and sends
signed `agent` reports to the castle service as a liveness beat. The service uses those beats to show on its stream
which agents are running.

## Rehearsing on a fork

Sepolia ETH costs real money, so everything runs first on an anvil fork of live Sepolia. `scripts/crew-fork.sh` runs
the whole demo on such a fork with the real crew and the real castle service, and it checks every step. The script
stops with `FAIL: …` and exit code 1 at the first check that does not hold, and a passing run ends with
`PASS: n of n checks` and exit code 0 (11 checks with `STRESS=0`, and 15 with the stress step).

The script needs Foundry's `anvil`, Node 20 or later, `jq`, `curl` and `lsof`, `npm ci` in both `agents/` and
`service/`, and free ports 18841 to 18843. It also needs the crew's keys on this machine. These are
`~/.handoff/agents/<id>/sepolia.key` for fee, fi, fo and fum, which sign on the fork only, and fi's key for the
service (`FI_KEY_PATH`, the same file by default). The test taker is agy's address impersonated on the fork, so no
taker key is used.

```sh
cd agents
STRESS=0 ./scripts/crew-fork.sh                  # a v-e2e pass: steps 0-6, the live run's path
./scripts/crew-fork.sh                           # steps 0-7, with the stress
RECORD=fork-run/<block> ./scripts/crew-fork.sh   # also keep the run's record
KEEP=1 ./scripts/crew-fork.sh                    # leave anvil, the service and the crew up; STOP=1 stops them
```

The steps run in this order.

0. `scripts/fork-deploy.mjs` prepares the fork. On a fork taken after c-deploy, it adopts the deployed contracts and
   points the resolver at this run's service (`setUrls` as the owner, on the fork only). On an older fork it deploys
   the contracts as `contracts/script/DeployHoard.s.sol` does. It then funds the vault the way the treasury funds it
   on Sepolia, with 5 USDC plus 5/mid WETH.
1. fum sets the leverage limits and the caps, and fi ships harp and hen at 80% each. fi's greedy ship reverts with
   `OverAllocated`, and the stream shows it as `allocation.refused`.
2. agy (`scripts/jack.mjs`, impersonated) resolves `quote.feefifofum.eth` by CCIP-Read through UniversalResolverV2
   and fills the quote through the router.
3. agy swaps 0.5 USDC on the vault's v4 pool, and the v4 hook (CastleJITHook) fills the swap from hen in the same
   transaction. fee sees hen's price drift from the mid, and fi re-centres hen.
4. fo routes a UniswapX-format order (`castle_route`, through fo's poll, as on the live service), and agy sends the
   calls that fo returned.
5. agy tries the step-2 quote again 31 s later, and the fill reverts with `QuoteExpired`. fum has docked nothing up
   to this point.
6. `service/test/gateway-fork.mjs` checks the gateway, all five MCP tools, `/stream`, `/state` and `/health`.
7. With `STRESS=1`, outside the demo, the script sends a harp fill sized to push committed WETH above `balance × 2`
   while hen alone would still fit. fum docks harp and leaves hen live.

During a rehearsal the crew runs with `CREW_OFFLINE=1`, so it sends no `agent_heartbeat` and starts no listener, and a
rehearsal never appears as the live agents' liveness. A local RPC URL turns off the fallback RPCs (`lib/chain.mjs`),
so a rehearsal cannot send a transaction to Sepolia. `fork-run/` holds a recorded run.

| Variable | Default | What |
|---|---|---|
| `STRESS` | 1 | 0 skips step 7 |
| `FILL` | 500000 | each of the test taker's fills, in USDC base units (0.5 USDC) |
| `FO_VIA` | `poll` | `direct`: the service calls fo's `/route` (`FO_URL`) instead of fo polling it |
| `ANVIL_PORT`, `SVC_PORT`, `FO_PORT` | 18841, 18842, 18843 | the fork's RPC, its castle service, fo's `/route` |
| `FORK_URL` | publicnode Sepolia | the chain anvil forks |
| `FORK_WORK` | `$TMPDIR/feefifofum-crew-fork` | the run's logs, each step's JSON (`steps/`) and the fork's deployments file |
| `FI_KEY_PATH` | `~/.handoff/agents/fi/sepolia.key` | the service's quote signer |
| `RECORD`, `KEEP`, `STOP` | unset | keep the record there; leave the run up; stop a kept run |

## The test taker (`scripts/jack.mjs`)

`scripts/jack.mjs` performs the actions of an outside solver and prints one JSON line for each. On a fork it
impersonates agy. With `JACK_KEY_PATH` set to a file holding one 0x-prefixed key (mode 0600), it signs with that key,
on a fork or on Sepolia. agy sent the live fills this way, and SirKit's payer account would do the same as the backup
taker.

```sh
cd agents && npm ci
export JACK_KEY_PATH=~/.handoff/agents/agy/sepolia.key SEPOLIA_RPC_URL=<a Sepolia RPC> \
  CASTLE_SERVICE_URL=https://handoff.lol/t/castle
node scripts/jack.mjs quote USDC WETH 500000          # the plan only: nothing is sent
node scripts/jack.mjs quote USDC WETH 500000 --send   # approve if needed, then fill the harp quote (router.swap)
node scripts/jack.mjs v4 USDC 500000 --send           # swap on the vault's v4 pool; the hook fills it from hen
node scripts/jack.mjs route USDC WETH 500000 --send   # an order through castle_route (fo), then its calls
```

- On Sepolia nothing is sent without `--send`. Without it, the script resolves the quote (a free read), skips an
  approve that the current allowance already covers, simulates the approve and reports its gas and its cost at the fee
  cap (`maxCostEth`), and shows what the fill would pay (`expect`, from `router.quote`, the V4Quoter or fo's route).
  The fill itself is simulated once its approve is mined, right before it is sent.
- With `--send`, every transaction is simulated right before it is sent, at a max fee of `MAX_FEE_GWEI` (1.8) and a
  0.1 gwei tip. Nothing is sent while the base fee is above the cap, and a failed simulation stops the run before that
  transaction.
- A harp quote is valid for 30 s. If the approve leaves the quote, or a harp route, with less than `MIN_LEFT_S` (20)
  seconds, the script fetches a fresh quote before the fill. When the name does not resolve, the script asks
  `castle_quote` for the reason (fee's price is stale, or harp is not shipped) and prints it.
- Each transaction prints `{"sent": <hash>, "link": …}` to stderr as it is sent, with the full hash. The result line
  lists every transaction under `txs` (`approve` and `swap`, each with `hash`, `link`, `status`, `gasUsed`, `block` and
  `costEth`), and `tx` is the fill's hash. A failure prints
  `{"ok": false, "error": …, "sent": [the txs already sent]}` and exits with code 1.
- The `stale` and `stress` commands work on a fork only, and `crew-fork.sh` runs every command impersonated.
- To rehearse with your own key, run `KEEP=1 STRESS=0 ./scripts/crew-fork.sh`, then the commands above with
  `SEPOLIA_RPC_URL=http://127.0.0.1:18841 DEPLOYMENTS_PATH=<FORK_WORK>/deployments.json
  CASTLE_SERVICE_URL=http://127.0.0.1:18842`, and run `STOP=1 ./scripts/crew-fork.sh` afterwards. On a fork every
  command sends its transactions, and `--dry` shows the plan instead. The key's address needs USDC on the fork
  (fork-deploy gives agy 20). A transaction signed on the fork is also valid on Sepolia, so never copy a signed fork
  transaction anywhere.

## Environment variables

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
| `scripts/` | `crew-fork.sh`, `fork-deploy.mjs` (fork rehearsal); `jack.mjs` (the test taker, which impersonates agy on a fork or signs with `JACK_KEY_PATH` on Sepolia); `register-quote.mjs` (0x67Cc registers `quote`, simulate first, `--send` to send); `up.sh`, `down.sh`; `new-wallets.mjs`, `register-crew.mjs`, `balances.mjs`, `wrap-weth.mjs`, `mcp-call.mjs` |

The lease edition's crew (shifts, heartbeats co-signed by fo, the CCA) is at tag `lease-edition`.

## Rules the runtime enforces

- EOA keys are kept in `~/.handoff/agents/<id>/sepolia.key` and handoff signing keys in
  `~/.handoff/agents/<id>/config.json`, both with mode 0600. The runtime rejects a key file that other users can read,
  and no code path prints a key.
- Every write is simulated before it is sent, and a write whose simulation reverts is logged and not sent. The only
  exception is greedy, which is sent so that it reverts.
- Liveness is reported with `agent_heartbeat` and with signed beats to the service. Handoff messages are not used for
  liveness, because they are charged and rate-limited.
- Contract addresses come from `contracts/deployments/sepolia.json`, and the code contains none.
- Inbound handoff messages are logged and passed to deterministic role handlers. No language model decides what a
  funded key signs.
