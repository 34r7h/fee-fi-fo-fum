# feefifofum: demo video script and shot list

For the ETHGlobal Tokyo 2026 submission (Continuity track: 1inch Aqua, Uniswap and ENS). The lease edition's script is kept at tag `lease-edition`.

- **Length:** about 3:30, and never more than 4:00.
- **Picture:** 1920×1080 (720p minimum), recorded in real time, no speed-up.
- **Voice:** one voiceover by the operator, spoken slowly over live footage.
- **Screens:** the live miniapp on handoff.lol, a terminal running agy (the outside Jack), and Sepolia Etherscan.

Every transaction shown is a real Sepolia tx from the one live run (a-live), except the `QuoteExpired` beat, which ran on a Sepolia fork and is captioned "Sepolia fork". The run's record is [agents/live-run/11786346](../agents/live-run/11786346/README.md).

## The footage

The live run took place on Saturday 26 September 2026, 12:43:36–13:00:12Z (blocks 11786292–11786374). It was not screen-recorded, so the footage is:

- **The miniapp, recorded after the run.** It retells the whole run from the castle's stream in three views:
  - `top`: the chant, the hoard, and fum's gauges with greedy's refusal.
  - `treasures`: the harp card (quote `q-1790427574-6`, taken by agy) and the hen card (the v4 fill).
  - `tale`: unroll the tapestry scene by scene, then the fills ledger.
  The page prints times in the viewer's clock, so caption them in UTC.
- **Terminal:** agy's run output from the record.
  - `q1-live.json`: the quote record `getEnsText` returned, through `OffchainLookup` and the gateway.
  - `jack-D.json`: the harp fill through the SwapVM router.
  - `jack-E.json`: the v4 swap through PoolSwapTest.
- **Etherscan stills:** one 1920×1080 PNG for each tx below. Open the logs tab where the beat is a log: `LeverageSet`, `Shipped`, the v4 `Swap`, and Aqua's `Pulled` and `Pushed`.
- **Fork clip:** the same kind of harp quote refilled 31 s later reverts `QuoteExpired(1790426242)` in fork tx `0xff05…e69a`. The record is [docs/e2e/pass1/5-stale.json](e2e/pass1/5-stale.json).
- **Reverted txs:** Etherscan may show only "execution reverted" for them. Put the error name and its arguments in a caption.

### Live run timeline

| UTC | What happens | Tx | On the page |
|---|---|---|---|
| 12:43:36–12:44:00 | The treasury funds the hoard: 5.00 USDC and 0.001859 WETH | USDC [`0x7e0b…e8a6`](https://sepolia.etherscan.io/tx/0x7e0b4a9f0fa7b8920b2f5188de6cfcebbed61c5dfdbf80110da4c1604cb5e8a6), wrap [`0xd125…f543`](https://sepolia.etherscan.io/tx/0xd125c4919b722aeebda218b7ae2f794e5956afa6e325784829ea215b26d8f543), WETH [`0x3484…eb3b`](https://sepolia.etherscan.io/tx/0x3484012803e8bc9a1b687326cfc27a727755d03d3c4ec80fd9a52b68d1a3eb3b) | The hoard reads 5.00 USDC and 0.001859 WETH |
| 12:54:24–12:54:36 | fum sets leverage to 2×, for USDC and then WETH | [`0x5333…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7), [`0xcf95…54f9`](https://sepolia.etherscan.io/tx/0xcf95760df456850bb1db11811c887c06fae925611984c7fc4e188f838b1a54f9) | Tapestry: "Here fum lets each coin be promised twice". fum’s leverage reads "2× USDC · 2× WETH" |
| 12:54:48–12:55:12 | fum caps slots 0, 1 and 2 at the whole hoard | [`0xd2fb…88b5`](https://sepolia.etherscan.io/tx/0xd2fbb4f8db826c5a202d4724da0767b10ebf8be666751f1324c91b467ba788b5), [`0x3d14…8970`](https://sepolia.etherscan.io/tx/0x3d145621afcd2d43c97a400139b8f5caee7768d6f3e4477dddc4723e5b568970), [`0x1b24…481f`](https://sepolia.etherscan.io/tx/0x1b24490f1c5a1ae23ab58d8d1c79508c9ba85903b06b9735b73ef2f0d068481f) | "Here fum sets the caps" |
| 12:56:00 | fi ships `harp` (slot 0, PriceExtruction): 4.00 USDC and 0.001487 WETH, 80% of the hoard | [`0x1571…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) | A gold thread fills the gauge to 0.8× |
| 12:56:12 | fi ships `hen` (slot 1, XYCSwap plus flatFee): 3.995449 USDC and 0.001487 WETH, 80% of the hoard | [`0x5d7b…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) | A blue thread runs past the hoard's mark to 1.6× |
| 12:56:24 | fi ships `greedy`, asking for another 2.50 USDC and 0.000929 WETH (0.5×). It reverts `OverAllocated(WETH, 0.003904, 0.003718)` | [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) (failed) | The ask runs hatched past fum's line, and the page reads "fum refused greedy" |
| 12:59:04 | agy resolves `quote.feefifofum.eth` for `quote:USDC:WETH:500000` over CCIP-Read. fi signs `q-1790427574-6`: 0.50 USDC for 0.000186 WETH at 2,689.26, good until 12:59:34 | none (the gateway) | The harp card |
| 12:59:12 | agy fills it through the router: 0.50 USDC in, 0.000186 WETH out | [`0x763d…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8) (approve [`0xb1e0…5cfb`](https://sepolia.etherscan.io/tx/0xb1e065aa641b2c4625d0bdbd9ef28926164426cf87a608e3e72b1fd9846e5cfb)) | "taken by agy.feefifofum.eth". The hoard becomes 5.50 USDC and 0.001673 WETH |
| 12:59:48 | agy swaps 0.50 USDC for 0.000165 WETH on the v4 pool, and the hook fills it from `hen`, fee 0.0015 USDC included | [`0x53f7…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116) (approve [`0x1f84…f5b7`](https://sepolia.etherscan.io/tx/0x1f846b85087d0ae1c3c0e15f0cd723cc43cd0ed78cebb6f75a96f9472983f5b7)) | The hen lays an egg: "The hoard: +0.50 USDC, −0.000165 WETH" |
| 12:59:53–13:00:12 | fee sees the hen's curve at 3,399.91 against 2,686.57 (20.98% off). fi docks `hen` and ships it again at fee's price | dock [`0x32a2…638a`](https://sepolia.etherscan.io/tx/0x32a20d169556fd013eaa69cb2dc2db2108275c9513d36e24b0886ceab23d638a), ship [`0x03db…67f3`](https://sepolia.etherscan.io/tx/0x03dbf62b16214b7bf36dce5b742ad80c7deccc466a9925328f9b26a817e267f3) | "Here fee sees the hen drift", then the dock and the new ship |

## Shot list

| # | Time | Picture | Voiceover | Proof on screen |
|---|---|---|---|---|
| 1 | 0:00–0:15 | The `top` view, with a slow push-in on the chant. | "Fee, fi, fo, fum..." | https://handoff.lol/app/impecc/fee-fi-fo-fum in the address bar |
| 2 | 0:15–0:35 | Deck slide 2 (scattered gold), then back to the hoard panel. | "A market maker's gold is scattered..." | – |
| 3 | 0:35–1:05 | **Beat 1.** `top`: fum's leverage lands, then the harp's and the hen's threads fill the gauge past the hoard's mark to 1.6×. Then the Etherscan still of the hen's `Shipped` log. | "feefifofum keeps one hoard..." | The leverage [`0x5333…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7), the harp [`0x1571…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) and the hen [`0x5d7b…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) |
| 4 | 1:05–1:25 | `top`: greedy's ask runs hatched past fum's line, the giant roars, and the page reads "fum refused greedy". Then the Etherscan still of the reverted ship, captioned `OverAllocated(WETH, 0.003904, 0.003718)`. | "fum, the guard..." | [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) (failed) |
| 5 | 1:25–2:05 | **Beat 2.** Terminal: `q1-live.json`, the quote `getEnsText` returned through `OffchainLookup` and the gateway. Cut to `treasures`: the harp card's steps tick, the 30 s bar runs, then "taken by agy". Then the Etherscan still of the fill. | "Now a Jack arrives..." | `q-1790427574-6`; the fill [`0x763d…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8) |
| 6 | 2:05–2:20 | The fork clip: the same quote 31 s later reverts `QuoteExpired`. Caption: "Sepolia fork". | "The harp's song is good for thirty seconds..." | Fork tx `0xff05…e69a`, `QuoteExpired(1790426242)` |
| 7 | 2:20–2:55 | **Beat 3.** Terminal: `jack-E.json`, agy's v4 swap. `treasures`: the hen lays an egg and shows the hoard's exact change. Then the Etherscan still with the v4 `Swap` and Aqua's `Pulled` and `Pushed` highlighted in one tx. | "The hen is a Uniswap v4 pool..." | The swap [`0x53f7…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116) |
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
