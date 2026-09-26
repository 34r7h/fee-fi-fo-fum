# Castle stream: the event schema the miniapp reads

`miniapp/fee-fi-fo-fum.html` renders the castle from one ordered stream of events. The castle service
(`service/`, owned by handoff-claude) serves it live. The page's built-in mock plays the same events on a timer,
and the chain-only fallback rebuilds them from Sepolia logs. **The live stream, the mock and the fallback all go
through one reducer**, so anything the stream can say, the page can already draw.

Owner of this schema: impecc. If you need a field changed, message impecc; don't fork the shape.

## Transport

| Route | What it returns |
|---|---|
| `GET /stream` | **SSE**. The first frame is `snapshot`, then one frame per event, in order. `id:` is the event's `seq`, so `Last-Event-ID` resumes. Send a `: ping` comment every 15s. |
| `GET /state` | The same `snapshot` body as plain JSON, for one-shot reads and for the card face. |
| `GET /fills?from_block=N` | Every fill **attempt** since block N, including reverted ones (see *Reverted fills* below). |

- The service must send `Access-Control-Allow-Origin: *`, because the page is served from `handoff.lol` and reads the service cross-origin. handoff.lol sets no CSP on bundles, so `connect-src` isn't a blocker.
- Each SSE frame is `event: <type>` plus `data: <one JSON line>`. `type` is also inside the JSON, so a client that ignores `event:` still works.
- The page learns the service URL from its publish-time config (below). Later, it can resolve it from `castle.feefifofum.eth`'s ENSIP-26 `agent-endpoint[mcp]` record: `/stream` sits beside the MCP endpoint.

## Where the addresses come from (no hard-coded values)

The publish script reads `contracts/deployments/sepolia.json` and a small `miniapp/config.json` (the service URL, public Sepolia RPC URLs, and the shift table) and inlines both into the bundle as one JSON block. The page has no literal addresses in its source. The live service repeats the same values in `snapshot.config`, and **the service wins** when the two differ.

## Envelope (every event)

```json
{ "v": 1, "seq": 1042, "type": "lease.renewed", "t": 1790400000123,
  "block": 9312345, "tx": "0x…", "src": "chain" }
```

| Field | Meaning |
|---|---|
| `v` | Schema version. This file is `1`. |
| `seq` | Monotonic per stream. It's the SSE `id`. |
| `t` | Unix ms. On chain events it is the **block timestamp** (×1000), not the time the service saw the event. |
| `block`, `tx` | Present on chain events, and `null` on off-chain ones (heartbeats, withheld attestations). |
| `src` | `chain` (read from a log or view), `service` (seen by the castle service only, such as a reverted fill it relayed), `agent` (agent_heartbeat or fo's channel) or `derived` (computed from time, such as `lease.expired`). |

Integers that can exceed 2^53 (amounts, Q96 prices, token ids) are **decimal strings**. Every price is sent twice: `q96` (raw, as the contracts store it) and `usdcPerWeth` (a decimal string the page can print).

## Events

### `snapshot`: the whole castle now (first frame, and the body of `GET /state`)

```json
{ "type": "snapshot",
  "config": { "chainId": 11155111, "explorer": "https://sepolia.etherscan.io",
    "name": "castle.feefifofum.eth", "labelhash": "0x…",
    "castle": "0x…", "aqua": "0x…", "router": "0x…", "extruction": "0x…", "jackHook": "0x…",
    "ccaFactory": "0x…", "registry": "0x…", "resolver": "0x…", "usdc": "0x…", "weth": "0x…",
    "leaseSeconds": 120, "renewEverySeconds": 40, "graceSeconds": 0 },
  "shifts": [ { "city": "Tokyo", "tz": "Asia/Tokyo", "startUtc": "00:00", "endUtc": "08:00", "agent": "fee" } ],
  "agents": [ { "id": "fee", "role": "shift trader", "addr": "0x…", "ens": "fee.feefifofum.eth", "alive": true, "lastBeat": 1790400000000 } ],
  "lease":  { "holder": "0x…", "holderAgent": "fee", "epoch": "3", "expiry": 1790400120, "state": "LIVE" },
  "strategies": [ { "hash": "0x…", "epoch": "3", "shippedBy": "fee", "center": { "q96": "…", "usdcPerWeth": "2412.50" }, "docked": false } ],
  "inventory": { "weth": "5000000000000000000", "usdc": "12000000000" },
  "price": { "q96": "…", "usdcPerWeth": "2412.50", "block": 9312000, "tx": "0x…" },
  "auction": null,
  "fills": [ /* the last 50 `fill` events, oldest first */ ] }
```

`lease.state` is `LIVE`, `WIND-DOWN` or `FENCED`, derived the same way the extruction derives it (see *Fence rule*). `shifts` is operator config, not chain state. The ring draws it, and the holder shown in the ring always comes from `lease`, never from the shift table.

### Agents and liveness

| type | data | src |
|---|---|---|
| `agent` | `{ id, role, alive, lastBeat, addr, ens }`. Send it when an agent's `agent_heartbeat` goes stale (more than 2 renew periods) or comes back. Don't send one per beat. | `agent` |
| `attestation.withheld` | `{ epoch, holderAgent, reason }`. fo refused to sign a renewal (the trader hung or quoted off-market). | `agent` |
| `incident` | `{ id, kind, epoch, summary, channelMsg }`. fo's incident report, as posted to the handoff channel. | `agent` |

### The lease (ENS) and the castle

| type | data | on-chain source |
|---|---|---|
| `lease.renewed` | `{ epoch, holder, holderAgent, expiry, attestor: "fo", digest }` | Castle `Renewed` event (requested below) |
| `lease.expired` | `{ epoch, expiry }`. Emitted once, the first block whose timestamp is past `expiry` with no claim. `block` is that block and `tx` is `null`. | derived: `block.timestamp > Castle.expiry()` |
| `lease.claimed` | `{ epoch, prevEpoch, holder, holderAgent, expiry, gapSeconds }`. `gapSeconds` = claim block time minus the old expiry: the length of the wind-down window. | Castle `Claimed` event |
| `castle.relinked` | `{ node, holderNode, holderName, mcpEndpoint }`. `castle.*` now resolves to this shift. | Castle `Relinked` event, or the resolver's link event |
| `strategy.shipped` | `{ hash, epoch, shippedBy, center: {q96, usdcPerWeth}, weth, usdc }` | Aqua ship event (maker = Castle) plus Castle `Shipped` |
| `strategy.docked` | `{ hash, epoch, dockedBy }` | Aqua dock event (maker = Castle) |
| `shift.changed` | `{ from, to, city, auction }`. `auction` is the shift-change CCA address, or `null`. | service (config plus claim) |
| `castle.dissolved` | `{ caller, auction }`. Anyone called the permissionless `dissolve()`. | Castle `Dissolved` event |

### Fills (1inch Aqua through our SwapVM router)

```json
{ "type": "fill", "id": "0xtx…:0", "taker": "0x…", "takerName": "jack.eth",
  "tokenIn": "USDC", "tokenOut": "WETH", "amountIn": "250000000", "amountOut": "103600000000000000",
  "strategy": "0x…", "programEpoch": "3", "leaseEpoch": "3", "expiry": 1790400120,
  "decision": "live", "status": "success", "revert": null }
```

- `decision` is `live`, `wind-down` or `fenced`. `status` is `success` or `reverted`, and `revert` is `"FeeFiFoFum()"` when fenced.
- `programEpoch` is the epoch baked into the strategy, and `leaseEpoch` and `expiry` are Castle's values **at the fill's block**. From those three and the block time the page re-derives `decision` itself in the replay tab, and flags any event whose `decision` disagrees.
- Successful fills come from the Aqua `pull`/`push` logs in the router's `swap` tx.

**Reverted fills.** A reverted tx emits no logs, so a `FeeFiFoFum()` revert cannot be found with `eth_getLogs`. The service records every fill it relays through `castle_fill` (and any the agents report) and serves them in `/fills`. The tx hash is still real and verifiable on Etherscan. In chain-only mode the replay tab says plainly that reverted attempts need the service.

### The auction (Uniswap CCA, gated by JackHook)

| type | data | on-chain source |
|---|---|---|
| `auction.opened` | `{ auction, kind: "shift-change" \| "dissolution", amount, floor: {q96, usdcPerWeth}, startBlock, endBlock, hook }` | CCA factory creation event, plus Castle `AuctionOpened` |
| `auction.bid` | `{ auction, bidId, owner, ownerName, maxPrice: {q96, usdcPerWeth}, amount }` | CCA bid event |
| `auction.rejected` | `{ auction, owner, reason: "JackHook" }`. A bidder without an unexpired ENSv2 name. | service (reverted tx, as with fills) |
| `auction.checkpoint` | `{ auction, clearing: {q96, usdcPerWeth}, sold, raised }`. One per checkpoint. **This is the chart's data.** | CCA `checkpoint()` event, or the `clearingPrice()` view per block |
| `auction.cleared` | `{ auction, clearing, sold, raised }` | final checkpoint at `endBlock` |
| `auction.swept` | `{ auction, currency: "USDC", amount }` | CCA `sweepCurrency()` |
| `price.written` | `{ key: "handoff-price", value: "0x…", price: {q96, usdcPerWeth} }`. The clearing price, written back to ENS. | PermissionedResolver `setData(castle, "handoff-price", …)` |

## Fence rule (the page and FeeFiFoFumExtruction must agree)

At a fill's block, with the lease's `expiry` and `leaseEpoch` and the strategy's `programEpoch`:

1. `programEpoch != leaseEpoch`: **fenced**. Reverts `FeeFiFoFum()`.
2. otherwise `blockTime > expiry`: **wind-down** (reduce-only, wide spread).
3. otherwise: **live**.

The epoch check comes first. After a claim, an old strategy is fenced whatever the time is.

## Chain-only fallback (the service is down)

The page rebuilds the same events from the chain: Castle logs from the Castle deploy block, Aqua pull/push logs filtered by maker = Castle, CCA logs for each auction Castle opened, and the three views `holder()`, `epoch()` and `expiry()` for the current state. It polls the RPC list from config in order. `agent` and `attestation.withheld` events simply don't appear, and the page shows the agents as unknown, not dead.

## Asks for the contracts (mister-anderson, korg)

Replaying from `eth_getLogs` is far cheaper and more honest than polling views block by block. Please have Castle emit:

```solidity
event Renewed(uint256 indexed epoch, address indexed holder, uint64 expiry, bytes32 attestationDigest);
event Claimed(uint256 indexed epoch, address indexed holder, uint64 expiry, uint256 prevEpoch);
event Relinked(bytes32 indexed node, bytes32 holderNode);
event Shipped(bytes32 indexed strategyHash, uint256 indexed epoch, uint256 centerQ96, uint256 weth, uint256 usdc);
event AuctionOpened(address indexed auction, uint8 kind, uint256 amount, uint256 floorQ96, uint64 startBlock, uint64 endBlock);
event PriceWritten(uint256 priceQ96);
event Dissolved(address indexed caller, address indexed auction);
```

The exact names are yours. What matters is that each state change the demo shows lands as one log with the epoch in it.
