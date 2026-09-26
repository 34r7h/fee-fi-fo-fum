# Naming and voice

The product is **feefifofum**: one hoard, every market. Forward-facing copy (the README, the miniapp, the deck, the video, social posts and the sponsor write-ups) keeps the **Jack and the giant** voice and the Castle Tapestry look: a medieval storybook, gold and treasure, smooth lines, and money always clear. impecc owns that copy.

## The story

The giant's castle holds one hoard. In the old tale, Jack climbs the beanstalk and carries off the giant's treasures one at a time: the bag of gold, the hen that lays golden eggs, and the harp that sings.

In feefifofum, the treasures work for the hoard instead of being stolen from it.

- **The hoard** is the Castle vault's single balance. It never leaves the Castle to back a quote. 1inch Aqua records a promise per strategy and pulls tokens only when a trade fills.
- **The harp** sings quotes. Any Jack (a solver) asks `quote.feefifofum.eth` and hears a firm, signed price through ENS CCIP-Read, without paying gas for the question. A song that is 31 seconds old no longer fills.
- **The hen** lays fills. A Uniswap v4 pool with no LP deposit is filled just in time from the hoard.
- **fum's promises** are bounded. The hoard may promise more than it holds, but only up to fum's leverage, and a greedy promise beyond that is refused on-chain.

Jacks are welcome at the castle. They trade with it at a fair, fresh price, and a stale quote can't be used against it.

The four agents are the four syllables of the chant:

| Agent | Syllable | Role |
|---|---|---|
| fee | Fee | Prices: reads the market and sets the mid and spread. |
| fi | Fi | Compiles the SwapVM programs, ships them from the Castle, and signs every quote. |
| fo | Fo | Routes intents: sends a UniswapX-format order to the harp or the hen, whichever pays more. |
| fum | Fum | Guards the hoard: sets leverage and caps, and docks a strategy the hoard can no longer cover. |

## Identifier map

| Concept | Identifier |
|---|---|
| The Castle vault (the hoard) | `CastleVault.sol` |
| The harp: firm quotes that go stale on time | slot 0 `harp`, priced by `PriceExtruction.sol` |
| The hen: the v4 pool filled from the Castle | slot 1 `hen`, filled by `CastleJITHook.sol` |
| The greedy promise fum refuses | slot 2 `greedy`, error **`OverAllocated`** |
| The harp's name | `quote.feefifofum.eth`, resolved by `OffchainQuoteResolver.sol` |
| The castle service | `service/`, at `https://handoff.lol/t/castle/` |
| The miniapp | `miniapp/fee-fi-fo-fum.html` |
| MCP tools | `castle_status`, `castle_quote`, `castle_fill`, `castle_allocations`, `castle_route` |

The lease edition's names (`Castle.sol`, `FeeFiFoFumExtruction`, `JackHook`, `castle.feefifofum.eth` as a lease) belong to the retired product at tag `lease-edition`.
