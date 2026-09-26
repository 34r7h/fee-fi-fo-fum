# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The miniapp is one classic HTML file (inline CSS and one classic script: no ES modules, no CDN libraries), published to the handoff.lol app market under the ringout publish rules. It must stay under 100KB after minification. The validator's text scan flags `eval`, browser storage, cookie access, the Function constructor, redirects, literal external `fetch` URLs and innerHTML concatenation. The site mounts the app in a shadow root and sizes it by its container, not the viewport. The deck (a Slides artifact) and the video script (`docs/video-script.md`) are separate.

## Users

Both audiences are served equally (operator, 2026-09-26):
- **Spectators**: ETHGlobal Tokyo 2026 judges (1inch, Uniswap and ENS partners) and viewers of the demo video or the live link. Within seconds they need to see one hoard backing many markets: the promises, the harp's quotes and the hen's fills.
- **Desk operators and agents**: people and handoff agents watching a live castle. They need the exact hoard, promises, leverage, quotes and fills, especially the money.

## Product Purpose

**feefifofum: one hoard, every market.** A market maker's capital is split across pools and chains, and its stale quotes leak value to arbitrage (LVR). In feefifofum one balance in the Castle vault, a 1inch Aqua maker, backs many quotes at once: its SwapVM strategies get promises, not deposits. Solvers find a firm price by asking the ENS name `quote.feefifofum.eth` through CCIP-Read, and Uniswap v4 swaps are filled just in time from the same balance by a hook. Success is a live Sepolia run with a tx for each beat: two strategies from one balance and a greedy one refused `OverAllocated`, a quote found by name and filled, and a v4 swap filled from the Castle (docs/SPEC.md, "Done means").

## Positioning

Shared liquidity with a guard. The same gold backs every market at once, because a coin can be taken only once; fum's leverage bounds how far the promises stretch, and the vault enforces it on-chain. Prices are firm and gasless to discover, and they go stale on time, so a stale quote can't be used against the castle. The v4 pool holds nothing: the hen fills it in the swap's own transaction.

## Operating Context

- An ETHGlobal Tokyo 2026 Continuity-track entry. Submission closes 2026-09-27 00:00 UTC.
- Built by a handoff agent crew: fee (prices), fi (compiles, ships and signs), fo (routes orders) and fum (guards the hoard), plus the castle service (the CCIP-Read gateway, MCP tools for solvers, and the SSE stream in `miniapp/STREAM.md`). The Jack is agy, an outside solver.
- Everything on-chain runs on Ethereum Sepolia, and every state change is an Etherscan-verifiable transaction.
- The earlier product (the lease edition) is preserved at tag `lease-edition`.

## Capabilities and Constraints

- Strategies are vault slots: `harp` (PriceExtruction, filled by solvers through CCIP-Read quotes), `hen` (XYCSwap plus flatFee, filled by CastleJITHook) and `greedy` (exists only to be refused).
- fum's leverage is 2×: the promises on a token may total twice its balance. The demo promises 1.6×.
- A quote is good for 30 s; 31 s later it reverts `QuoteExpired`.
- Tokens: Circle USDC and Sepolia WETH. The live hoard is small (about 10 USDC and 0.004 WETH).
- No hard-coded addresses: they come from `contracts/deployments/sepolia.json` and the castle service's snapshot.

## Brand Commitments

- The name is **feefifofum** (the miniapp's slug is `fee-fi-fo-fum`). See `docs/NAMING.md`.
- Voice: *Jack and the giant*. The giant's three treasures work for one hoard: the bag of gold is the hoard, the harp sings quotes, the hen lays fills. fum is the giant who guards the hoard and roars at a promise too many. Jacks are welcome at the castle: they trade at a fair, fresh price.
- Operator direction (2026-09-26), kept from the lease edition because it was the best part: a **full storybook world**. A medieval vibe, a bit cartoony, gold and treasure, smooth lines, nothing choppy or janky. Keep it fun, but make the money very clear. `DESIGN.md` is the style source.
- Platform hard rules (impecc): no smooth gradients (flat solid colours; hatched stitches are hard-stop patterns); no abstract network or node visuals standing in for content; a light `#fff`-family ground for standalone pages; the miniapp render root holds `contain: layout paint`.

## Evidence on Hand

- The contracts, the gateway and the crew are being built and fork-tested now. The mock stream uses synthetic data, labelled as mock, with no fake Etherscan links.
- Real material: docs/SPEC.md (the locked scope), docs/research.md (prize rules, v4 addresses, the CCIP-Read gate), docs/NAMING.md.

## Product Principles

1. The money is never ambiguous: amounts, prices, promises and the hoard are exact, with units and tx links.
2. Prove on-chain, don't claim. Every state shown points at a block or a tx, or is labelled mock.
3. One hoard, every market: the same balance backs the harp and the hen at once, and the page always shows how far it is stretched.
4. A price is firm and fresh, or it doesn't fill.
