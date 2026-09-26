# Naming and writing style

The product is named **feefifofum**. The web app's slug is `fee-fi-fo-fum`.

## How we write

Everything a person might read is written in plain technical prose. That includes the web app, the tale page, the README, the docs, the sponsor write-ups, the deck, the video, form text, and the service's and MCP tools' descriptions. The operator set this rule on Sat 26 Sep.

Write full sentences in paragraphs. Name the component (the vault, the RFQ strategy, the v4 hook, a solver, the signer) and describe what happens in the order it happens, with numbers, addresses and transaction hashes.

Do not use:
- one-line paragraphs, dramatic short sentences or fragments;
- slogans or taglines;
- colon reveals, "not X, but Y" contrasts, lists of three for rhythm, rhetorical questions or hype words;
- bold lead-ins that turn every bullet into a headline;
- metaphors in place of mechanics, such as a harp that sings, a hen that lays, gold, a giant or a Jack.

If a sentence reads like a social media post or a movie trailer, rewrite it.

The visual style (DESIGN.md) is separate and stays.

## Names

The four agents that operate the vault take their names from the syllables of the product name. Each is explained once in plain words where it first appears.

| Agent | What it does |
|---|---|
| fee | Reads Chainlink ETH/USD and sets the mid price and spread. |
| fi | Compiles the SwapVM programs, ships and docks strategies on the vault, and signs every quote. |
| fo | Receives UniswapX-format orders and sends each one to the RFQ strategy or the v4 pool, whichever pays more. |
| fum | Sets each token's leverage limit and each slot's cap. |

The vault's strategy slots also have short names, used as identifiers:

| Slot | Name | What it is |
|---|---|---|
| 0 | `harp` | The RFQ strategy, priced by `PriceExtruction.sol` from quotes that fi signs. Solvers get quotes through `quote.feefifofum.eth`. |
| 1 | `hen` | The strategy that fills the Uniswap v4 pool, through `CastleJITHook.sol` (XYCSwap plus a flat fee). |
| 2 | `greedy` | A strategy that asks for more than the leverage limit allows, used in the live run to show the vault reverting `OverAllocated`. |

## Identifiers

| Component | Identifier |
|---|---|
| The vault | `CastleVault.sol` |
| The RFQ pricing instruction | `PriceExtruction.sol` |
| The v4 hook | `CastleJITHook.sol` |
| The quote name and its resolver | `quote.feefifofum.eth`, `OffchainQuoteResolver.sol` |
| The off-chain service | `service/`, at `https://handoff.lol/t/castle/` |
| The web app | `miniapp/fee-fi-fo-fum.html`, at `https://handoff.lol/app/impecc/fee-fi-fo-fum` |
| The retelling of the live run | `miniapp/fee-fi-fo-fum-tale.html`, at `https://handoff.lol/app/impecc/fee-fi-fo-fum-tale` |
| MCP tools | `castle_status`, `castle_quote`, `castle_fill`, `castle_allocations`, `castle_route` |

The earlier product's names (`Castle.sol`, `FeeFiFoFumExtruction`, `JackHook`, and `castle.feefifofum.eth` as a lease) belong to the lease edition at tag `lease-edition`.
