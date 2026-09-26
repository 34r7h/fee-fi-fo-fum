# castle service

The castle service is the off-chain part of the product, described in [docs/SPEC.md](../docs/SPEC.md) under "The
castle service". It runs the ERC-3668 gateway for `quote.feefifofum.eth`, the MCP tools that solvers call, and the
event stream that the web app reads. It reads Ethereum Sepolia and holds one private key, fi's, which it uses only to
sign quotes. Because it holds no other key, every tool that moves tokens returns unsigned calls for the caller to sign
and send.

The live instance is at `https://handoff.lol/t/castle/`. It runs as systemd user services on the operator's sandbox
host (helen) and is reached through the handoff tunnel of the agent `castle`.

| Route | What it does |
|---|---|
| `GET /ccip/{sender}/{data}.json`, `POST /ccip {sender, data}` | The ERC-3668 gateway for `quote.feefifofum.eth`, described below |
| `POST /mcp` | MCP over Streamable HTTP (stateless), serving the five tools below |
| `GET /tools`, `POST /tools/<name>` | The same tools over REST, with JSON in and JSON out |
| `GET /stream` | Server-sent events as defined in [miniapp/STREAM.md](../miniapp/STREAM.md) v2. A `snapshot` comes first, then typed events whose `id` is their `seq`. `Last-Event-ID` resumes the stream, and `?since=0` replays it from the start. |
| `GET /state` | The snapshot as JSON |
| `GET /health` | Whether fi's key is loaded and fi's address (never the key), whether fo is polling, and the indexer's cursor and last error |
| `POST /report` | A signed report from one of the agents, described under "The stream" |
| `GET /fo/next`, `POST /fo/answer` | The pull channel that `castle_route` uses to reach fo. fo polls for the next order and posts its route, and both requests are signed by fo (`src/fo.mjs`). |

Every route answers with `Access-Control-Allow-Origin: *`.

## The gateway

A solver reads a text record of `quote.feefifofum.eth`, for example with viem's
`getEnsText({ name: 'quote.feefifofum.eth', key: 'quote:USDC:WETH:500000', universalResolverAddress })`.
UniversalResolverV2 calls the OffchainQuoteResolver, which reverts with `OffchainLookup` and this service's URL. The
client then sends the request to the gateway, which answers according to the key.

| Key | Value |
|---|---|
| `quote:<tokenIn>:<tokenOut>:<amountIn>` | A firm quote from the RFQ strategy (`harp`) as one JSON line. Tokens are `USDC` or `WETH`, and amounts are in base units. |
| `castle` | The CastleVault address |
| any other key | `404 {message}` |

The answer is `{data: abi.encode(bytes result, uint64 expires, bytes sig)}`. `sig` is fi's signature over
`keccak256(abi.encodePacked(hex"1900", resolver, expires, keccak256(callData), keccak256(result)))`, which is the
format of the ENS offchain resolver's SignatureVerifier, and the resolver checks it in `resolveWithProof`.

The service prices each quote from the latest signed price report of fee, the agent that reads Chainlink ETH/USD and
sets the mid price and spread. It takes the mid price and widens it by fee's spread against the solver. fi, the agent
that signs quotes, signs the result as an EIP-712 `Quote` under PriceExtruction's domain, and the quote is valid for
30 seconds. Before the service returns a quote, it checks the quote with `router.quote` and against harp's Aqua
allocation and the vault's balance, so that any quote it serves can be filled with `router.swap` until `validUntil`.
The record carries `takerTraitsAndData`, which the solver passes to
`router.swap(order, tokenIn, tokenOut, amountIn, takerTraitsAndData)` after approving the router for `amountIn`. If
fee has not reported a price for more than 60 seconds, or if harp is not shipped, the gateway answers `503` and serves
no quote.

## Tools

| Tool | What it returns |
|---|---|
| `castle_status` | The vault's USDC and WETH balances, fee's latest price and whether it is fresh, the active strategies, which agents are reporting, and the contract addresses |
| `castle_quote {tokenIn, tokenOut, amountIn}` | The same JSON as the ENS text record, for agents that do not resolve ENS |
| `castle_fill {quoteId, taker?}` | The unsigned approve and `router.swap` calls for a quote. Given `tx_hash` instead, it records that fill attempt, because a reverted fill emits no logs. |
| `castle_allocations` | The balance, committed amount, headroom and leverage limit of each token, and the slot, allocation, cap and fill count of each strategy |
| `castle_route {order}` | The route that fo chooses for a UniswapX-format order, either the RFQ strategy or the v4 pool depending on which pays more, with calldata |

fo is the agent that receives UniswapX-format orders and routes each one. `castle_route` reaches fo in one of two
ways. If `FO_URL` is set, the service posts the order to fo's `/route`. Otherwise fo polls the service with
`GET /fo/next`, a long poll of up to 15 seconds, and posts its route back with `POST /fo/answer`. Both requests are
signed by fo's key (EIP-191 over `castle-fo/1`) and checked against `agents/crew.json`. The tool answers within 20
seconds, or reports that fo is not polling.

## The stream

The indexer polls the chain every `CASTLE_POLL_SECONDS` seconds. It reads the CastleVault's events (`Shipped`,
`Docked`, `CapSet` and `LeverageSet`), the vault's token balances, which change with deposits and withdrawals, and
the router's `Swapped` events whose maker is the vault. A fill whose taker is CastleJITHook gets `route: "v4"`,
because the v4 hook filled it just in time from the `hen` strategy, and any other fill gets `route: "aqua"`. Each
fill is linked to the quote named in its takerData (`quoteId`) and to the order that fo routed (`intentId`).

The rest of the stream comes from the agents as signed reports. fee reports `price`, fo reports `intent.routed`, and
fi reports a `greedy` ship that reverted as `allocation.refused`, with the vault's error decoded from the transaction.
Every agent also sends liveness reports. Each report is signed with EIP-191 by the agent's own Sepolia key and checked
against `agents/crew.json`. The service rejects a report that is more than 5 minutes old or whose type that agent may
not send. Events are written to `$CASTLE_DATA_DIR/events-<vault>.jsonl`, so a restarted service resumes where it
stopped, and a new vault address starts a new stream.

## Where values come from

The source contains no addresses. The service reads its values from the following places:
- `contracts/deployments/sepolia.json` (`external` and `contracts`), which it reads again on every call;
- `contracts/out-abi/<Name>.json`, falling back to the interface fragments in `src/abi.mjs`;
- `agents/crew.json` for the agents' addresses, and `miniapp/config.json` for display names;
- fi's key from the file at `CASTLE_FI_KEY_PATH`, which holds one 0x-prefixed key, has mode 0600 and is kept outside
  the repo;
- the environment, as listed in `.env.example`.

## Test

```sh
npm test                                   # lib/ccip-sign.mjs against the contracts' own vectors
node test/gateway-fork.mjs --service <url> --rpc <rpc> --deployments <file>   # a running service, end to end
```

`agents/scripts/crew-fork.sh` runs the whole demo on an anvil fork with this service and the agents, and finishes by
running `test/gateway-fork.mjs`.

## Hosting (helen)

`deploy/helen/` holds the systemd units as they are installed:
- `castle-service` runs the node server on port 8791 with `~/.config/castle/castle.env` (see `castle.env.example`);
- `castle-tunnel` runs `tunnel_agent.mjs` as the agent `castle`, with `LOCAL=http://localhost:8791`;
- `castle-sync.timer` runs `sync.sh` every 2 minutes. The script updates the checkout with `git pull --ff-only` and
  restarts the service when a file under `service/` changed, so every change to `service/` must start cleanly.

During judging, the checkout on helen follows the tag `live-run` instead of `main` (WORKLOG, Sat 13:17Z), so a change
to `service/` reaches the live service only after that tag moves.

The tunnel relays a response only after the response has ended, so `CASTLE_SSE_WINDOW_MS=2500` closes each SSE
response after 2.5 seconds. The browser's EventSource then reconnects with `Last-Event-ID` and receives every event
in order, in batches of up to 2.5 seconds.

```sh
cd service && npm ci && SEPOLIA_RPC_URL=… CASTLE_FI_KEY_PATH=… node src/server.mjs
```

The service of the earlier lease edition, with the lease, CCA and crew tools and stream v1, is at tag
`lease-edition`.
