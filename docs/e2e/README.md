# Fork demo, two passes

Harness: `contracts/test/fork/SpecDemoFork.t.sol`, `forge test --match-contract SpecDemoForkTest -vv` from `contracts/`.

Both passes passed. Each pass is a fresh Sepolia fork. Pass 1 uses the test's default block 11785880. Pass 2 sets `FORK_BLOCK=11785881`. Logs: `pass-11785880.log`, `pass-11785881.log`.

The gas figures are `gasleft()` around the call. They do not include the 21,000 base or calldata. These are cheatcode calls, so this harness has no chain transaction hashes. Two broadcast runs, with hashes taken from each run's own output, are still to do.

Not in these passes, because the castle gateway is not live yet:

- a Jack resolving `quote.feefifofum.eth` with viem against `https://handoff.lol/t/castle/ccip/{sender}/{data}.json`
- the stream showing every event

What each pass did check: fum's 2× leverage, `harp` and `hen` shipped at 80% of the hoard, `greedy` at 0.5× reverting `OverAllocated`, `quote` registered in one call, UniversalResolverV2 reverting `OffchainLookup` on a `text()` lookup, the harp fill, the same quote reverting `QuoteExpired` after 31 seconds, a PoolSwapTest swap whose logs include a v4 `Swap` plus Aqua `Pulled` and `Pushed`, and fum docking nothing.
