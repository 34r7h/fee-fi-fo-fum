# fee-fi-fo-fum: demo video script and shot list

For the ETHGlobal Tokyo 2026 submission (Continuity track: 1inch Aqua, Uniswap and ENS).

- **Length:** about 3:20, and never more than 4:00.
- **Picture:** 1920×1080 (720p minimum), recorded in real time, no speed-up.
- **Voice:** one voiceover by the operator, spoken slowly over live footage.
- **Screens:** the live miniapp on handoff.lol, a terminal with the four agents, and Sepolia Etherscan.

Every transaction shown is a real Sepolia tx, and each one has an Etherscan capture the edit can freeze on.

## The footage

There was one live failover run on Sepolia, 07:38–07:45:18Z on 26 September 2026 (blocks 11784800–11784832). It was screen-recorded once, in real time, and there is no second take.

- **Miniapp, four views, 10 minutes each:** `~/Movies/feefifofum-demo/live/cut/{top,stalk,tale,replay}-0737-30.mp4`. Each is 1920×1080 at 15 fps and runs 07:37:30–07:47:30Z, so **cut time = UTC − 07:37:30**. `top` is the first viewport (chant, shifts, fence, hoard), `stalk` is the beanstalk chart, `tale` is the tapestry and the fills ledger, and `replay` is the replay tab.
- **Full-length masters:** `~/Movies/feefifofum-demo/live/{top,stalk,tale,replay}.mp4`, from 07:37:08Z (master time = UTC − 07:37:08).
- **Etherscan stills:** `~/Movies/feefifofum-demo/etherscan/`, one 1920×1080 PNG per tx in the tables below.
- The page prints times in the viewer's clock (JST, UTC+9), so 07:43:36Z reads 16:43:36 on screen.
- In this run **fi held the castle and fee took it over**, the reverse of the first draft of this script. The shot list and voiceover below follow the real run.
- **Crop out the ring caption under the shift ring.** The recording has the old caption ("Renewed every 40 s with fo's seal"), which was wrong for fee's new lease. The live miniapp now tells each lease's story from its events.
- **Two beats are not on the page.** The castle service never listed the `FeeFiFoFum()` revert or the `NotHolder` revert, so the recording shows no FENCED fill, no shout and no refusal scene. Show those two beats with their Etherscan stills. Etherscan shows only "execution reverted" for them, because the Aqua router is unverified, so put the error name in a caption.
- No terminal was recorded. The `kill -9` is off screen, so the voiceover carries it.

### Failover run timeline

| UTC | Cut time | What happens | Tx | On the page |
|---|---|---|---|---|
| 07:38:48 | 1:18 | fi claims the castle at epoch v2 | [0xf20660a6…02cc](https://sepolia.etherscan.io/tx/0xf20660a6b92324373822afb68ab2a1df8c9e63ae40ed67059c398b13eb4d02cc) | By 1:36: FI lights gold, holds the castle, and the ring reads epoch v2 |
| 07:39:12 | 1:42 | fi ships its epoch v2 book centred on 2,150.21 USDC/WETH | [0x9a3ec7a6…316a](https://sepolia.etherscan.io/tx/0x9a3ec7a65108da52aab267c8dc250c23cc42659203357fabfe5ff2b474cd316a) | By 1:48: the fence is LIVE with the epoch v2 book |
| 07:40:24 | 2:54 | Live fill on fi's epoch v2 book: 0.50 USDC in, 0.000231 WETH out, at 2,160.34 USDC/WETH | [0xb790493d…a70e](https://sepolia.etherscan.io/tx/0xb790493dfe1ecc09ca8296e59ebea190eac0b497e4e1ec5f5c4d7963da5da70e) | A LIVE v2 row in the fills ledger |
| 07:40:30 | 3:00 | `kill -9` fi | – | Nothing changes yet: fi still holds the lease |
| 07:40:36 | 3:06 | A renewal fi sent before it died lands, carrying the lease to 07:42:24 | [0xc7c5d0de…538d](https://sepolia.etherscan.io/tx/0xc7c5d0ded061f43872cd92381fb98d18b5547082b8e11ff9c6c7cc070ed4538d) | By 3:12: the ring goes from 0:18 left on the lease to 1:42 |
| 07:42:24 | 4:54 | fi's lease runs out, with no tx from anyone | – | By 5:00: FI reads "lease lapsed", the fence moves to WIND-DOWN and the giant opens one eye |
| 07:42:36 | 5:06 | Wind-down fill on fi's old book: 0.50 USDC in, 0.000220 WETH out, at 2,274.74 USDC/WETH (the wide spread) | [0x9f67e848…ec3d](https://sepolia.etherscan.io/tx/0x9f67e84828323dcdf9c3431df694a50a095315aabda23fe18404f0a2772fec3d) | A WIND-DOWN row in the fills ledger |
| 07:43:36 | 6:06 | fee claims the castle 72 s after the lapse, and the epoch goes v2 → v3 | [0xe3cc78d6…69e7](https://sepolia.etherscan.io/tx/0xe3cc78d669461c26d82aa1227cdaafb36c180afd04c9e21f9bd6aef0026169e7) | By 6:12: FEE lights gold and the ring reads "1:54 left on the lease, epoch v3" |
| 07:43:48 | 6:18 | A fill on fi's old epoch v2 book reverts with `FeeFiFoFum()` (selector 0x0f7adc36) | [0xe9a742be…1f14](https://sepolia.etherscan.io/tx/0xe9a742bed8be9246a3669e8967345c4b1097c303dc75983139a9cef7ee2c1f14) | Not shown; use the Etherscan still |
| 07:44:48 | 7:18 | fee docks fi's old book and ships a new epoch v3 book centred on the ENS price, 2,150.21 USDC/WETH | [0x66acde2e…e821](https://sepolia.etherscan.io/tx/0x66acde2e4c9b6c394c9d8918ae6eee372e374fa179ff729d2f3bb19792bce821) | Tapestry: "Here the old book is docked" and "Here fee ships the book"; fence back to LIVE |
| 07:45:00 | 7:30 | New-epoch fill: 0.50 USDC in, 0.000231 WETH out, at 2,161.33 USDC/WETH | [0x08f881ee…1de4](https://sepolia.etherscan.io/tx/0x08f881eef57c3fca0bfb026f760dc60d7bf5038cb187717fa2b89f72be711de4) | By 7:40: a LIVE v3 row at the top of the fills ledger |
| 07:45:12 | 7:42 | fi restarts from its stale state, and its renew reverts with `NotHolder` (selector 0xbf5cd21d) | [0x0247b377…3d82](https://sepolia.etherscan.io/tx/0x0247b37731e82ef6361b7afaff20ad105a4094f8d8c2d7fe061e8e03301c3d82) | Not shown; use the Etherscan still |

## Shot list

| # | Time | Picture | Voiceover | Proof on screen |
|---|---|---|---|---|
| 1 | 0:00–0:15 | `top` cut, 1:40–2:50: FI lit gold in the chant, the lease thread running round the shift ring. Slow push-in on the gold thread. | "Every market-making agent is a giant sitting on a hoard. And every giant falls asleep sometimes." | https://handoff.lol/app/impecc/fee-fi-fo-fum in the address bar |
| 2 | 0:15–0:35 | `tale` cut from 2:54: the fills ledger with fi's live fill on top. Then the Etherscan still `a1-live-fill-0xb790493d.png` with the Aqua `pull` and `push` transfers highlighted. | "When an agent crashes, its quotes stay out. A dead agent can't send the transaction that cancels them, so its stale prices are gold left out for any Jack who climbs the beanstalk first." | Live fill [0xb790493d…a70e](https://sepolia.etherscan.io/tx/0xb790493dfe1ecc09ca8296e59ebea190eac0b497e4e1ec5f5c4d7963da5da70e): 0.50 USDC in, 0.000231 WETH out, at 2,160.34 USDC/WETH |
| 3 | 0:35–0:55 | Diagram card (the loop from the README): the ENS lease → Aqua fence → Uniswap CCA → the price back into ENS. | "fee-fi-fo-fum is the giant that wakes up. A desk's 1inch Aqua liquidity is live only while its operator holds an ENSv2 lease on castle.feefifofum.eth. Castle.sol holds the hoard, and every quote carries the lease's epoch." | – |
| 4 | 0:55–1:10 | **Beat 1.** `top` cut, 2:54–3:00, with a caption card: "07:40:30 UTC · kill -9 fi". Cut away before 3:06: a renewal fi sent before it died lands then and refills the ring, which reads as if fi were still alive. | "Beat one. fi is holding the castle, and we kill it. No goodbye, no cleanup transaction." | The caption card; no terminal was recorded |
| 5 | 1:10–1:35 | A "two minutes later" card with the clock. `top` cut, 4:50–5:05: the lease thread runs out, FI reads "lease lapsed", the fence moves to WIND-DOWN and the giant opens one eye. `tale` cut, 5:06–5:15: the WIND-DOWN row lands at 2,274.74 USDC/WETH, under the live row at 2,160.34. | "Nobody renews the lease. The moment it lapses, with no transaction from anyone, the castle winds down. It will only sell, and only at a wide spread. The Jacks get no free lunch." | Wind-down fill [0x9f67e848…ec3d](https://sepolia.etherscan.io/tx/0x9f67e84828323dcdf9c3431df694a50a095315aabda23fe18404f0a2772fec3d): 0.50 USDC in, 0.000220 WETH out |
| 6 | 1:35–2:00 | **Beats 2 and 3.** `top` cut, 6:04–6:16: FEE lights gold and the ring reads "epoch v3". Then the Etherscan still `b-fenced-revert-0xe9a742be.png` (status Fail), captioned "FeeFiFoFum(): a fill on fi's old epoch v2 book". | "fee, the shift trader, takes over the castle. That re-registers the ENS name, and the new token id is the new epoch. Now any quote from fi's shift is dead on-chain. The giant smells it: FeeFiFoFum." | fee's claim [0xe3cc78d6…69e7](https://sepolia.etherscan.io/tx/0xe3cc78d669461c26d82aa1227cdaafb36c180afd04c9e21f9bd6aef0026169e7); the fenced fill [0xe9a742be…1f14](https://sepolia.etherscan.io/tx/0xe9a742bed8be9246a3669e8967345c4b1097c303dc75983139a9cef7ee2c1f14) |
| 7 | 2:00–2:15 | `tale` cut, 7:18–7:45: "Here the old book is docked", "Here fee ships the book", then the LIVE v3 fill at the top of the ledger. `replay` cut from 8:00: the lease timeline and every row saying "agrees". Frame the table, not the timeline labels: fi's epoch v2 and fee's epoch v3 labels overlap in this recording. | "Fills resume under fee, with no gap and no zombie quotes. The replay tab judges every fill again from the lease history alone, and they all agree." | fee's ship [0x66acde2e…e821](https://sepolia.etherscan.io/tx/0x66acde2e4c9b6c394c9d8918ae6eee372e374fa179ff729d2f3bb19792bce821); the new-epoch fill [0x08f881ee…1de4](https://sepolia.etherscan.io/tx/0x08f881eef57c3fca0bfb026f760dc60d7bf5038cb187717fa2b89f72be711de4) |
| 8 | 2:15–2:30 | **Beat 4.** The Etherscan still `d-notholder-revert-0x0247b377.png` (status Fail), captioned "NotHolder: fi's stale renew, refused". | "Now fi comes back from the dead, still thinking it's in charge. The castle refuses it on-chain." | fi's refused renew [0x0247b377…3d82](https://sepolia.etherscan.io/tx/0x0247b37731e82ef6361b7afaff20ad105a4094f8d8c2d7fe061e8e03301c3d82) |
| 9 | 2:30–3:00 | **Beat 5**, which ran earlier, 06:40–06:48Z, before the failover recording. `stalk` cut, 0:00–1:30: that auction's beanstalk, cleared at 2,150.21 USDC/WETH with agy.feefifofum.eth's 6.00 USDC bid. After 1:30 the fence list grows and pushes the chart off the bottom of the frame. Then the Etherscan stills `e1-dissolve`, `e2-jackhook-bid` and `e3-settle-price-to-ens`. | "Beat five: everyone falls. The hoard isn't looted. It goes up the beanstalk, a Uniswap CCA that any Jack with an ENS name may climb. The next shift gets no privilege. Size buys nothing." | The dissolve, bid and settle txs in "Real transactions so far" |
| 10 | 3:00–3:15 | The Etherscan stills `e3-settle-price-to-ens`, `e4-fi-claim` and `e6-fi-ship`. Then the `top` cut: the hoard panel's anchor price, 2,150.21 USDC/WETH, "handoff-price in ENS". | "The clearing price is written back to ENS, and the next castle opens right there. ENS says who is live. Aqua obeys it at fill time. The CCA prices every handover." | The settle tx; fi's claim and ship txs |
| 11 | 3:15–3:25 | End card: fee·fi·fo·fum wordmark, "The giant never sleeps.", the live URL and repo URL, and the three sponsor names. | "fee-fi-fo-fum. The giant never sleeps." | – |

## Real transactions before the failover run

These are on Sepolia and can be used as they are. The failover run's txs are in the timeline above.

| What | Tx |
|---|---|
| Castle deployed (block 11784308) | [0xe9efeb32…8775](https://sepolia.etherscan.io/tx/0xe9efeb3227c5c7c2887215da49bb9148f9767d4147a9b1377f0820f85b088775) |
| fee's first claim and relink mint castle.feefifofum.eth | [0xb97ac95e…b6a0](https://sepolia.etherscan.io/tx/0xb97ac95edc11333e2b80d482219cdf051d0febfa37f0f79abd736edb5e9db6a0) |
| fee ships 0.003 WETH and 8 USDC, centred on the ENS price | [0x7306bda6…add7](https://sepolia.etherscan.io/tx/0x7306bda652ba6ded88f5e49bc98cb9ac8408f999bda39e22ee963f0f5dfbadd7) |
| Live fill | [0xb349a23c…fa1d](https://sepolia.etherscan.io/tx/0xb349a23c10f31273752064f5495673b39dff47cf5a3165a72e87352ddb07fa1d) |
| Wind-down fill after the lease lapsed, with no claim | [0x0065e64a…0d6c](https://sepolia.etherscan.io/tx/0x0065e64a899acf825552777189387b0058b8fb58efc1e027cf0de18adfeb0d6c) |
| Beat 5: nobody holds the castle, anyone calls `dissolve()` and the CCA opens | [0x273f808c…a5b5](https://sepolia.etherscan.io/tx/0x273f808c1741688f63a8a5c28f3d0859b229a9e1d4c65242f2a1f9a51044a5b5) |
| A Jack with an ENS name (agy) bids through JackHook | [0x9b888635…f1d7](https://sepolia.etherscan.io/tx/0x9b88863540d107223c1f472a90cea2fde3210171326d2dc6e80dc537569cf1d7) |
| Settle writes the clearing price, 2,150.21 USDC/WETH, into ENS | [0x9a813eb5…81cf](https://sepolia.etherscan.io/tx/0x9a813eb505f08ad54cc20583ba00bec9f75ee0319d6d789b5cae6d58a6c981cf) |
| fi claims the castle in the next block | [0xa8f75f3a…be14](https://sepolia.etherscan.io/tx/0xa8f75f3a56fe29edb571139c7081d114fd20f77d5ae13773eb393ea09e68be14) |
| fi's first renewal with fo's attestation | [0xe93fdefe…731b](https://sepolia.etherscan.io/tx/0xe93fdefec304e6ae4b07cfbee1875e15485cc1343f5deff67a4a6362e6c0731b) |
| fi ships a book centred on the new ENS price | [0xd3b0c970…f779](https://sepolia.etherscan.io/tx/0xd3b0c970e9b31398fc972ccf863b2933503b91304bba8f8e7809a3d36feef779) |

The pitch deck that goes with this script: https://claude.ai/artifact/8emvtymYBXfwNjxXsy4QDa (12 slides, private until shared).

## Voiceover, as one read

> Every market-making agent is a giant sitting on a hoard. And every giant falls asleep sometimes.
>
> When an agent crashes, its quotes stay out. A dead agent can't send the transaction that cancels them, so its stale prices are gold left out for any Jack who climbs the beanstalk first.
>
> fee-fi-fo-fum is the giant that wakes up. A desk's 1inch Aqua liquidity is live only while its operator holds an ENSv2 lease on castle.feefifofum.eth. Castle.sol holds the hoard, and every quote carries the lease's epoch.
>
> Beat one. fi is holding the castle, and we kill it. No goodbye, no cleanup transaction.
>
> Nobody renews the lease. The moment it lapses, with no transaction from anyone, the castle winds down. It will only sell, and only at a wide spread. The Jacks get no free lunch.
>
> fee, the shift trader, takes over the castle. That re-registers the ENS name, and the new token id is the new epoch. Now any quote from fi's shift is dead on-chain. The giant smells it: FeeFiFoFum.
>
> Fills resume under fee, with no gap and no zombie quotes. The replay tab judges every fill again from the lease history alone, and they all agree.
>
> Now fi comes back from the dead, still thinking it's in charge. The castle refuses it on-chain.
>
> Beat five: everyone falls. The hoard isn't looted. It goes up the beanstalk, a Uniswap CCA that any Jack with an ENS name may climb. The next shift gets no privilege. Size buys nothing.
>
> The clearing price is written back to ENS, and the next castle opens right there. ENS says who is live. Aqua obeys it at fill time. The CCA prices every handover.
>
> fee-fi-fo-fum. The giant never sleeps.

That is about 330 words: roughly 2:40 of speech at a calm pace, which leaves room for the on-chain waits.

## Rules for the edit

- **No speed-up.** Cut the lease waits instead: fade to a "two minutes later" card showing the clock, rather than fast-forwarding.
- **No fakes.** Every tx shown is real and on Sepolia. Never show the mock stream in the video; the miniapp must read "Live from the castle" or "Chain replay".
- **Legible numbers.** Money figures on screen must be readable at 1080p. Zoom the browser to 125% for the hoard and fills shots if needed.
- **Captions.** Burn in captions from the voiceover above.
