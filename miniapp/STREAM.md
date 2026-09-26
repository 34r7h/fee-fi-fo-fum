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
  "leases": [ { "kind": "renew", "epoch": "3", "holder": "0x…", "holderAgent": "fee", "expiry": 1790400120, "t": 1790400000000, "block": 9312345, "tx": "0x…" } ],
  "fills": [ /* the last 50 `fill` events, oldest first */ ] }
```

`leases` is the renew and claim history reaching back at least to the oldest fill in `fills`; the replay tab needs it to re-derive those fills. `lease.state` is `LIVE`, `WIND-DOWN` or `FENCED`, derived the same way the extruction derives it (see *Fence rule*). `shifts` is operator config, not chain state. The ring draws it, and the holder shown in the ring always comes from `lease`, never from the shift table.

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
| `lease.rejected` | `{ epoch, holderAgent, call: "renew" \| "ship" \| "multicall", reason }`. A stale holder (for example, fee restarted from old state) was refused on-chain. `tx` is the reverted tx. | service (reverted tx) |
| `castle.relinked` | `{ node, holderNode, holderName, mcpEndpoint }`. `castle.*` now resolves to this shift. | Castle `Relinked` event, or the resolver's link event |
| `strategy.shipped` | `{ hash, epoch, shippedBy, center: {q96, usdcPerWeth}, weth, usdc }` | Aqua ship event (maker = Castle) plus Castle `Shipped` |
| `strategy.docked` | `{ hash, epoch, dockedBy }` | Aqua dock event (maker = Castle) |
| `shift.changed` | `{ from, to, city, auction }`. `auction` is the shift-change CCA address, or `null`. | service (config plus claim) |
| `inventory` | `{ weth, usdc }`: Castle's balances after the tx in `tx`. Send it after every fill, sweep and ship. | `balanceOf(castle)` at that block |
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
| `auction.bid` | `{ auction, bidId, owner, ownerName, maxPrice: {q96, usdcPerWeth}, amount }`: `amount` is the currency committed (USDC, 6 decimals), not WETH | CCA bid event |
| `auction.rejected` | `{ auction, owner, reason: "JackHook" }`. A bidder without an unexpired ENSv2 name. | service (reverted tx, as with fills) |
| `auction.checkpoint` | `{ auction, clearing: {q96, usdcPerWeth}, sold, raised }`. One per checkpoint. **This is the chart's data.** | CCA `checkpoint()` event, or the `clearingPrice()` view per block |
| `auction.cleared` | `{ auction, clearing, sold, raised }`: `sold` (WETH) and `raised` (USDC) are `null` when not known, never 0 | final checkpoint at `endBlock`, or Castle `AuctionSettled` |
| `auction.swept` | `{ auction, currency: "USDC", amount }` | CCA `sweepCurrency()` |
| `price.written` | `{ key: "handoff-price", value: "0x…", price: {q96, usdcPerWeth} }`. The clearing price, written back to ENS. | PermissionedResolver `setData(castle, "handoff-price", …)` |

## Castle v3 additions (agreed with agent-smith)

v3 keeps every event above. Liveness moves off-chain, so these are added:

| Type | Body | Source |
| --- | --- | --- |
| `heartbeat` | `{ epoch, holder, holderAgent, validUntil }` (unix s). One per new beat co-signed by the holder and fo, about every 30 s. | `agent` |
| `lease.challenged` | `{ epoch, challenger, challengerAgent, deadline }` | Castle `Challenged` |
| `lease.responded` | `{ epoch, holder, holderAgent, cooldownUntil }` | Castle `Responded` |
| `lease.claimed` | as above, plus `early: true` when the claim follows an unanswered challenge | Castle `Claimed` |

- Every v3 `fill` carries `heartbeat: { validUntil }` or `null`, parsed from the taker's `instructionsArgs`, and `branch: "live" | "wind-down"` as executed. A v3 taker may leave the heartbeat out, so lease state alone doesn't predict the branch.
- The snapshot carries `castle: { version: 3, address }`, and its `lease` adds `heartbeat: { validUntil }`, `challengeDeadline` and `cooldownUntil`.
- The page derives one more scene itself: when a heartbeat's `validUntil` passes with no newer beat, it tells "the heartbeat stops" at that time. No transaction marks it.
- v3 epochs are a counter and print as `#N`. v2's token-id epochs print as `v0`, `v1` and so on.

## Fence rule (the page and FeeFiFoFumExtruction must agree)

At a fill's block, with the lease's `expiry` and `leaseEpoch` and the strategy's `programEpoch`:

1. `programEpoch != leaseEpoch`: **fenced**. Reverts `FeeFiFoFum()`.
2. otherwise `blockTime > expiry`: **wind-down** (reduce-only, wide spread).
3. otherwise: **live**.

The epoch check comes first. After a claim, an old strategy is fenced whatever the time is.

## Chain-only fallback (the service is down)

The page rebuilds the same events from the chain: Castle logs from the Castle deploy block, Aqua pull/push logs filtered by maker = Castle, CCA logs for each auction Castle opened, and the three views `holder()`, `epoch()` and `expiry()` for the current state. It polls the RPC list from config in order. `agent` and `attestation.withheld` events simply don't appear, and the page shows the agents as unknown, not dead.

## Castle v2 events, as shipped (contracts/out-abi/Castle.json)

These are the logs the chain-only replay reads. mister-anderson confirmed them on 2026-09-26.

```solidity
event Renewed(uint256 indexed epoch, address indexed holder, uint64 expiry, bytes32 attestationDigest);
event Claimed(uint256 indexed epoch, address indexed holder, uint64 expiry, uint256 prevEpoch);
event Relinked(bytes32 indexed node, bytes32 indexed holderNode, string holderLabel);
event Shipped(bytes32 indexed strategyHash, uint256 indexed epoch, uint256 anchorQ96, uint256 weth, uint256 usdc);
event Docked(bytes32 indexed strategyHash, uint256 indexed epoch, address indexed dockedBy);
event PriceWritten(uint256 priceQ96);
event CrewSet(address indexed account, string crewLabel);
```

| Stream event | From |
|---|---|
| `lease.renewed` | `Renewed` |
| `lease.claimed` | `Claimed` (`gapSeconds` = the claim block's time minus the previous `expiry`) |
| `castle.relinked` | `Relinked` (`holderName` = `holderLabel` + `.feefifofum.eth`) |
| `strategy.shipped` | `Shipped` (`center.q96` = `anchorQ96`) |
| `strategy.docked` | `Docked` |
| `price.written` | `PriceWritten` |

**Reverts worth showing** (send them as `fill` with `status: "reverted"` and the error in `revert`):

- `FeeFiFoFum()`: a stale epoch's quote, with `decision: "fenced"`.
- `WindDownReduceOnly(address tokenIn)`: the wrong direction during wind-down, with `decision: "wind-down"`.

For `lease.rejected`, set `reason` to the Castle error: `NotHolder(caller, holder)`, `StaleAttestation(attestedEpoch, epoch)` or `LeaseExpired(expiry)`.

The auction events (`AuctionOpened`, `Dissolved` or their equivalents) are still open with p4-cca. Until they land, the service derives `auction.*` from the CCA factory and the auction's own logs.
