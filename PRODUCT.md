# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

There are two miniapps, each one classic HTML file with inline CSS and one classic script (no ES modules and no CDN libraries), published to the handoff.lol app market under the ringout publish rules. The dapp, `fee-fi-fo-fum` (version 2.0.2, https://handoff.lol/app/impecc/fee-fi-fo-fum), is built from `miniapp/fee-fi-fo-fum.html` and inlines agent-smith's browser module `miniapp/lib/dapplib.js` at build time. The replay, `fee-fi-fo-fum-tale` (https://handoff.lol/app/impecc/fee-fi-fo-fum-tale), is built from `miniapp/fee-fi-fo-fum-tale.html`. Each build must stay under 100 KB after minification. The validator's text scan flags `eval`, browser storage, cookie access, the Function constructor, redirects, literal external `fetch` URLs and innerHTML concatenation. The site mounts each app in a shadow root and sizes it by its container, not the viewport. The deck (a Slides artifact) and the video script (`docs/video-script.md`) are separate deliverables.

## Users

The operator asked on 2026-09-26 for two audiences to be served equally. The first is the ETHGlobal Tokyo 2026 judges (the 1inch, Uniswap and ENS partners) and viewers of the demo video or the live link, who need to see within seconds that one vault balance backs two strategies, and then make a trade against it from their own wallet. The second is desk operators and handoff agents watching the live vault, who need the exact balance, allocations, leverage limit, quotes and fills.

## Product Purpose

feefifofum is a market-making vault on Ethereum Sepolia. A market maker usually splits its capital across pools and chains, where much of it sits idle, and its posted prices lose value to arbitrage when they go stale (loss-versus-rebalancing, LVR). In feefifofum the vault, CastleVault, is a 1inch Aqua maker whose single USDC and WETH balance backs several SwapVM strategies at once. Aqua records each strategy's allocation as a virtual balance, so tokens move only when a fill happens. Solvers get a signed, short-lived price by resolving the ENS name `quote.feefifofum.eth` through CCIP-Read, and a Uniswap v4 hook fills swaps in a pool that holds no liquidity from the same vault balance. The entry succeeds when a live Sepolia run shows a transaction for each item in docs/SPEC.md, "Done means": two strategies shipped from one balance, a third refused with `OverAllocated`, a quote resolved by name and filled, and a v4 swap filled from the vault.

## Positioning

The same vault balance backs every strategy, and the sum of allocations may exceed that balance up to a leverage limit that the risk agent sets and the vault enforces on-chain. This is safe because a token can leave the vault only once, and a strategy whose allocation would push the total past the limit reverts. Quotes from the RFQ strategy cost the solver no gas to obtain and expire after 30 s, which limits how much a stale price can lose to arbitrage. The v4 pool holds no LP liquidity, and the hook supplies the output from the vault inside the swap transaction.

## Operating Context

- The entry is in the ETHGlobal Tokyo 2026 Continuity track, and submission closes at 2026-09-27 00:00 UTC.
- A crew of four handoff agents runs the vault. fee reads Chainlink ETH/USD and sets the mid price and spread. fi compiles and ships the strategies and signs the quotes. fo routes orders to whichever strategy pays more. fum sets the leverage limit and per-slot caps and docks strategies that would exceed them. The vault service (in `service/`) provides the CCIP-Read gateway, MCP tools for solvers and the event stream documented in `miniapp/STREAM.md`. The outside solver in the demo is the agent agy.
- Everything on-chain runs on Ethereum Sepolia, and every state change is a transaction that can be checked on Etherscan.
- The earlier product, the lease edition, is preserved at tag `lease-edition`.

## Capabilities and Constraints

- Strategies occupy vault slots. `harp` in slot 0 is the RFQ strategy (PriceExtruction), filled by solvers through quotes served over CCIP-Read. `hen` in slot 1 is a constant-product strategy (XYCSwap with a flat fee) that CastleJITHook fills during v4 swaps. `greedy` exists only to be refused by the leverage check.
- fum's leverage limit is 2×, so the allocations on each token may total twice the vault's balance of that token. The live run allocated 1.6×.
- A quote is valid for 30 s. A fill after that reverts with `QuoteExpired`.
- The tokens are Circle USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`) and Sepolia WETH (`0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`). The live run funded the vault with 5.00 USDC and 0.001859 WETH.
- The miniapps hard-code no addresses. They come from `contracts/deployments/sepolia.json` and `miniapp/config.json` at build time.
- After each swap through the v4 pool, fi docks `hen` and ships it again at fee's price a block or two later. While `hen` is docked, the V4Quoter reverts, and the dapp says the hook strategy is being re-priced and asks again every 4 s until it answers.

## Brand Commitments

- The name is feefifofum, and the miniapp slugs are `fee-fi-fo-fum` and `fee-fi-fo-fum-tale`. See `docs/NAMING.md`.
- Writing rule (operator ruling, 2026-09-26 14:35Z). Every text a person might read is plain technical prose: the miniapps, the README, docs/, the sponsor write-ups, FEEDBACK.md, the deck, the video, the service and MCP tool descriptions, and any text on handoff.lol. Sentences are complete and sit in paragraphs, and they name the thing itself: the vault, the RFQ strategy, the v4 hook, a solver, the signer. Text gives numbers, addresses and tx hashes, and it describes what happens in the order it happens. The agent and strategy names fee, fi, fo, fum, harp and hen stay as identifiers, and each is explained once in plain words where it first appears.
- The writing rule excludes one-line paragraphs, dramatic short sentences and sentence fragments; slogans and taglines; colon reveals and "not X, but Y" or "no X, no Y" contrasts; lists of three used for rhythm, rhetorical questions and hype words; bold lead-ins that turn each bullet into a headline; and metaphors that stand in for mechanics, such as a harp that sings, a hen that lays, gold, treasure, a giant, a Jack, songs, seals, or a castle that refuses. A sentence that reads like a LinkedIn post or a movie trailer is rewritten.
- The visual style stays as built and is described in `DESIGN.md`: a white ground with linen panels, ink outlines, flat colours, lettered headings in Almendra Bold, and small line drawings. Every amount is exact and carries its unit.
- Platform rules from impecc apply to both miniapps. They use no smooth gradients, only flat solid colours. They use no abstract network or node pictures in place of content. A standalone page has a light `#fff`-family ground, and the render root holds `contain: layout paint`.

## Evidence on Hand

- The live run of 2026-09-26, 12:43–13:00 UTC (blocks 11786292–11786374), is recorded in `agents/live-run/11786346`, with 17 transactions read from their receipts, the filled quote `q-1790427574-6`, the service's stream and each agent's log.
- The dapp's own live test from the published page on 2026-09-26 used wallet `0x23E524c19d4140F4bB98FEb58bE3cb89b06AFC32`. It filled the RFQ strategy with 0.25 USDC in `0xb825bdd056ac2c8724b3e49dfd9b222dd2652341ad3724d93dc9e714ebb3a59d` and swapped 0.25 USDC through the v4 pool in `0xf840c09a95177625e57420694cb94a06548cd54dd23ae202c13800b567be466b`.
- The scope is fixed in docs/SPEC.md. Prize rules, v4 addresses and the CCIP-Read requirements are in docs/research.md, and the naming is in docs/NAMING.md.

## Product Principles

1. Money is always exact. Amounts, prices, allocations and the vault balance carry their units and link to the transaction or block they come from.
2. Every state the product shows points at a block or a transaction, and nothing on the dapp is simulated.
3. The pages always show how far the one vault balance is committed across both strategies, against fum's limit.
4. A quote either fills while it is valid or reverts, and the dapp fetches a new one before a fill when the first expires.
