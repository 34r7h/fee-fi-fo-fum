# castle service

The castle agent's MCP server, REST mirrors and the castle stream the miniapp reads. It reads Ethereum Sepolia
and holds no one's key: every write tool returns the exact call to sign.

**Live:** `https://handoff.lol/t/castle/`. It runs on the operator's sandbox host (helen) as systemd user
services and is reached through the castle agent's handoff tunnel. It stays up with the laptop off.

| Route | What |
|---|---|
| `POST /mcp` | MCP over Streamable HTTP (stateless): the seven tools below |
| `GET /tools`, `POST /tools/<name>` | the same tools as REST, JSON in and JSON out |
| `GET /stream` | SSE per `miniapp/STREAM.md` v1: `snapshot` first, then typed events, `id` = `seq`, `Last-Event-ID` resumes |
| `GET /state` | the snapshot as JSON |
| `GET /fills?from_block=N` | every fill attempt since block N, including reverted ones |
| `GET /health` | indexer cursor, last error, watched auctions |

## Tools

| Tool | Does |
|---|---|
| `castle_status` | lease holder, fencing epoch, expiry and LIVE/WIND-DOWN, strategies, inventory, handoff-price, CCA, crew |
| `castle_quote` | `router.quote` on the live strategy; the view path runs the same fence, so a stale epoch quotes as `FeeFiFoFum()` |
| `castle_fill` | builds `router.swap` plus the approval; given `tx_hash`, it records that attempt (a reverted fill emits no logs) |
| `castle_join` | apply to the standby crew |
| `castle_claim` | crew only: the `Castle.claim()` call, simulated, once the lease has expired |
| `auction_status` | the CCA's clearing price (Q96 and USDC per WETH), supply, blocks and hook |
| `auction_bid` | `submitBid(maxPriceQ96, amount, owner, hookData)` plus the USDC approval, simulated against JackHook |

## Where values come from

There is no address in the source. The service reads:
- `contracts/deployments/sepolia.json` (`external` and `contracts`), re-read on every call;
- `contracts/out-abi/<Name>.json`, falling back to upstream interface fragments;
- `agents/crew.json` and `miniapp/config.json`;
- env (`.env.example`).

Agent liveness is each agent's `last_seen` on handoff.lol (agent_heartbeat).

## Hosting (helen)

`deploy/helen/` holds the units as installed:
- `castle-service` is the node server on `:8791`.
- `castle-tunnel` is `tunnel_agent.mjs` as agent `castle`, with `LOCAL=http://localhost:8791`.
- `castle-sync.timer` runs `git pull --ff-only` every 2 minutes and restarts the service when `service/` changes.

The tunnel relays a response only once it has ended, so `CASTLE_SSE_WINDOW_MS=2500` closes each SSE response
after 2.5s. The browser's EventSource reconnects with `Last-Event-ID` and gets every event in order, in batches of up to 2.5s.

```sh
cd service && npm ci && SEPOLIA_RPC_URL=… node src/server.mjs
```
