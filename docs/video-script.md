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
| 1 | 0:00–0:15 | The miniapp's first viewport: FEE lit gold in the chant, the lease thread running round the shift ring. Slow push-in on the gold thread. | "Every market-making agent is a giant sitting on a hoard. And every giant falls asleep sometimes." | Live URL visible in the address bar |
| 2 | 0:15–0:35 | The fills ledger, then the Etherscan tx of one live fill with the Aqua `pull` and `push` transfers highlighted. | "When an agent crashes, its quotes stay out. A dead agent can't send the transaction that cancels them, so its stale prices are gold left out for any Jack who climbs the beanstalk first." | One live fill tx: real Aqua pull/push |
| 3 | 0:35–0:55 | Diagram card (the loop from the README): the ENS lease → Aqua fence → Uniswap CCA → the price back into ENS. | "fee-fi-fo-fum is the giant that wakes up. A desk's 1inch Aqua liquidity is live only while its operator holds an ENSv2 lease on castle.feefifofum.eth. Castle.sol holds the hoard, and every quote carries the lease's epoch." | – |
| 4 | 0:55–1:10 | **Beat 1.** Terminal: type `kill -9` on fee's pid and press enter. Cut to the miniapp: FEE's syllable goes pale and "asleep" appears. | "Beat one. We kill fee, our shift trader. No goodbye, no cleanup transaction." | fee's pid gone in `ps` |
| 5 | 1:10–1:35 | The lease thread runs out on the ring. The fence moves to WIND-DOWN, and the giant opens one eye. A wind-down fill lands at the wide spread. | "Nobody renews the lease. The moment it lapses, with no transaction from anyone, the castle winds down. It will only sell, and only at a wide spread. The Jacks get no free lunch." | The wind-down fill tx |
| 6 | 1:35–2:00 | **Beat 2 and 3.** fi's pane logs its claim. On the miniapp FI lights gold and the epoch goes 7 → 8. A stale epoch-7 fill hits: the giant wakes, "FEE-FI-FO-FUM!", and the fill reverts. Cut to Etherscan on the reverted tx with `FeeFiFoFum()` visible. | "fi, the hot standby, claims the castle. That re-registers the ENS name, and the new token id is the new epoch. Now any quote from the old shift is dead on-chain. The giant smells it: FeeFiFoFum." | fi's claim tx; the reverted fill tx showing `FeeFiFoFum()` |
| 7 | 2:00–2:15 | A new-epoch fill passes. The replay tab: the lease timeline with the wind-down gap and the claim, and every row saying "agrees". | "Fills resume under fi, with no gap and no zombie quotes. The replay tab judges every fill again from the lease history alone, and they all agree." | The new-epoch fill tx |
| 8 | 2:15–2:30 | **Beat 4.** Restart fee from its stale state. Its pane shows the renew attempt reverting. The miniapp tapestry shows "HERE THE CASTLE REFUSES FEE". | "Now fee comes back from the dead, still thinking it's in charge. The castle refuses it on-chain." | fee's reverted renew tx |
| 9 | 2:30–3:00 | **Beat 5.** Kill all four panes. The lease lapses. Anyone calls `dissolve()`. The beanstalk chart climbs as Jacks bid, one bidder is struck out ("no ENS name: JackHook said no"), and the auction clears. | "Beat five: everyone falls. The hoard isn't looted. It goes up the beanstalk, a Uniswap CCA that any Jack with an ENS name may climb. The next shift gets no privilege. Size buys nothing." | The dissolve, bid, clear and sweep txs |
| 10 | 3:00–3:15 | The clearing price is written to ENS (`handoff-price`). The next shift claims and ships centred on that price, and the hoard panel shows the new anchor. | "The clearing price is written back to ENS, and the next castle opens right there. ENS says who is live. Aqua obeys it at fill time. The CCA prices every handover." | The setData tx; the next ship tx |
| 11 | 3:15–3:25 | End card: fee·fi·fo·fum wordmark, "The giant never sleeps.", the live URL and repo URL, and the three sponsor names. | "fee-fi-fo-fum. The giant never sleeps." | – |

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
