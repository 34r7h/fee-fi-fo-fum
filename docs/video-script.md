# feefifofum: demo video script and shot list

This is the demo video for the ETHGlobal Tokyo 2026 submission in the Continuity track (1inch Aqua, Uniswap and ENS). The lease edition's script is kept at tag `lease-edition`.

The video runs about 3:30 and never more than 4:00. It is recorded at 1920×1080 (720p at minimum) in real time, with no speed-up. The operator reads one voiceover slowly over the footage. The screens are the dapp on handoff.lol (`fee-fi-fo-fum` 2.0.2), the live-run replay (`fee-fi-fo-fum-tale`), a terminal showing the outside solver agy's run records, and Sepolia Etherscan.

Every transaction shown is a real Sepolia transaction, either from the one live run (a-live) or from the dapp's test from its published page. The one exception is the `QuoteExpired` clip, which ran on a Sepolia fork and is captioned "Sepolia fork". The live run's record is [agents/live-run/11786346](../agents/live-run/11786346/README.md).

## The footage

The live run took place on Saturday 26 September 2026 from 12:43:36 to 13:00:12 UTC (blocks 11786292–11786374). It was not screen-recorded, so the footage comes from the following sources.

- The dapp at https://handoff.lol/app/impecc/fee-fi-fo-fum, recorded from a clean browser with a Sepolia wallet. The THE VAULT section shows the vault balance, the allocation meters against fum's 2× limit and the two live strategies. The SWAP section shows fo's comparison of the two quotes, the RFQ strategy's card with its signed quote and 30 s validity bar, and the v4 pool's card. A fill and a swap from the wallet show each step (approve, then fill or swap) with its Etherscan link, and the trade then appears under YOUR TRADES.
- The replay at https://handoff.lol/app/impecc/fee-fi-fo-fum-tale, which replays the live run from the vault service's stream event by event: the leverage change, the two strategy ships, the refused third ship, the quote and its fill, the v4 swap, and the re-centre. The page prints times in the viewer's clock, so captions give them in UTC.
- agy's run records, shown in a terminal. `q1-live.json` is the quote record that `getEnsText` returned through `OffchainLookup` and the gateway. `jack-D.json` is the RFQ fill through the SwapVM router, and `jack-E.json` is the v4 swap through PoolSwapTest.
- Etherscan stills, one 1920×1080 PNG for each transaction below. Where the point of a shot is a log, the logs tab is open: `LeverageSet`, `Shipped`, the v4 `Swap`, and Aqua's `Pulled` and `Pushed`.
- The fork clip, in which the same kind of RFQ quote filled 31 s after it was signed reverts with `QuoteExpired(1790426242)` in fork transaction `0xff05…e69a`. The record is [docs/e2e/pass1/5-stale.json](e2e/pass1/5-stale.json).
- For reverted transactions, Etherscan may show only "execution reverted", so a caption gives the error name and its arguments.

### Live run timeline

| UTC | What happens | Tx | What the replay shows |
|---|---|---|---|
| 12:43:36–12:44:00 | The treasury funds the vault with 5.00 USDC and 0.001859 WETH | USDC [`0x7e0b…e8a6`](https://sepolia.etherscan.io/tx/0x7e0b4a9f0fa7b8920b2f5188de6cfcebbed61c5dfdbf80110da4c1604cb5e8a6), wrap [`0xd125…f543`](https://sepolia.etherscan.io/tx/0xd125c4919b722aeebda218b7ae2f794e5956afa6e325784829ea215b26d8f543), WETH [`0x3484…eb3b`](https://sepolia.etherscan.io/tx/0x3484012803e8bc9a1b687326cfc27a727755d03d3c4ec80fd9a52b68d1a3eb3b) | The vault balance reads 5.00 USDC and 0.001859 WETH |
| 12:54:24–12:54:36 | fum sets the leverage limit to 2×, for USDC and then for WETH | [`0x5333…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7), [`0xcf95…54f9`](https://sepolia.etherscan.io/tx/0xcf95760df456850bb1db11811c887c06fae925611984c7fc4e188f838b1a54f9) | The leverage limit reads 2× for USDC and 2× for WETH |
| 12:54:48–12:55:12 | fum caps slots 0, 1 and 2 at the whole vault balance | [`0xd2fb…88b5`](https://sepolia.etherscan.io/tx/0xd2fbb4f8db826c5a202d4724da0767b10ebf8be666751f1324c91b467ba788b5), [`0x3d14…8970`](https://sepolia.etherscan.io/tx/0x3d145621afcd2d43c97a400139b8f5caee7768d6f3e4477dddc4723e5b568970), [`0x1b24…481f`](https://sepolia.etherscan.io/tx/0x1b24490f1c5a1ae23ab58d8d1c79508c9ba85903b06b9735b73ef2f0d068481f) | The three slot caps |
| 12:56:00 | fi ships `harp` (slot 0, PriceExtruction) with 4.00 USDC and 0.001487 WETH, 80% of the vault balance | [`0x1571…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) | The allocation meter reaches 0.8× of the balance |
| 12:56:12 | fi ships `hen` (slot 1, XYCSwap with a flat fee) with 3.995449 USDC and 0.001487 WETH, 80% of the vault balance | [`0x5d7b…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) | The allocation meter passes the balance mark and reaches 1.6× |
| 12:56:24 | fi ships `greedy`, asking for another 2.50 USDC and 0.000929 WETH (0.5×). The transaction reverts with `OverAllocated(WETH, 0.003904, 0.003718)` | [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) (failed) | The request extends past fum's limit and is marked as refused |
| 12:59:04 | agy resolves `quote.feefifofum.eth` for the key `quote:USDC:WETH:500000` over CCIP-Read. fi signs `q-1790427574-6`, 0.50 USDC for 0.000186 WETH at 2,689.26, valid until 12:59:34 | none (the gateway answers off-chain) | The RFQ quote with its validity |
| 12:59:12 | agy fills the quote through the SwapVM router, paying 0.50 USDC and receiving 0.000186 WETH | [`0x763d…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8) (approve [`0xb1e0…5cfb`](https://sepolia.etherscan.io/tx/0xb1e065aa641b2c4625d0bdbd9ef28926164426cf87a608e3e72b1fd9846e5cfb)) | The fill by agy.feefifofum.eth; the vault balance becomes 5.50 USDC and 0.001673 WETH |
| 12:59:48 | agy swaps 0.50 USDC for 0.000165 WETH in the v4 pool, and the hook fills the swap from `hen`, with the 0.0015 USDC fee included | [`0x53f7…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116) (approve [`0x1f84…f5b7`](https://sepolia.etherscan.io/tx/0x1f846b85087d0ae1c3c0e15f0cd723cc43cd0ed78cebb6f75a96f9472983f5b7)) | The vault balance changes by +0.50 USDC and −0.000165 WETH |
| 12:59:53–13:00:12 | fee finds the hook strategy's curve at 3,399.91 against a Chainlink mid of 2,686.57 (20.98% off). fi docks `hen` and ships it again at fee's price | dock [`0x32a2…638a`](https://sepolia.etherscan.io/tx/0x32a20d169556fd013eaa69cb2dc2db2108275c9513d36e24b0886ceab23d638a), ship [`0x03db…67f3`](https://sepolia.etherscan.io/tx/0x03dbf62b16214b7bf36dce5b742ad80c7deccc466a9925328f9b26a817e267f3) | The price drift, then the dock and the new ship |

### Trades from the dapp's published page

On 26 September 2026, impecc's test wallet `0x23E524c19d4140F4bB98FEb58bE3cb89b06AFC32` traded from https://handoff.lol/app/impecc/fee-fi-fo-fum with exact-amount approvals and a maximum fee of 1.8 gwei. SirKit checked all four transactions on-chain.

| What happens | Tx |
|---|---|
| Approve the SwapVM router for 0.25 USDC | [`0x9e99…dab3`](https://sepolia.etherscan.io/tx/0x9e995c0a980e2e86460bbcd7ce5a56820d6e0a506794df8d9eae4467175fdab3) |
| Fill the RFQ quote, paying 0.25 USDC and receiving 0.000093066 WETH | [`0xb825…a59d`](https://sepolia.etherscan.io/tx/0xb825bdd056ac2c8724b3e49dfd9b222dd2652341ad3724d93dc9e714ebb3a59d) |
| Approve PoolSwapTest for 0.25 USDC | [`0x5eee…b4eb`](https://sepolia.etherscan.io/tx/0x5eee0e465d925d3c28fcf318accfbe84deae907d788b1dd6dd9dc273bda2b4eb) |
| Swap 0.25 USDC through the v4 pool for 0.000086151 WETH, filled by the hook from the vault | [`0xf840…466b`](https://sepolia.etherscan.io/tx/0xf840c09a95177625e57420694cb94a06548cd54dd23ae202c13800b567be466b) |

## Shot list

| # | Time | Picture | Voiceover starts | Proof on screen |
|---|---|---|---|---|
| 1 | 0:00–0:15 | The dapp's header and the paragraph under it, with a slow push-in. | "feefifofum is a market-making vault..." | https://handoff.lol/app/impecc/fee-fi-fo-fum in the address bar |
| 2 | 0:15–0:35 | Deck slide 2, which states the problem, then the dapp's THE VAULT section. | "A market maker usually splits its capital..." | – |
| 3 | 0:35–1:05 | Beat 1. The replay shows fum's leverage change and the two ships, and the allocation meter passes the balance mark to 1.6×. Cut to the Etherscan still of the `hen` ship's `Shipped` log, then to the dapp's allocation meters as they are now. | "The vault, CastleVault, is a 1inch Aqua maker..." | The leverage [`0x5333…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7), `harp` [`0x1571…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) and `hen` [`0x5d7b…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) |
| 4 | 1:05–1:25 | The replay shows the `greedy` request extending past fum's limit and marked as refused. Cut to the Etherscan still of the reverted ship, captioned `OverAllocated(WETH, 0.003904, 0.003718)`. | "The risk agent fum sets a leverage limit..." | [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) (failed) |
| 5 | 1:25–2:05 | Beat 2. The terminal shows `q1-live.json`, the quote that `getEnsText` returned through `OffchainLookup` and the gateway. Cut to the dapp: 0.25 USDC is entered, the RFQ card shows fi's signed quote and its 30 s validity bar, and fo's comparison picks the RFQ strategy. "Fill this quote" runs the approve and the fill, and both steps show "done" with their links. End on the Etherscan still of the live run's fill. | "An outside solver, the agent agy, then resolves..." | `q-1790427574-6`; the live-run fill [`0x763d…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8); the dapp's fill [`0xb825…a59d`](https://sepolia.etherscan.io/tx/0xb825bdd056ac2c8724b3e49dfd9b222dd2652341ad3724d93dc9e714ebb3a59d) |
| 6 | 2:05–2:20 | The fork clip, in which the same quote filled 31 s after signing reverts with `QuoteExpired`, captioned "Sepolia fork". | "A quote is valid for 30 seconds..." | Fork tx `0xff05…e69a`, `QuoteExpired(1790426242)` |
| 7 | 2:20–2:55 | Beat 3. The terminal shows `jack-E.json`, agy's v4 swap. Cut to the dapp's HEN card: "Swap through the v4 pool" runs the approve and the swap, and the card reads "Swapped." Cut to the Etherscan still of the live run's swap with the v4 `Swap` and Aqua's `Pulled` and `Pushed` highlighted in one transaction. The dapp's HEN card then says the hook strategy is being re-priced, and its new quote appears a few seconds later. | "The second strategy backs a Uniswap v4 pool..." | The live-run swap [`0x53f7…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116); the dapp's swap [`0xf840…466b`](https://sepolia.etherscan.io/tx/0xf840c09a95177625e57420694cb94a06548cd54dd23ae202c13800b567be466b); the re-centre dock [`0x32a2…638a`](https://sepolia.etherscan.io/tx/0x32a20d169556fd013eaa69cb2dc2db2108275c9513d36e24b0886ceab23d638a) and ship [`0x03db…67f3`](https://sepolia.etherscan.io/tx/0x03dbf62b16214b7bf36dce5b742ad80c7deccc466a9925328f9b26a817e267f3) |
| 8 | 2:55–3:15 | The dapp's YOUR TRADES table with both trades, then the THE VAULT section with the updated balance. | "The dapp lets anyone do the same..." | – |
| 9 | 3:15–3:30 | The deck's closing slide. | "The ENS name is quote.feefifofum.eth..." | quote.feefifofum.eth, the dapp URL and the repo URL |

The pitch deck that goes with this script is https://claude.ai/artifact/D5PyqDuPhGFu69R3NGp958 (10 slides, private until shared).

## Voiceover, as one read

> feefifofum is a market-making vault on Ethereum Sepolia, run by four handoff agents. This is its dapp on handoff.lol, and every figure on the page is read from Sepolia or sent from a wallet.
>
> A market maker usually splits its capital across many pools and chains, and much of that capital sits idle. Its posted prices also go stale when the market moves, and arbitrageurs trade against the stale prices.
>
> The vault, CastleVault, is a 1inch Aqua maker. It holds one balance of USDC and WETH, and the agent fi ships two SwapVM strategies against that balance. The RFQ strategy, called harp, and the constant-product strategy, called hen, are each allocated 80 percent of the balance, so the vault has committed 1.6 times what it holds. Aqua records the allocations as virtual balances, and tokens leave the vault only when a trade fills.
>
> The risk agent fum sets a leverage limit of two times the balance. When fi ships a third strategy that asks for another half of the balance, the vault reverts the transaction with OverAllocated, so the limit is enforced on-chain.
>
> An outside solver, the agent agy, then resolves the ENS name quote.feefifofum.eth. The resolver replies with OffchainLookup, which sends the request to the vault's gateway. The agent fee sets the price from Chainlink, fi signs the quote, and the resolver checks the signature and the expiry before it returns the text record. The solver pays no gas to get this price. agy fills the quote through the SwapVM router, which checks fi's signature again, and the vault balance changes by exactly the amounts in the quote.
>
> A quote is valid for 30 seconds. On a Sepolia fork, the same quote filled 31 seconds after signing reverts with QuoteExpired, so a stale price cannot be filled against the vault.
>
> The second strategy backs a Uniswap v4 pool that holds no liquidity. When agy swaps in the pool, the hook fills the swap from the hen strategy. Aqua pulls WETH from the vault and pushes the USDC into it within the swap's own transaction. After the swap, fee finds that the strategy's price has drifted from Chainlink, and fi docks the strategy and ships it again at the new price.
>
> The dapp lets anyone do the same from their own wallet. The router agent fo compares the two quotes for the amount entered, and each fill or swap is an approval followed by one transaction, with an Etherscan link for each.
>
> The ENS name is quote.feefifofum.eth, and the dapp is at handoff.lol/app/impecc/fee-fi-fo-fum.

The voiceover is about 430 words, which is roughly 3:00 of speech at a calm pace and leaves room for the on-chain waits.

## Rules for the edit

- The edit uses no speed-up. Waits for blocks are cut, and a card showing the clock marks each cut.
- Every transaction shown is real and on Sepolia, except the one fork clip, which carries its caption. The replay must be reading the live stream, and neither miniapp may show mock data.
- Money figures on screen must be readable at 1080p. If needed, zoom the browser to 125% for the vault balance, the allocation meters and the quotes.
- Captions are burned in from the voiceover above.
