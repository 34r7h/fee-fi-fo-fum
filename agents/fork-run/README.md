# Fork runs

Each directory here holds one run of `scripts/crew-fork.sh` made with `RECORD=<dir>`, and is named after the block at
which the fork was taken. The transaction hashes are fork transactions, which exist only on that anvil fork and not
on Sepolia.

## 11786199 (Sat 26 Sep, 12:24–12:26 UTC)

This fork of live Sepolia was taken after c-deploy, so the run used the deployed contracts (`mode: live`). These are
CastleVault `0x0fa4…7A98`, OffchainQuoteResolver `0x2D18…A76a` (with its gateway pointed at the run's service, on the
fork only), CastleJITHook `0x8901…0888` and `quote.feefifofum.eth` as registered on Sepolia. The vault was funded the
way the treasury funds it on Sepolia, using fork cheat codes, with 5 USDC plus 5/mid WETH (0.001859 WETH at
Chainlink's 2,689.63). The crew ran from this repository with its real keys against the fork, and the castle service
ran from `service/` with fi's key.

| Step | Who | What happened | Gas |
|---|---|---|---|
| 1 | fum | Set leverage to 2× for WETH and USDC with `setLeverage`, and the caps of slots 0–2 with `setCap` | 31,401 + 31,357 + 3 × ~70,565 |
| 1 | fi | Shipped harp (slot 0) and hen (slot 1), each with 80% of the vault's balance (0.0014872 WETH and 4 USDC, with hen's two sides in the mid ratio) | 238,098 + 223,064 |
| 1 | fi | Shipped greedy, asking for 0.5× more with a manual 90k gas limit. It reverted with `OverAllocated(WETH, 3903882690184150, 3717983514461096)`, fi reported the revert, and the stream shows it as `allocation.refused` | 66,713 used |
| 2 | agy | Called `getEnsText(quote.feefifofum.eth, quote:USDC:WETH:500000)` through UniversalResolverV2. The resolver reverted with OffchainLookup, the gateway answered with a response signed by fi, and the resolver checked it. `router.swap` then filled the quote at 0.5 USDC for 0.000185713 WETH, a price of 2,692.32 (fee's mid plus its 10 bps spread) | 157,005 |
| 3 | agy | Swapped 0.5 USDC on the vault's v4 pool with `PoolSwapTest.swap`. CastleJITHook filled the swap from hen in the same transaction, for 0.000164803 WETH | 278,346 |
| 3 | fee, fi | fee read hen's price at 3,402.92 against a mid of 2,689.63 (2,096 bps apart) and asked for a re-centre, and fi docked hen and shipped it again at the mid | 47,007 + 223,064 |
| 4 | fo | Routed a UniswapX-format order (0.5 USDC to WETH) that arrived through `castle_route`. harp offered 0.000185713 WETH and the v4 pool 0.000160666, so fo routed it to harp, and agy sent the two calls | |
| 5 | agy | Tried the step-2 quote again 31 s later. The fill reverted with `QuoteExpired(1790425524)`, and the attempt was recorded through `castle_fill {tx_hash}` | |
| — | fum | Ran 7 ledger checks and docked nothing on the demo path, because 80% plus 80% is inside the 2× limit | |
| 6 | service | `service/test/gateway-fork.mjs` passed 13 of 13 checks. They cover the gateway's GET and POST answers and their signatures, a 404 for an unknown key, a quote read through viem's CCIP-Read that `router.quote` honours, all five MCP tools, the `/stream` v2 replay, `/state` and `/health` | |
| 7 | fum | In the stress step, outside the demo, a harp fill of 0.000521 WETH pushed committed WETH to 0.0018019 against a limit of 0.0016042. fum docked harp and stopped, and hen stayed live | 52,912 |

The directory holds `run.log` (the script's own log), `0-deploy.json` … `7-stress.json` (each step's JSON line),
`q1.json` (the step-2 quote record as the gateway served it), `state.json` and `stream.jsonl` (the castle stream, 65
events), `deployments.json` (the deployments file the crew and the service read) and `logs/` (the logs of fee, fi,
fo, fum and the service).
