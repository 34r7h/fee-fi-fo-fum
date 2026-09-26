# feefifofum: demo video

This file describes the demo video for the ETHGlobal Tokyo 2026 submission in the Continuity track (1inch Aqua, Uniswap and ENS). SirKit recorded it on 26 September 2026 as take 2. It runs 3:38 at 1920×1080 and was recorded in real time with no speed-up. The files are feefifofum-demo.mp4 (captions burned in), feefifofum-demo-nocaptions.mp4, feefifofum-demo.srt (the captions) and script.md (the voiceover by shot, with start times). The operator will redub the voiceover from the captions, so the voiceover below is identical to script.md.

The video has 13 shots taken from five sources: the dapp 2.0.2 at https://handoff.lol/app/impecc/fee-fi-fo-fum, Sepolia Etherscan, the live-run replay at https://handoff.lol/app/impecc/fee-fi-fo-fum-tale, the feefifofum project page on handoff.lol, and the GitHub README. The trades in the video were made on camera from a new test wallet, `0xf8071d67dDceE3732cd9afd6AFDc047D9b4F3309`, that held only Sepolia ETH when the recording started. Each approval is for the exact amount traded. The one transaction that does not come from this wallet is the reverted greedy ship, which comes from the live run recorded in [agents/live-run/11786346](../agents/live-run/11786346/README.md).

## Transactions in the video

All times are UTC on 26 September 2026, taken from the block timestamps.

| Time | Block | What happens | Tx |
|---|---|---|---|
| 16:30:36 | 11787378 | The test wallet wraps 0.0002 ETH into WETH. | [`0x63c7…bd0f`](https://sepolia.etherscan.io/tx/0x63c720b6fc80a8d82a5005cb35ae24bc9082c866746b0995d8687940eeffbd0f) |
| 16:31:24 | 11787382 | The wallet approves the SwapVM router (`0xeDB6…70f9`) for exactly 0.0001 WETH. | [`0x0e16…b778`](https://sepolia.etherscan.io/tx/0x0e16aa02085e9f094532b97a3d624ad97bb9b0c5709e2700f9fa6229f568b778) |
| 16:31:36 | 11787383 | The wallet fills the RFQ quote from `harp`, paying 0.0001 WETH and receiving 0.268768 USDC from the vault (2,687.68 USDC per WETH). | [`0x186b…6f95`](https://sepolia.etherscan.io/tx/0x186b88a70bb068b016b5eeefcc3bcf5052096b091c7b1fe5cb4f12a173bf6f95) |
| 16:32:24 | 11787387 | The wallet approves PoolSwapTest (`0x9B6b…6eEe`) for exactly 0.0001 WETH. | [`0x8fb9…fe15`](https://sepolia.etherscan.io/tx/0x8fb9c21d0abe39f34de503b528479ad4e2eb86fabb125fe1baa188c02fc1fe15) |
| 16:32:36 | 11787388 | The wallet swaps 0.0001 WETH in the v4 pool and receives 0.244613 USDC (2,446.13 USDC per WETH). The hook, CastleJITHook, fills the swap from `hen` in the same transaction. | [`0x4749…d0ad`](https://sepolia.etherscan.io/tx/0x4749dfc222b00fb3d3c6793c31394cfc352b03cf3ad0bc5a9883b10e4defd0ad) |
| 16:33 | 11787390–11787391 | fi docks the `hen` strategy that filled the swap and ships it again at fee's current price. | dock [`0x0e66…7522`](https://sepolia.etherscan.io/tx/0x0e6673512092739bbe0cd4e5c3e12fec2c88011228e9d783a84fe4fb9dc47522), ship [`0xf27b…4b78`](https://sepolia.etherscan.io/tx/0xf27bbc9603079004f5dbfc7193b66cbae4bb20a6a151190a05e403e9e3b64b78) |
| 12:56:24 | 11786356 | From the live run: fi's ship of a third strategy, `greedy`, reverts with `OverAllocated(WETH, 0.003904, 0.003718)` because it would take the WETH allocations past fum's 2× limit. | [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) (failed) |

## Shot list

The start time and length of each shot are those in script.md.

| # | Start | Length | Picture | Transactions on screen |
|---|---|---|---|---|
| 1 | 0:00 | 22 s | The title card: a drawing of the vault, the fee·fi·fo·fum lettering, the line "1inch Aqua vault · ENS quotes · Uniswap v4 hook", the handoff logo and "ETHGlobal Tokyo 2026 · Sepolia". | – |
| 2 | 0:21 | 22 s | The dapp 2.0.2 at https://handoff.lol/app/impecc/fee-fi-fo-fum before a wallet is connected. The page shows its introduction, YOUR WALLET, and THE VAULT with the vault balance (6.23 USDC and 0.001429 WETH) and the USDC and WETH allocation meters against fum's 2× limit. | – |
| 3 | 0:43 | 17 s | The new test wallet 0xf807…3309 connects with 0.0024 Sepolia ETH and no tokens. It wraps 0.0002 ETH into WETH from the test-tokens box under the wallet balances. | wrap [`0x63c7…bd0f`](https://sepolia.etherscan.io/tx/0x63c720b6fc80a8d82a5005cb35ae24bc9082c866746b0995d8687940eeffbd0f) |
| 4 | 1:01 | 23 s | SWAP is set to pay 0.0001 WETH for USDC. The HARP card reads the text record of quote.feefifofum.eth through CCIP-Read and then shows fi's signed quote with its 30 s validity bar, and fo's line compares it with the v4 pool's quote. | none (the quote is served off-chain) |
| 5 | 1:23 | 19 s | "Fill this quote" runs two steps. The wallet approves exactly 0.0001 WETH for the SwapVM router, then sends the fill, and each step shows "done" with its Etherscan link. | approve [`0x0e16…b778`](https://sepolia.etherscan.io/tx/0x0e16aa02085e9f094532b97a3d624ad97bb9b0c5709e2700f9fa6229f568b778), fill [`0x186b…6f95`](https://sepolia.etherscan.io/tx/0x186b88a70bb068b016b5eeefcc3bcf5052096b091c7b1fe5cb4f12a173bf6f95) |
| 6 | 1:42 | 10 s | Sepolia Etherscan shows the fill as one successful transaction: 0.0001 WETH goes from the wallet through the router into the vault, and 0.268768 USDC goes from the vault to the wallet. | [`0x186b…6f95`](https://sepolia.etherscan.io/tx/0x186b88a70bb068b016b5eeefcc3bcf5052096b091c7b1fe5cb4f12a173bf6f95) |
| 7 | 1:53 | 26 s | Back on the dapp, the HARP card reads "Filled." and the HEN card shows the V4Quoter's price for the same 0.0001 WETH (about 0.24 USDC) next to the RFQ price. "Swap through the v4 pool" runs the approval of exactly 0.0001 WETH for PoolSwapTest and then the swap. | approve [`0x8fb9…fe15`](https://sepolia.etherscan.io/tx/0x8fb9c21d0abe39f34de503b528479ad4e2eb86fabb125fe1baa188c02fc1fe15), swap [`0x4749…d0ad`](https://sepolia.etherscan.io/tx/0x4749dfc222b00fb3d3c6793c31394cfc352b03cf3ad0bc5a9883b10e4defd0ad) |
| 8 | 2:19 | 10 s | The Logs tab of the swap transaction on Etherscan (13 logs) scrolls through the WETH and USDC transfers, Aqua's Pulled and Pushed events for the vault, and the SwapVM router's Swapped event for the hook's fill of 0.0001 WETH for 244613 USDC units. | [`0x4749…d0ad`](https://sepolia.etherscan.io/tx/0x4749dfc222b00fb3d3c6793c31394cfc352b03cf3ad0bc5a9883b10e4defd0ad) |
| 9 | 2:29 | 12 s | The dapp after the swap. The wallet holds 0.51 USDC and no WETH. THE VAULT lists only harp while fi docks the hook strategy and ships it again at the current price. The HEN card reads "Swapped." with both steps done, and YOUR TRADES lists the wrap, the RFQ fill and the v4 swap with their transaction links. | dock [`0x0e66…7522`](https://sepolia.etherscan.io/tx/0x0e6673512092739bbe0cd4e5c3e12fec2c88011228e9d783a84fe4fb9dc47522), ship [`0xf27b…4b78`](https://sepolia.etherscan.io/tx/0xf27bbc9603079004f5dbfc7193b66cbae4bb20a6a151190a05e403e9e3b64b78) |
| 10 | 2:41 | 11 s | Etherscan shows the live run's failed transaction in which fi tried to ship a third strategy, greedy, into CastleVault. The error is OverAllocated(WETH, 0.003904, 0.003718). | [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) (failed) |
| 11 | 2:52 | 7 s | The replay at https://handoff.lol/app/impecc/fee-fi-fo-fum-tale, reading the vault service's stream. It shows the ALLOCATIONS section with the reverted greedy ship, the list of strategies, and the HARP and HEN panels. | – |
| 12 | 2:59 | 28 s | The feefifofum project page on handoff.lol, showing the goals and tasks, the agent each was assigned to, and their verified status. | – |
| 13 | 3:27 | 11 s | The README of the GitHub repository https://github.com/34r7h/fee-fi-fo-fum. | – |

## Voiceover

This text is identical to script.md. The captions in feefifofum-demo.srt carry the same words with finer timings.

**00:00** (22 s)

This is feefifofum, our Continuity entry for ETHGlobal Tokyo, built on handoff by a team of AI agents. It is a market-making vault on Ethereum Sepolia. One token balance backs two ways to trade with it. Solvers can get signed quotes through an ENS name, and anyone can swap on a Uniswap v4 pool that the vault fills during each swap.

**00:21** (22 s)

The vault is a 1inch Aqua maker. Its tokens stay in the vault while Aqua records how much each strategy may use, so two strategies can draw on the same balance. Together they are committed to more than the vault holds, which is safe because each token can only be traded out once. The agent fum caps the total at two times the balance, and the contract enforces that limit.

**00:43** (17 s)

I'll use the page the way a user would, with a new test wallet that holds only Sepolia ETH. I connect it and wrap a little ETH into WETH.

**01:01** (23 s)

First, the RFQ strategy, which we call harp. The page asks the ENS name quote.feefifofum.eth for a quote to sell 0.0001 WETH. The resolver reverts with an OffchainLookup, our gateway returns a quote signed by the vault's signer, and the resolver checks that signature. Getting the quote costs no gas, and it is valid for 30 seconds.

**01:23** (19 s)

I fill it. The wallet approves exactly 0.0001 WETH, and the trade goes through the 1inch SwapVM router, where our pricing instruction checks the signature and the expiry again.

**01:42** (10 s)

On Etherscan, the fill is a single transaction. WETH goes into the vault, Aqua records the pull and the push, and USDC comes back at the quoted price.

**01:53** (26 s)

Next is the Uniswap v4 pool, which has no liquidity deposited in it. The page shows the V4 quoter's price next to the RFQ price, so you can see which one pays more. I swap the same amount, and our hook fills the whole swap from the vault's second strategy inside the same transaction.

**02:19** (10 s)

The logs show the hook's JitFill event, the Aqua pull and push on the vault, and the pool manager's swap event, whose amounts read zero because the hook filled the trade.

**02:29** (12 s)

The swap moved the second strategy's price away from the market, so the pricing agent had the signer agent replace it at the current price. Both trades are listed on the page with links to their transactions.

**02:41** (11 s)

In our first live run, the agents tried to add a third strategy that asked for half the balance again. The vault reverted it with OverAllocated, because it would have gone past fum's limit.

**02:52** (7 s)

A second page replays that first run from the service's event stream, with every step and its transaction.

**02:59** (28 s)

We built this on handoff, where AI agents work from a shared project board. The orchestrator agent, SirKit, wrote the spec and split it into goals and tasks. mister-anderson wrote the contracts, agent-smith wrote the service and the four agents that run the vault, impecc built the pages, and agy tested each step on a fork and then checked every live transaction. A task only counted as done once another agent verified it, and the human operator made the product decisions.

**03:27** (11 s)

The contracts are verified on Sourcify. The code, the tests, a record of every transaction, and a file listing which agent wrote each part are in the GitHub repository.

## Rules for the edit

- The video is recorded in real time, with no speed-up. Waits for blocks are cut rather than sped up.
- Every transaction on screen is a real Sepolia transaction: the five from the test wallet and the dock and ship that followed them, plus the live run's reverted greedy ship.
- Money figures on screen must be readable at 1080p.
- The redubbed voiceover follows the captions in feefifofum-demo.srt word for word, so the burned-in captions still match.

The pitch deck that goes with the video is https://claude.ai/artifact/D5PyqDuPhGFu69R3NGp958 (10 slides, private until the operator shares it).
