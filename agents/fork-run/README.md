# Fork runs

Each directory is one run of `scripts/crew-fork.sh` (`RECORD=<dir>`), named by its fork block. The hashes are fork
transactions: they exist only on that anvil fork, not on Sepolia.

## 11786199 (Sat 26 Sep, 12:24–12:26 UTC)

A fork of live Sepolia taken after c-deploy, so the run used the deployed contracts (`mode: live`): CastleVault
`0x0fa4…7A98`, OffchainQuoteResolver `0x2D18…A76a` (its gateway pointed at the run's service, fork only),
CastleJITHook `0x8901…0888` and `quote.feefifofum.eth` as registered on Sepolia. The hoard was funded as the treasury
will fund it, with fork cheats: 5 USDC plus 5/mid WETH (0.001859 WETH at Chainlink's 2,689.63). The crew ran from this
repo with its real keys against the fork, and the castle service ran from `service/` with fi's key.

| Step | Who | What happened | Gas |
|---|---|---|---|
| 1 | fum | `setLeverage` 2× for WETH and USDC, `setCap` for slots 0–2 | 31,401 + 31,357 + 3 × ~70,565 |
| 1 | fi | `ship` harp (slot 0) and hen (slot 1), each 80% of the hoard (0.0014872 WETH and 4 USDC; hen in the mid ratio) | 238,098 + 223,064 |
| 1 | fi | `ship` greedy (0.5× more, manual 90k gas limit): reverted `OverAllocated(WETH, 3903882690184150, 3717983514461096)`; fi reported it, and the stream shows `allocation.refused` | 66,713 used |
| 2 | agy | `getEnsText(quote.feefifofum.eth, quote:USDC:WETH:500000)` through UniversalResolverV2: OffchainLookup, the gateway's answer signed by fi, checked by the resolver; `router.swap` filled it: 0.5 USDC for 0.000185713 WETH (2,692.32, fee's mid plus its 10 bps) | 157,005 |
| 3 | agy | `PoolSwapTest.swap` 0.5 USDC on the Castle pool; CastleJITHook filled it from hen in the same tx: 0.000164803 WETH | 278,346 |
| 3 | fee, fi | fee saw hen's curve at 3,402.92 against a mid of 2,689.63 (2,096 bps), asked for a re-centre, and fi docked hen and shipped it again at the mid | 47,007 + 223,064 |
| 4 | fo | `castle_route` for a UniswapX-format order (0.5 USDC → WETH): harp 0.000185713 against v4 0.000160666, routed to harp; agy sent the two calls | |
| 5 | agy | the step-2 quote, 31 s later: reverted `QuoteExpired(1790425524)`, recorded through `castle_fill {tx_hash}` | |
| — | fum | 7 ledger checks, 0 docks on the demo path: 80% + 80% sits inside 2× | |
| 6 | service | `service/test/gateway-fork.mjs`: 13 of 13 checks pass (gateway GET and POST verify, 404 for an unknown key, viem CCIP-Read quote honoured by `router.quote`, all five MCP tools, `/stream` v2 replay, `/state`, `/health`) | |
| 7 | fum | stress, outside the demo: a harp fill of 0.000521 WETH pushed committed WETH to 0.0018019 against a limit of 0.0016042; fum docked harp and stopped, hen stayed live | 52,912 |

Files: `run.log` (the script's own account), `0-deploy.json` … `7-stress.json` (each step's JSON line),
`q1.json` (the step-2 quote record as the gateway served it), `state.json` and `stream.jsonl` (the castle stream,
65 events), `deployments.json` (what the crew and service read), `logs/` (fee, fi, fo, fum and the service).
