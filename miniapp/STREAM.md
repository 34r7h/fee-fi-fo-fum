# The event stream (v2)

This file specifies the stream of events that the off-chain service (`service/`, at `https://handoff.lol/t/castle/`, maintained by agent-smith) publishes about the vault. The tale page (`miniapp/fee-fi-fo-fum-tale.html`) builds its whole view from this one ordered stream, and its built-in mock plays the same events on a timer. The live stream and the mock pass through the same reducer, so the page can display any event that the stream can carry. The web app (`miniapp/fee-fi-fo-fum.html`) reads the same snapshot from `GET /state` for the vault's figures.

impecc owns this schema, so a change to a field goes through impecc instead of a second, different shape. docs/SPEC.md takes precedence over this file, and when SPEC renames a contract event or an error, this file is updated to match. The lease edition's schema (v1, with leases, heartbeats, fences and the CCA) was retired together with that product at tag `lease-edition`.

The events identify the four agents that operate the vault and the vault's strategy slots by short names, which docs/NAMING.md defines:

| Name | What it is |
|---|---|
| `fee` | The agent that reads Chainlink ETH/USD and sets the mid price and spread. |
| `fi` | The agent that compiles the SwapVM programs, ships and docks strategies on the vault, and signs every quote. |
| `fo` | The agent that receives UniswapX-format orders and sends each one to the RFQ strategy or the v4 pool, whichever pays more. |
| `fum` | The agent that sets each token's leverage limit and each slot's cap. |
| `harp` | Slot 0, the RFQ strategy, priced by `PriceExtruction.sol` from quotes that fi signs. |
| `hen` | Slot 1, the strategy that fills the Uniswap v4 pool just in time through `CastleJITHook.sol`. |
| `greedy` | Slot 2, a strategy that asks for more than the leverage limit allows, which the demo uses to show the vault reverting `OverAllocated`. |

## What the tale page shows, and the events behind it

| Part of the page | What it shows | Events |
|---|---|---|
| Vault balances | The vault's USDC and WETH balances and fee's current price | `hoard`, `price` |
| Allocations | How much of the balance each strategy is allocated, the leverage limit that fum sets, and any ship that the vault reverted because it exceeded the limit | `leverage.set`, `strategy.shipped`, `strategy.docked`, `cap.set`, `allocation.refused`, `fill` |
| Strategies | The SwapVM strategies (`harp`, `hen`) that draw on the same balance | `strategy.shipped`, `strategy.docked`, `fill` |
| RFQ quotes | The quotes that solvers obtained from `quote.feefifofum.eth` through CCIP-Read, and whether each one was filled or expired | `quote.served`, `fill` |
| v4 fills | The Uniswap v4 swaps that CastleJITHook filled just in time from the `hen` strategy | `fill` with `route: "v4"`, `intent.routed` |
| Event log | Every event above, in order | all |

## Transport

| Route | What it returns |
|---|---|
| `GET /stream` | Server-sent events. The first frame is `snapshot`, followed by one frame per event, in order. Each frame's `id:` is the event's `seq`, so a client resumes with `Last-Event-ID`, and `?since=0` replays the whole history after the snapshot. The service sends a `: ping` comment every 15 s. |
| `GET /state` | The same `snapshot` body as plain JSON, for one-time reads and for the card face. |
| `GET /health` | `200` when the service is up. |

Every route sends `Access-Control-Allow-Origin: *`, because the pages are served from `handoff.lol` and read the service cross-origin. Each SSE frame consists of `event: <type>` and `data: <one JSON line>`, and `type` is repeated inside the JSON, so a client that ignores the `event:` line still works. The handoff tunnel in front of the live service relays a response only after the response has ended, so the live service closes each SSE response after `CASTLE_SSE_WINDOW_MS` (2,500 ms) and sends `retry: 250`. The browser's EventSource then reconnects with `Last-Event-ID` and receives every event in order, in batches of up to 2.5 s.

The pages learn the service URL from their publish-time config, which `miniapp/build.mjs` inlines from `miniapp/config.json` and `contracts/deployments/sepolia.json`, so their source contains no literal addresses. When `snapshot.config` and the build config differ, the page uses `snapshot.config`.

## Conventions

Every event carries the same envelope:

```json
{ "v": 2, "seq": 1042, "type": "fill", "t": 1790440000123, "block": 9412345, "tx": "0x…", "src": "chain" }
```

| Field | Meaning |
|---|---|
| `v` | The schema version. This file describes version `2`. |
| `seq` | A number that increases with every event in a stream. It is also the SSE `id`. |
| `t` | Unix time in milliseconds. On chain events it is the block timestamp multiplied by 1000; the time at which the service saw the event is not recorded. |
| `block`, `tx` | Set on chain events, and `null` on off-chain events such as a served quote or a ship that failed in simulation before it was sent. |
| `src` | `chain` for a log or a view call, `gateway` for a quote that the CCIP-Read gateway served, `agent` for an agent's report, and `service` for something the service observed itself, such as a reverted transaction that it relayed. |

Amounts are integer decimal strings in the token's base units (6 decimals for USDC, 18 for WETH). A set of amounts is called a bag, which is an object keyed by token symbol:

```json
{ "USDC": "10150000000", "WETH": "4200000000000000000" }
```

A token that is missing from a bag has an amount of zero. The page adds USDC and WETH amounts together only when it also shows the price it used for the conversion. Prices are `usdcPerWeth` decimal strings, such as `"2412.50"`.

An address that has an ENS name is accompanied by a companion field, such as `takerName` next to `taker` and `requesterName` next to `requester`. The companion field holds the ENS name, or `null` when the address has none.

## Events

### `snapshot`

The first frame of a new connection (one that does not resume with `Last-Event-ID`) is a `snapshot` of the current state, and `GET /state` returns the same body:

```json
{ "type": "snapshot", "v": 2, "t": 1790440000000, "block": 9412000,
  "config": { "chainId": 11155111, "explorer": "https://sepolia.etherscan.io",
    "quoteName": "quote.feefifofum.eth",
    "gateway": "https://handoff.lol/t/castle/ccip/{sender}/{data}.json",
    "castle": "0x…", "aqua": "0x…", "router": "0x…", "resolver": "0x…",
    "hook": "0x…", "poolManager": "0x…", "poolId": "0x…",
    "usdc": "0x…", "weth": "0x…", "decimals": { "USDC": 6, "WETH": 18 } },
  "agents": [ { "id": "fee", "role": "prices", "addr": "0x…", "ens": "fee.feefifofum.eth", "alive": true, "lastBeat": 1790439990000 } ],
  "hoard": { "USDC": "10150000000", "WETH": "4200000000000000000" },
  "price": { "mid": "2412.50", "spreadBps": 12, "source": "Chainlink ETH/USD", "block": 9411990, "tx": null },
  "leverage": { "USDC": 20000, "WETH": 20000 },
  "caps": { "0": { "USDC": "10000000", "WETH": "4000000000000000" }, "1": { "USDC": "10000000", "WETH": "4000000000000000" } },
  "strategies": [ { "slot": 0, "hash": "0x…", "label": "harp", "kind": "PriceExtruction", "shippedBy": "fi",
    "alloc": { "USDC": "10000000", "WETH": "4000000000000000" },
    "cap": { "USDC": "10000000", "WETH": "4000000000000000" },
    "docked": false, "fills": 3, "block": 9411000, "tx": "0x…" } ],
  "quotes":   [ /* the last 20 quote.served bodies, oldest first */ ],
  "fills":    [ /* the last 50 fill bodies, oldest first */ ],
  "refusals": [ /* the last 10 allocation.refused bodies, oldest first */ ],
  "intents":  [ /* the last 20 intent.routed bodies, oldest first */ ] }
```

`hoard` is `balanceOf(castle)` for each token at `block`. `leverage` is `leverageOf(token)` in basis points, and `caps` holds `capOf(slot)` for each slot, keyed by slot number. `strategies` lists every strategy shipped from the vault that is still live, plus docked strategies that still have fills in `fills`. `alloc` is the strategy's Aqua balance per token, which is what the vault's `committed` sums.

### Vault balances and the price

| type | body | source |
|---|---|---|
| `hoard` | `{ hoard: bag, reason: "fill" \| "deposit" \| "withdraw" }`. The vault's balances after the transaction in `tx`. The service emits one after every fill, deposit and withdrawal. | `balanceOf(castle)` at that block |
| `price` | `{ mid, spreadBps, hookFeeBps, source, henMid, driftBps, sigmaBps, recentre, by: "fee" }`. fee's current price, taken from `source` (Chainlink ETH/USD). `henMid` is the price of the `hen` strategy's curve, `driftBps` is how far that is from `mid` in basis points, and `sigmaBps` is the recent volatility that sets the spread. `recentre` is `"hen"` when the drift exceeds fee's `FEE_DRIFT_BPS` and fee asks fi to dock and re-ship `hen` at `mid`, and `null` otherwise. `hookFeeBps` is `null` unless fee reports one. The price is reported off-chain, so `tx` is `null`. | agent |

### Allocations, leverage and caps

In Aqua, shipping a strategy does not move the vault's tokens. `ship` records a virtual balance per token for the strategy, and `dock` removes it at no cost. The allocations of all live strategies may add up to more than the vault's balance, which is how the strategies share one balance. CastleVault reverts a ship when `committed(token) + amount > balanceOf(token) × leverageBps / 1e4`. fum sets the leverage per token and a cap per slot, as docs/SPEC.md describes.

| type | body | source |
|---|---|---|
| `leverage.set` | `{ token: "USDC" \| "WETH", bps, by: "fum" }`. `20000` means that the allocations may total twice the balance. | `LeverageSet` |
| `cap.set` | `{ slot, label, cap: bag, by: "fum" }`. `label` is the name of the slot's strategy when the service knows it (`harp`, `hen`, `greedy`). | `CapSet` |
| `strategy.shipped` | `{ slot, hash, label, kind, alloc: bag, shippedBy: "fi" }`. `label` is `harp`, `hen` or `greedy`. `kind` names the program, which is `PriceExtruction` for `harp` and `XYCSwap + flatFee` for `hen`. | `Shipped` |
| `strategy.docked` | `{ hash, by: "fi" \| "fum" \| "owner", reason }`. The strategy's allocation is removed and no longer counts toward `committed`. | `Docked` |
| `allocation.refused` | `{ slot, label, hash, asked: bag, committed: bag, balance: bag, limit: bag, error, errorArgs, by: "fi", status: "reverted" }`. `committed` is the total allocated before this ship, and `limit` is the balance multiplied by the leverage. `error` is `"OverAllocated"` or `"OverCap"`. For `OverAllocated`, `errorArgs` is `{ token: "USDC" \| "WETH", committedAfter, limit }` in base units, and for `OverCap` it is `{ slot, token, amount, cap }`. `tx` is the reverted transaction, or `null` if the ship failed in simulation and was never sent. | service (reverted tx) |

### RFQ quotes through CCIP-Read

A solver asks `quote.feefifofum.eth` for the text record `quote:<tokenIn>:<tokenOut>:<amountIn>`. OffchainQuoteResolver reverts with `OffchainLookup`, which directs the solver's client to the service's gateway. The gateway answers with a quote that fi has signed, and the resolver's `resolveWithProof` checks fi's signature and the expiry. When the solver fills the quote, PriceExtruction checks fi's EIP-712 signature on the quote again.

| type | body | source |
|---|---|---|
| `quote.served` | `{ id, name, key, sender, requester, requesterName, strategy, tokenIn, tokenOut, amountIn, amountOut, priceQ96, validUntil, signer: "fi", signerAddr, digest }`. `key` is the text-record key that was asked for (`quote:USDC:WETH:1000000`). `sender` is the `OffchainLookup` sender, which is the resolver. `requester` is the solver when the gateway can identify it, and `null` otherwise. `tokenIn` is the token that the solver pays. `validUntil` is the quote's expiry in unix seconds (the time of serving plus 30 s). `id` is the `id` in the quote JSON, which a later `fill` repeats as `quoteId`. `via` is `ccip` when the name was resolved, or `mcp` when the service's `castle_quote` MCP tool was called, in which case `name`, `sender` and `digest` are `null`. | `gateway` (no tx) |

### Fills through Aqua and the v4 hook

```json
{ "type": "fill", "route": "aqua", "strategy": "0x…", "quoteId": "q-17", "intentId": null,
  "taker": "0x…", "takerName": "agy.feefifofum.eth",
  "tokenIn": "USDC", "tokenOut": "WETH", "amountIn": "1000000", "amountOut": "414000000000000",
  "fee": null, "pool": null, "alloc": { "USDC": "11000000", "WETH": "3586000000000000" },
  "status": "success", "revert": null }
```

- `route` is `aqua` for a SwapVM strategy filled through the router, or `v4` for a swap that the Uniswap v4 hook fills from the vault just in time, in `beforeSwap`.
- `tokenIn` and `amountIn` are what the taker paid the vault, and `tokenOut` and `amountOut` are what the vault paid out. A successful fill changes the vault's balances by exactly `+amountIn` of `tokenIn` and `−amountOut` of `tokenOut`, and the `hoard` event that follows shows the new balances.
- `strategy` is the hash of the strategy that the fill drew on, which is `harp` for a filled quote and `hen` for a v4 swap.
- `alloc` is that strategy's allocation after the fill, when the service knows it. The page does not estimate it when it is missing.
- `label` is the strategy's name (`harp` or `hen`), when the service knows it.
- `fee` is the `hen` strategy's SwapVM `flatFee` as a bag, already included in `amountIn`, when the service can determine it, and `pool` is the v4 pool id. Both are `null` for `aqua` fills.
- `quoteId` links a fill to the `quote.served` event that it filled, and `intentId` links it to the `intent.routed` event through which fo routed it.
- `status` is `success` or `reverted`. A reverted transaction emits no logs, so the service records the reverted fills that it relays and emits them with the error in `revert`, such as `QuoteExpired(1790440030)`, whose unix time the page shows as a clock time. The transaction hash is real and can be checked on Etherscan.

### Routed orders and agent status

| type | body | source |
|---|---|---|
| `intent.routed` | `{ id, source: "UniswapX" \| "mcp", swapper, swapperName, tokenIn, tokenOut, amountIn, route: "aqua" \| "v4", strategy, by: "fo" }`. fo's answer to `castle_route` for a UniswapX-format order, where `aqua` means the RFQ strategy (`harp`) and `v4` means the v4 pool (`hen`). `tokenIn` is the token that the swapper pays. | agent |
| `agent` | `{ id, role, alive, lastBeat, note }`. The service emits it when an agent's `agent_heartbeat` goes stale or resumes, and it does not emit one for every heartbeat. | agent |

## The demo's events in order

The page's mock plays the demo from docs/SPEC.md on a loop, and the live run is expected to produce the same events in the same order.

1. A `snapshot` with the vault's balances is followed by fee's `price`.
2. fum sets the leverage limit to 2× for each token (two `leverage.set` events) and sets the caps of the three slots (three `cap.set` events).
3. fi ships `harp` and `hen` against the same balance, each allocated 80% of the vault's balance (two `strategy.shipped` events). Together they commit 1.6 times the balance, which is within the 2× limit.
4. fi ships `greedy`, which asks for another 0.5 times the balance, and the ship reverts with `OverAllocated` (`allocation.refused`). Because the allocations stay 0.4 times the balance below the limit, fum docks nothing after the demo's fills. fum docks a strategy only when fills push `committed` past the limit.
5. agy, the agent that acts as the taker, resolves a quote from `quote.feefifofum.eth` (`quote.served`) and fills it (`fill` with `route: "aqua"` and `quoteId` set, followed by `hoard`).
6. fo routes a UniswapX-format order to the v4 pool (`intent.routed`), and the hook fills agy's v4 swap just in time from `hen` (`fill` with `route: "v4"`, followed by `hoard`).
7. On a fork, filling the same quote 31 s later reverts (`fill` with `status: "reverted"` and `revert: "QuoteExpired(…)"`).
