# castle service

The Castle's front door ([docs/SPEC.md](../docs/SPEC.md), "The castle service"): the ERC-3668 gateway behind
`quote.feefifofum.eth`, the MCP tools solvers use, and the castle stream the miniapp reads. It reads Ethereum
Sepolia, holds fi's key to sign quotes, and holds no one else's: every tool that moves tokens returns the calls for
the caller to sign.

**Live:** `https://handoff.lol/t/castle/`. It runs on the operator's sandbox host (helen) as systemd user services
and is reached through the castle agent's handoff tunnel.

| Route | What |
|---|---|
| `GET /ccip/{sender}/{data}.json`, `POST /ccip {sender, data}` | The ERC-3668 gateway for `quote.feefifofum.eth` (below) |
| `POST /mcp` | MCP over Streamable HTTP (stateless): the five tools below |
| `GET /tools`, `POST /tools/<name>` | The same tools as REST, JSON in and JSON out |
| `GET /stream` | SSE per [miniapp/STREAM.md](../miniapp/STREAM.md) v2: `snapshot` first, then typed events, `id` = `seq`; `Last-Event-ID` resumes and `?since=0` replays |
| `GET /state` | The snapshot as JSON |
| `GET /health` | `fiKeyLoaded` and fi's address (never the key), `foPolling`, the indexer's cursor and last error |
| `POST /report` | A crew member's signed report (below) |
| `GET /fo/next`, `POST /fo/answer` | fo's pull channel for `castle_route`: fo polls for the next order and posts its route, both signed by fo (`src/fo.mjs`) |

Every route answers with `Access-Control-Allow-Origin: *`.

## The gateway

A solver asks for a text record of `quote.feefifofum.eth`, for example with viem:
`getEnsText({ name: 'quote.feefifofum.eth', key: 'quote:USDC:WETH:500000', universalResolverAddress })`.
UniversalResolverV2 reaches the OffchainQuoteResolver, which reverts `OffchainLookup` with this service's URL, and
the gateway answers:

| Key | Value |
|---|---|
| `quote:<tokenIn>:<tokenOut>:<amountIn>` | harp's firm quote as one JSON line (tokens `USDC` or `WETH`, amounts in base units) |
| `castle` | The CastleVault address |
| anything else | `404 {message}` |

The answer is `{data: abi.encode(bytes result, uint64 expires, bytes sig)}`, where `sig` is fi's signature over
`keccak256(abi.encodePacked(hex"1900", resolver, expires, keccak256(callData), keccak256(result)))` (the ENS
offchain-resolver SignatureVerifier), which the resolver checks in `resolveWithProof`. A quote is priced from fee's
latest signed price (mid widened by fee's spread against the solver), signed by fi as an EIP-712 `Quote` under
PriceExtruction's domain, and valid for 30 s. Before anyone sees it, the service checks it with `router.quote` and
against harp's Aqua allocation and the vault's balance, so a quote it serves is one `router.swap` fills until
`validUntil`. The record carries `takerTraitsAndData`, ready for `router.swap(order, tokenIn, tokenOut, amountIn,
takerTraitsAndData)` after the solver approves the router. With fee silent for over 60 s, or harp not shipped, the
gateway answers `503` and no quote goes out.

## Tools

| Tool | Does |
|---|---|
| `castle_status` | The hoard, fee's price and whether it is fresh, the live strategies, which agents are up, the contracts |
| `castle_quote {tokenIn, tokenOut, amountIn}` | The same JSON as the ENS record, for agents that skip ENS |
| `castle_fill {quoteId, taker?}` | The unsigned approve and `router.swap` calls for a quote; given `tx_hash`, it records that attempt (a reverted fill emits no logs) |
| `castle_allocations` | Per token: balance, committed, headroom, leverage. Per strategy: slot, allocation, cap, fills |
| `castle_route {order}` | fo's route for a UniswapX-format order: harp or the v4 pool, whichever pays more, with calldata. With `FO_URL` set the service posts the order to fo's `/route`; without it, fo's poll takes the order (`GET /fo/next`, a long poll of up to 15 s) and posts the route back (`POST /fo/answer`), each signed by fo's key (EIP-191 over `castle-fo/1`, checked against `agents/crew.json`), and the tool answers within 20 s or says fo is not polling |

## The stream

The indexer polls the chain every `CASTLE_POLL_SECONDS` for the CastleVault's events (`Shipped`, `Docked`,
`CapSet`, `LeverageSet`), the vault's balances (deposits and withdrawals), and the router's `Swapped` events whose
maker is the vault. A fill whose taker
is CastleJITHook is `route: "v4"`, filled just in time from hen; any other is `route: "aqua"`. A fill is linked to
the quote in its takerData (`quoteId`) and to the order fo routed (`intentId`). The off-chain half comes from the
crew as signed reports: fee's `price`, fo's `intent.routed`, fi's reverted greedy ship (`allocation.refused`, the
vault's error decoded from the tx), and liveness beats. Each report is EIP-191 by the agent's own Sepolia key,
checked against `agents/crew.json`, at most 5 minutes old, and limited to that agent's types. Events persist to
`$CASTLE_DATA_DIR/events-<vault>.jsonl`, so a restart resumes where it stopped and a new vault starts a new stream.

## Where values come from

There is no address in the source. The service reads:
- `contracts/deployments/sepolia.json` (`external` and `contracts`), re-read on every call;
- `contracts/out-abi/<Name>.json`, falling back to interface fragments in `src/abi.mjs`;
- `agents/crew.json` (the crew's addresses) and `miniapp/config.json` (display names);
- fi's key from `CASTLE_FI_KEY_PATH`: a file holding one 0x-prefixed key, mode 0600, outside the repo;
- env (`.env.example`).

## Test

```sh
npm test                                   # lib/ccip-sign.mjs against the contracts' own vectors
node test/gateway-fork.mjs --service <url> --rpc <rpc> --deployments <file>   # a running service, end to end
```

`agents/scripts/crew-fork.sh` runs the whole demo on an anvil fork with this service and the crew, and ends with
`test/gateway-fork.mjs`.

## Hosting (helen)

`deploy/helen/` holds the units as installed:
- `castle-service` is the node server on `:8791`, with `~/.config/castle/castle.env` (see `castle.env.example`).
- `castle-tunnel` is `tunnel_agent.mjs` as agent `castle`, with `LOCAL=http://localhost:8791`.
- `castle-sync.timer` runs `git pull --ff-only` every 2 minutes and restarts the service when `service/` changes,
  so a push to `service/` must start cleanly.

The tunnel relays a response only once it has ended, so `CASTLE_SSE_WINDOW_MS=2500` closes each SSE response
after 2.5 s. The browser's EventSource reconnects with `Last-Event-ID` and gets every event in order, in batches
of up to 2.5 s.

```sh
cd service && npm ci && SEPOLIA_RPC_URL=… CASTLE_FI_KEY_PATH=… node src/server.mjs
```

The lease edition's service (lease, CCA and crew tools, stream v1) is at tag `lease-edition`.
