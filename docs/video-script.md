# feefifofum: demo video script and shot list

For the ETHGlobal Tokyo 2026 submission (Continuity track: 1inch Aqua, Uniswap and ENS). The lease edition's script is kept at tag `lease-edition`.

- **Length:** about 3:30, and never more than 4:00.
- **Picture:** 1920×1080 (720p minimum), recorded in real time, no speed-up.
- **Voice:** one voiceover by the operator, spoken slowly over live footage.
- **Screens:** the live miniapp on handoff.lol, a terminal running agy (the outside Jack), and Sepolia Etherscan.

Every transaction shown is a real Sepolia tx from the one live run (a-live), except the `QuoteExpired` beat, which runs on a Sepolia fork and is captioned "Sepolia fork". Every value in [brackets] is filled from a-live's output. None may be invented.

## The footage

The live run follows the demo in docs/SPEC.md. Record it once, in real time:

- **Miniapp, three views, for the whole run:**
  - `top`: the chant, the hoard, and the promises gauge with fum.
  - `treasures`: the harp and the hen.
  - `tale`: the tapestry and the fills ledger.
- **Clock:** the page prints times in the viewer's clock, so note its offset from UTC.
- **Terminal:** agy's solver run.
  - `getEnsText` on `quote.feefifofum.eth`: the `OffchainLookup`, the gateway's answer and the verified quote.
  - The fill through the SwapVM router.
  - The v4 swap through PoolSwapTest.
- **Etherscan stills:** one 1920×1080 PNG for each tx in the table below. Open the logs tab where the beat is a log: `LeverageSet`, `Shipped`, the v4 `Swap`, and Aqua's `Pulled` and `Pushed`.
- **Fork clip:** the same quote refilled 31 s later, reverting `QuoteExpired(validUntil)`. It comes from agy's fork pass (v-e2e).
- **Reverted txs:** Etherscan may show only "execution reverted" for them. Put the error name and its arguments in a caption.

### Live run timeline

| UTC | What happens | Tx | On the page |
|---|---|---|---|
| [__] | fum sets leverage to 2× for USDC and WETH, and sets the slot caps | [tx] | Tapestry: "Here fum lets each coin be promised twice". fum’s leverage reads "2× USDC · 2× WETH" |
| [__] | fi ships `harp` (slot 0, PriceExtruction) for 80% of the hoard | [tx] | A gold thread fills the gauge to 0.8× |
| [__] | fi ships `hen` (slot 1, XYCSwap plus flatFee) for 80% of the hoard | [tx] | A second thread runs past the hoard's mark to 1.6× |
| [__] | fi ships `greedy`, asking for another 0.5×. It reverts `OverAllocated(USDC, [committedAfter], [limit])` | [reverted tx] | The ask runs hatched past fum's line, the giant roars, and the page reads "fum refused greedy" |
| [__] | agy resolves `quote.feefifofum.eth` for `quote:USDC:WETH:[n]` over CCIP-Read | gateway log | The harp card: the four steps tick and the 30 s bar runs |
| [__] | agy fills the quote through the router: [__ USDC] in, [__ WETH] out | [tx] | "taken by agy". The hoard and the harp's thread move by those exact amounts |
| [__] | agy swaps [__ USDC] for [__ WETH] on the v4 pool, and the hook fills it from `hen` | [tx] | The hen lays an egg, and the card shows the hoard's exact change |

## Shot list

| # | Time | Picture | Voiceover | Proof on screen |
|---|---|---|---|---|
| 1 | 0:00–0:15 | The `top` view, with a slow push-in on the chant. | "Fee, fi, fo, fum..." | https://handoff.lol/app/impecc/fee-fi-fo-fum in the address bar |
| 2 | 0:15–0:35 | Deck slide 2 (scattered gold), then back to the hoard panel. | "A market maker's gold is scattered..." | – |
| 3 | 0:35–1:05 | **Beat 1.** `top`: fum's leverage lands, then the harp's and the hen's threads fill the gauge past the hoard's mark to 1.6×. Then the Etherscan still of the hen's `Shipped` log. | "feefifofum keeps one hoard..." | The leverage [tx], the harp [tx] and the hen [tx] |
| 4 | 1:05–1:25 | `top`: greedy's ask runs hatched past fum's line, the giant roars, and the page reads "fum refused greedy". Then the Etherscan still of the reverted ship, captioned `OverAllocated(USDC, [committedAfter], [limit])`. | "fum, the guard..." | [reverted tx] |
| 5 | 1:25–2:05 | **Beat 2.** Terminal: agy's `getEnsText` shows the `OffchainLookup`, the gateway and the verified quote. Cut to `treasures`: the harp card's steps tick, the 30 s bar runs, then "taken by agy". Then the Etherscan still of the fill. | "Now a Jack arrives..." | The gateway log; the fill [tx] |
| 6 | 2:05–2:20 | The fork clip: the same quote 31 s later reverts `QuoteExpired`. Caption: "Sepolia fork". | "The harp's song is good for thirty seconds..." | The fork run's log |
| 7 | 2:20–2:55 | **Beat 3.** Terminal: agy's v4 swap. `treasures`: the hen lays an egg and shows the hoard's exact change. Then the Etherscan still with the v4 `Swap` and Aqua's `Pulled` and `Pushed` highlighted in one tx. | "The hen is a Uniswap v4 pool..." | The swap [tx] |
| 8 | 2:55–3:15 | `tale`: the tapestry unrolls scene by scene, then the fills ledger. | "Four handoff agents keep the castle..." | – |
| 9 | 3:15–3:30 | The deck's closing slide. | "One hoard, every market..." | quote.feefifofum.eth, the miniapp URL and the repo URL |

The pitch deck that goes with this script: https://claude.ai/artifact/D5PyqDuPhGFu69R3NGp958 (10 slides, private until shared).

## Voiceover, as one read

> Fee, fi, fo, fum. In the old tale, the giant keeps a bag of gold, a harp that sings and a hen that lays golden eggs. In ours, the treasures work for the giant, and the giant's gold works for every market at once.
>
> A market maker's gold is scattered: a pile in this pool, a pile on that chain, most of it idle. And every price it posts goes stale the moment the market moves, so arbitrageurs take the difference.
>
> feefifofum keeps one hoard: a Castle vault that is a 1inch Aqua maker. Our agent fi ships two SwapVM strategies from the same balance, the harp and the hen. Each promises eighty percent of the hoard. Together that is 1.6 times what the Castle holds, and it is safe, because each coin can be taken only once. No tokens moved: Aqua pulls only when a trade fills.
>
> fum, the guard, sets how far the promises may stretch: twice the hoard. So when fi ships a greedy third strategy asking for half again, the vault itself says no. OverAllocated, on-chain.
>
> Now a Jack arrives: agy, an outside solver. It asks the ENS name quote.feefifofum.eth for a price. The resolver answers with OffchainLookup: ask the castle's gateway. There, fee prices the quote and fi signs it. The resolver checks the signature and the expiry, and agy holds a firm price without paying gas to ask. agy fills it through the SwapVM router, which checks fi's signature once more. The hoard moves by exactly what agy paid and got.
>
> The harp's song is good for thirty seconds. On a fork, the same quote thirty-one seconds later reverts QuoteExpired. A stale price can't be used against the castle.
>
> The hen is a Uniswap v4 pool with no liquidity in it at all. When agy swaps, the hook fills the swap from the hen strategy. Aqua pulls WETH from the Castle and pushes the USDC in, all inside the swap's own transaction. No gold waited in the pool. The hen laid it just in time.
>
> Four handoff agents keep the castle. fee prices. fi writes the strategies and signs the quotes. fo carries UniswapX-style orders to the harp or the hen. fum guards the hoard. The miniapp tells all of it as it happens.
>
> One hoard, every market. Ask the harp yourself: quote.feefifofum.eth. Fee, fi, fo, fum.

That is about 400 words: roughly 3:00 of speech at a calm pace, which leaves room for the on-chain waits.

## Rules for the edit

- **No speed-up.** Cut the waits for blocks instead. Fade to a "moments later" card that shows the clock, rather than fast-forwarding.
- **No fakes.** Every tx shown is real and on Sepolia, except the one fork clip, which carries its caption. Never show the mock stream in the video: the miniapp must read "Live from the castle".
- **Legible numbers.** Money figures on screen must be readable at 1080p. If needed, zoom the browser to 125% for the hoard, the gauge and the fills.
- **Captions.** Burn in captions from the voiceover above.
