# fee-fi-fo-fum: demo video script and shot list

For the ETHGlobal Tokyo 2026 submission (Continuity track: 1inch Aqua, Uniswap and ENS).

- **Length:** about 3:20, and never more than 4:00.
- **Picture:** 1920×1080 (720p minimum), recorded in real time, no speed-up.
- **Voice:** one voiceover by the operator, spoken slowly over live footage.
- **Screens:** the live miniapp on handoff.lol, a terminal with the four agents, and Sepolia Etherscan.

Every transaction shown must be a real Sepolia tx. Before recording, paste each tx link from WORKLOG.md into the shot list's "proof" column, so the edit can freeze on it.

## Before you record

1. Open the miniapp from a clean browser profile at its live URL (the p5-live URL in WORKLOG.md). Set zoom to 100% and the window to 1920×1080.
2. Terminal: a 2×2 tmux grid with `fee`, `fi`, `fo` and `fum` running, font at 18pt or larger. Keep a fifth pane free for `kill -9`.
3. Etherscan open in a second tab on the Castle contract's event log.
4. The lease is 120s with renewals every 40s, so a lapse takes up to two minutes. Rehearse the timing once, and start each take right after a renewal so the wait is known.
5. Nothing on screen may show a private key, an `.env` file or an RPC URL with a key in it.

## Shot list

| # | Time | Picture | Voiceover | Proof on screen |
|---|---|---|---|---|
| 1 | 0:00–0:15 | The miniapp's first viewport: FEE lit gold in the chant, the lease thread running round the shift ring. Slow push-in on the gold thread. | "Every market-making agent is a giant sitting on a hoard. And every giant falls asleep sometimes." | https://handoff.lol/app/impecc/fee-fi-fo-fum in the address bar |
| 2 | 0:15–0:35 | The fills ledger, then the Etherscan tx of one live fill with the Aqua `pull` and `push` transfers highlighted. | "When an agent crashes, its quotes stay out. A dead agent can't send the transaction that cancels them, so its stale prices are gold left out for any Jack who climbs the beanstalk first." | Live fill [0xb349a23c…fa1d](https://sepolia.etherscan.io/tx/0xb349a23c10f31273752064f5495673b39dff47cf5a3165a72e87352ddb07fa1d): 0.0005 WETH in, 1.329484 USDC out |
| 3 | 0:35–0:55 | Diagram card (the loop from the README): the ENS lease → Aqua fence → Uniswap CCA → the price back into ENS. | "fee-fi-fo-fum is the giant that wakes up. A desk's 1inch Aqua liquidity is live only while its operator holds an ENSv2 lease on castle.feefifofum.eth. Castle.sol holds the hoard, and every quote carries the lease's epoch." | – |
| 4 | 0:55–1:10 | **Beat 1.** Terminal: type `kill -9` on fee's pid and press enter. Cut to the miniapp: FEE's syllable goes pale and "asleep" appears. | "Beat one. We kill fee, our shift trader. No goodbye, no cleanup transaction." | fee's pid gone in `ps` |
| 5 | 1:10–1:35 | The lease thread runs out on the ring. The fence moves to WIND-DOWN, and the giant opens one eye. A wind-down fill lands at the wide spread. | "Nobody renews the lease. The moment it lapses, with no transaction from anyone, the castle winds down. It will only sell, and only at a wide spread. The Jacks get no free lunch." | Wind-down fill [0x0065e64a…0d6c](https://sepolia.etherscan.io/tx/0x0065e64a899acf825552777189387b0058b8fb58efc1e027cf0de18adfeb0d6c): 1 USDC in, 0.000357 WETH out |
| 6 | 1:35–2:00 | **Beat 2 and 3.** fi's pane logs its claim. On the miniapp FI lights gold and the epoch goes 7 → 8. A stale epoch-7 fill hits: the giant wakes, "FEE-FI-FO-FUM!", and the fill reverts. Cut to Etherscan on the reverted tx with `FeeFiFoFum()` visible. | "fi, the hot standby, claims the castle. That re-registers the ENS name, and the new token id is the new epoch. Now any quote from the old shift is dead on-chain. The giant smells it: FeeFiFoFum." | fi's claim tx; the reverted fill tx showing `FeeFiFoFum()` |
| 7 | 2:00–2:15 | A new-epoch fill passes. The replay tab: the lease timeline with the wind-down gap and the claim, and every row saying "agrees". | "Fills resume under fi, with no gap and no zombie quotes. The replay tab judges every fill again from the lease history alone, and they all agree." | The new-epoch fill tx |
| 8 | 2:15–2:30 | **Beat 4.** Restart fee from its stale state. Its pane shows the renew attempt reverting. The miniapp tapestry shows "HERE THE CASTLE REFUSES FEE". | "Now fee comes back from the dead, still thinking it's in charge. The castle refuses it on-chain." | fee's reverted renew tx |
| 9 | 2:30–3:00 | **Beat 5.** Kill all four panes. The lease lapses. Anyone calls `dissolve()`. The beanstalk chart climbs as Jacks bid, one bidder is struck out ("no ENS name: JackHook said no"), and the auction clears. | "Beat five: everyone falls. The hoard isn't looted. It goes up the beanstalk, a Uniswap CCA that any Jack with an ENS name may climb. The next shift gets no privilege. Size buys nothing." | The dissolve, bid, clear and sweep txs |
| 10 | 3:00–3:15 | The clearing price is written to ENS (`handoff-price`). The next shift claims and ships centred on that price, and the hoard panel shows the new anchor. | "The clearing price is written back to ENS, and the next castle opens right there. ENS says who is live. Aqua obeys it at fill time. The CCA prices every handover." | The setData tx; the next ship tx |
| 11 | 3:15–3:25 | End card: fee·fi·fo·fum wordmark, "The giant never sleeps.", the live URL and repo URL, and the three sponsor names. | "fee-fi-fo-fum. The giant never sleeps." | – |

## Real transactions so far

These are on Sepolia now and can be used as they are. Add the fenced revert and fee's refused renew from WORKLOG.md after the failover run at 07:40Z.

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
> Beat one. We kill fee, our shift trader. No goodbye, no cleanup transaction.
>
> Nobody renews the lease. The moment it lapses, with no transaction from anyone, the castle winds down. It will only sell, and only at a wide spread. The Jacks get no free lunch.
>
> fi, the hot standby, claims the castle. That re-registers the ENS name, and the new token id is the new epoch. Now any quote from the old shift is dead on-chain. The giant smells it: FeeFiFoFum.
>
> Fills resume under fi, with no gap and no zombie quotes. The replay tab judges every fill again from the lease history alone, and they all agree.
>
> Now fee comes back from the dead, still thinking it's in charge. The castle refuses it on-chain.
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
