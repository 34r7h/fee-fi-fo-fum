# Castle stream v2: one hoard, every market

`miniapp/fee-fi-fo-fum.html` draws the castle from one ordered stream of events. The castle service (`service/`, owned by agent-smith) serves it live, and the page's built-in mock plays the same events on a timer. **Both go through one reducer**, so anything the stream can say, the page can already draw.

Owner of this schema: impecc. If you need a field changed, message impecc; don't fork the shape. docs/SPEC.md wins over this file: when SPEC renames a contract event or an error, this file follows it.

The lease edition's schema (v1: leases, heartbeats, fences, the CCA) is retired with its product at tag `lease-edition`.

## What the page shows, and the events behind it

| Section | Question it answers | Events |
|---|---|---|
| The hoard | How much gold is in the Castle? | `hoard`, `price` |
| The promises | How much of that gold is promised, to which strategy, and did fum refuse a promise the hoard can't keep? | `strategy.shipped`, `strategy.docked`, `cap.set`, `allocation.refused`, `fill` |
| The bargains | Which SwapVM strategies does the one balance back? | `strategy.shipped`, `strategy.docked`, `fill` |
| The harp | Which quotes did solvers find by asking `quote.feefifofum.eth` (CCIP-Read), and were they filled? | `quote.served`, `fill` |
| The hen | Which Uniswap v4 swaps did the hook fill just in time from the Castle? | `fill` with `route: "v4"`, `intent.routed` |
| The tapestry | Every event above, told as a scene | all |

## Transport

| Route | What it returns |
|---|---|
| `GET /stream` | **SSE**. The first frame is `snapshot`, then one frame per event, in order. `id:` is the event's `seq`, so `Last-Event-ID` resumes. `?since=0` replays the whole history. Send a `: ping` comment every 15 s. |
| `GET /state` | The same `snapshot` body as plain JSON, for one-shot reads and for the card face. |
| `GET /health` | `200` when the service is up. |

- Send `Access-Control-Allow-Origin: *` on every route. The page is served from `handoff.lol` and reads the service cross-origin.
- Each SSE frame is `event: <type>` plus `data: <one JSON line>`. `type` is also inside the JSON, so a client that ignores `event:` still works.
- The page learns the service URL from its publish-time config: `miniapp/config.json` plus `contracts/deployments/sepolia.json`, inlined by `miniapp/build.mjs`. It has no literal addresses in its source. When `snapshot.config` and the build config differ, **the service wins**.

## Conventions

**Envelope, on every event:**

```json
{ "v": 2, "seq": 1042, "type": "fill", "t": 1790440000123, "block": 9412345, "tx": "0x…", "src": "chain" }
```

| Field | Meaning |
|---|---|
| `v` | Schema version. This file is `2`. |
| `seq` | Monotonic per stream. It's the SSE `id`. |
| `t` | Unix ms. On chain events it's the **block timestamp** ×1000, not the time the service saw the event. |
| `block`, `tx` | Set on chain events. `null` on off-chain ones (a served quote, a refusal caught before it was sent). |
| `src` | `chain` (a log or a view), `gateway` (the CCIP-Read gateway served it), `agent` (an agent reported it), `service` (the service saw it, such as a reverted tx it relayed). |

**Money.** Amounts are raw integer **decimal strings** in the token's own units (USDC 6 decimals, WETH 18). A set of amounts is a **bag** keyed by token symbol:

```json
{ "USDC": "10150000000", "WETH": "4200000000000000000" }
```

A bag may leave out a token, which means zero. The page never adds USDC to WETH unless it shows the price it used. Prices are `usdcPerWeth` decimal strings, such as `"2412.50"`.

**Names.** Every address that has a name also gets one: `takerName`, `requesterName` (an ENS name, or `null`). The agents are `fee`, `fi`, `fo` and `fum`.

## Events

### `snapshot`: the whole castle now (first frame, and the body of `GET /state`)

```json
{ "type": "snapshot", "v": 2, "t": 1790440000000, "block": 9412000,
  "config": { "chainId": 11155111, "explorer": "https://sepolia.etherscan.io",
    "name": "castle.feefifofum.eth", "quoteName": "quote.feefifofum.eth",
    "gateway": "https://handoff.lol/t/castle/ccip/{sender}/{data}.json",
    "castle": "0x…", "aqua": "0x…", "router": "0x…", "resolver": "0x…",
    "hook": "0x…", "poolManager": "0x…", "poolId": "0x…",
    "usdc": "0x…", "weth": "0x…", "decimals": { "USDC": 6, "WETH": 18 } },
  "agents": [ { "id": "fee", "role": "prices", "addr": "0x…", "ens": "fee.feefifofum.eth", "alive": true, "lastBeat": 1790439990000 } ],
  "hoard": { "USDC": "10150000000", "WETH": "4200000000000000000" },
  "price": { "mid": "2412.50", "spreadBps": 12, "hookFeeBps": 30, "block": 9411990, "tx": "0x…" },
  "strategies": [ { "hash": "0x…", "label": "Tight curve", "kind": "curve", "shippedBy": "fi",
    "alloc": { "USDC": "6000000000", "WETH": "2000000000000000000" },
    "cap": { "USDC": "7000000000", "WETH": "2500000000000000000" },
    "docked": false, "fills": 3, "block": 9411000, "tx": "0x…" } ],
  "quotes":   [ /* the last 20 quote.served bodies, oldest first */ ],
  "fills":    [ /* the last 50 fill bodies, oldest first */ ],
  "refusals": [ /* the last 10 allocation.refused bodies, oldest first */ ],
  "intents":  [ /* the last 20 intent.routed bodies, oldest first */ ] }
```

`hoard` is `balanceOf(castle)` for each token at `block`. `strategies` lists every strategy shipped from the Castle that is still live, plus docked ones that have fills in `fills`.

### The hoard and the price

| type | body | source |
|---|---|---|
| `hoard` | `{ hoard: bag, reason: "fill" \| "deposit" \| "withdraw" }`. The Castle's balances **after** the tx in `tx`. Send one after every fill, deposit and withdrawal. | `balanceOf(castle)` at that block |
| `price` | `{ mid, spreadBps, hookFeeBps, by: "fee" }`. fee's current price. `tx` is set when fee wrote it on chain (the hook fee), and `null` when it's off-chain only. | agent or chain |

### The promises: allocations and fum's caps

In Aqua the Castle's tokens never leave it when it ships a strategy. `ship` records a virtual balance per token for that strategy, and `dock` revokes it at no cost. The Castle refuses any ship that would take the total promised past its balance, and fum sets a cap per strategy.

| type | body | source |
|---|---|---|
| `strategy.shipped` | `{ hash, label, kind, alloc: bag, cap: bag \| null, shippedBy: "fi" }`. `label` is a short human name ("Tight curve"). `kind` names the SwapVM program's shape (SPEC.md lists them). | Castle ship event plus Aqua's |
| `strategy.docked` | `{ hash, by: "fi" \| "fum", reason }`. The promise goes back to the hoard. | Castle dock event plus Aqua's |
| `cap.set` | `{ hash, cap: bag, by: "fum" }` | Castle cap event |
| `allocation.refused` | `{ label, hash, asked: bag, allocated: bag, balance: bag, cap: bag \| null, error, by: "fi", status: "reverted" }`. `allocated` is the total already promised **before** this ship, across every strategy. `error` is the Castle's revert, as SPEC.md names it (for example `OverAllocated(address token, uint256 asked, uint256 free)`). `tx` is the reverted tx, or `null` if it was refused in simulation, never sent. | service (reverted tx) |

### The harp: quotes found through CCIP-Read

A solver resolves `quote.feefifofum.eth`. The resolver reverts `OffchainLookup` to the gateway, the gateway answers with an order signed by fi, and the resolver's callback checks fi's signature and the expiry.

| type | body | source |
|---|---|---|
| `quote.served` | `{ id, name, sender, requester, requesterName, strategy, tokenIn, tokenOut, amountIn, amountOut, price, expiry, signer: "fi", signerAddr, digest }`. `sender` is the `OffchainLookup` sender (the resolver). `requester` is the solver when the request names one, or `null`. `tokenIn` is what the solver pays. `expiry` is unix seconds. `id` is what a later `fill` quotes as `quoteId`. | `gateway` (no tx) |

### Fills: Aqua and the v4 hook

```json
{ "type": "fill", "route": "aqua", "strategy": "0x…", "quoteId": "q-17", "intentId": null,
  "taker": "0x…", "takerName": "agy.feefifofum.eth",
  "tokenIn": "USDC", "tokenOut": "WETH", "amountIn": "1206250000", "amountOut": "500000000000000000",
  "fee": null, "pool": null, "alloc": { "USDC": "7206250000", "WETH": "1500000000000000000" },
  "status": "success", "revert": null }
```

- `route` is `aqua` (a SwapVM strategy through the router) or `v4` (the Uniswap v4 hook's `beforeSwap`, filled just in time from the Castle).
- `tokenIn` and `amountIn` are what the **taker paid the Castle**, and `tokenOut` and `amountOut` are what the Castle paid out. A successful fill moves the hoard by exactly `+amountIn tokenIn` and `−amountOut tokenOut`, and the `hoard` event that follows shows it.
- `strategy` is the strategy the fill drew on. For `v4` it's the strategy whose quote the hook priced at, or `null` if SPEC.md gives the hook no strategy.
- `alloc` is that strategy's allocation **after** the fill, when the service knows it. The page never guesses it.
- `fee` is the v4 hook fee as a bag (usually in `tokenIn`), and `pool` is the v4 pool id. Both are `null` for `aqua`.
- `quoteId` links a fill to the `quote.served` it filled. `intentId` links it to the `intent.routed` fo sent it through.
- `status` is `success` or `reverted`. A reverted tx emits no logs, so the service records the reverted fills it relays and sends them with the error in `revert`. The tx hash is still real and verifiable on Etherscan.

### fo's orders and the crew

| type | body | source |
|---|---|---|
| `intent.routed` | `{ id, source: "UniswapX" \| "mcp" \| "ccip", swapper, swapperName, tokenIn, tokenOut, amountIn, route: "aqua" \| "v4", strategy, by: "fo" }`. `tokenIn` is what the swapper pays. | agent |
| `agent` | `{ id, role, alive, lastBeat, note }`. Send it when an agent's `agent_heartbeat` goes stale or comes back, not once per beat. | agent |

## The demo, in stream order

The mock plays this loop, with time squeezed. The live run should tell the same story:

1. `snapshot` with the hoard, then fee's `price`.
2. fi ships two strategies from the one balance (`strategy.shipped` ×2). The promises gauge fills.
3. fum sets caps (`cap.set`). fi tries a third ship that would promise more than the hoard holds, and it reverts (`allocation.refused`).
4. A solver resolves `quote.feefifofum.eth` (`quote.served`) and fills it (`fill`, `route: "aqua"`, `quoteId` set, then `hoard`).
5. fo routes a UniswapX-style order to the hook (`intent.routed`), and the v4 swap is filled just in time (`fill`, `route: "v4"`, then `hoard`).
6. fum docks a strategy (`strategy.docked`) and the promise goes back to the hoard.
