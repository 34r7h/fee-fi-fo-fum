# feefifofum: demo video

This file describes the demo video for the ETHGlobal Tokyo 2026 submission in the Continuity track (1inch Aqua, Uniswap and ENS). SirKit recorded it on 26 September 2026, and the final cut is take 5. It runs 3:38 at 1920×1080 and was recorded in real time with no speed-up. Take 2 was dropped because its re-centre shot still showed the hook strategy docked. The files are feefifofum-demo.mp4 (captions burned in), feefifofum-demo-nocaptions.mp4, feefifofum-demo.srt (the captions) and script.md (the voiceover by shot, with start times). The operator will redub the voiceover from the captions, so the voiceover below is identical to script.md.

The video has 13 shots taken from five sources: the dapp 2.0.2 at https://handoff.lol/app/impecc/fee-fi-fo-fum, Sepolia Etherscan, the live-run replay at https://handoff.lol/app/impecc/fee-fi-fo-fum-tale, the feefifofum project page on handoff.lol, and the GitHub README. The trades in the video were made on camera from a new test wallet, `0x2cFffC9DdCDE0419e8bB73695c16Bb8f7400a199`, that held only Sepolia ETH when the recording started. Each approval is for the exact amount traded. The one transaction that does not come from this wallet or from the re-centre that followed its swap is the reverted greedy ship, which comes from the live run recorded in [agents/live-run/11786346](../agents/live-run/11786346/README.md).

## Transactions in the video

All times are UTC on 26 September 2026, taken from the block timestamps. The dock and the ship are taken from the vault service's stream, where the dock carries the reason `re-centre`.

| Time | Block | What happens | Tx |
|---|---|---|---|
| 17:00:48 | 11787525 | The test wallet wraps 0.0003 ETH into WETH. | [`0xa6ab…4e83`](https://sepolia.etherscan.io/tx/0xa6ab764fe06d4f4630a6e510ae475c51c1a817df5aa06f759baf46c4f82d4e83) |
| 17:01:36 | 11787529 | The wallet approves the SwapVM router (`0xeDB6…70f9`) for exactly 0.0001 WETH. | [`0x5f3d…81c8`](https://sepolia.etherscan.io/tx/0x5f3d3c03219db9d1769898eed46dc32ca4c56be10c673824a7f6a4f27a1581c8) |
| 17:01:48 | 11787530 | The wallet fills the RFQ quote from `harp`, paying 0.0001 WETH and receiving 0.268943 USDC from the vault (2,689.43 USDC per WETH). | [`0xd563…8bd0`](https://sepolia.etherscan.io/tx/0xd563f576b37c2b8225e16381f3487991996bf551a70457913ac94d4c8ef68bd0) |
| 17:02:36 | 11787534 | The wallet approves PoolSwapTest (`0x9B6b…6eEe`) for exactly 0.0001 WETH. | [`0x6aef…d1c6`](https://sepolia.etherscan.io/tx/0x6aef51b468c56c76213fb56f21bba985aefb97b5b8af8196e2ac2c93cb8dd1c6) |
| 17:02:48 | 11787535 | The wallet swaps 0.0001 WETH in the v4 pool and receives 0.251282 USDC (2,512.82 USDC per WETH). The hook, CastleJITHook, fills the swap from `hen` (strategy `0x4db7…67b1`) in the same transaction, and the PoolManager's Swap log shows amount0 and amount1 of 0. | [`0x3489…9246`](https://sepolia.etherscan.io/tx/0x3489324ef67e5824e8356754758b55bbe83b78ae21be129cd0adb67f28979246) |
| 17:03:00 | 11787536 | fi docks that `hen` strategy for a re-centre after the swap moved its price. | [`0xfca5…6758`](https://sepolia.etherscan.io/tx/0xfca50f53688544b47e54893e1bb0b2c276105499e06db20791ba933acb826758) |
| 17:03:12 | 11787537 | fi ships `hen` again at fee's current price (strategy `0x5b0d…26ea`, 3.528501 USDC and 0.001311 WETH). | [`0x468b…8f9b`](https://sepolia.etherscan.io/tx/0x468b4e9618e3a5b7949777755aad9d33cf2431bda623f33ea835638941848f9b) |
| 12:56:24 | 11786356 | From the live run: fi's ship of a third strategy, `greedy`, reverts with `OverAllocated(WETH, 0.003904, 0.003718)` because it would take the WETH allocations past fum's 2× limit. | [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) (failed) |

## Shot list

The start time and length of each shot are those in script.md.

| # | Start | Length | Picture | Transactions on screen |
|---|---|---|---|---|
| 1 | 0:00 | 22 s | The title card: a drawing of the vault, the fee·fi·fo·fum lettering, the line "1inch Aqua vault · ENS quotes · Uniswap v4 hook", the handoff logo and "ETHGlobal Tokyo 2026 · Sepolia". | – |
| 2 | 0:21 | 22 s | The dapp 2.0.2 at https://handoff.lol/app/impecc/fee-fi-fo-fum before a wallet is connected. The page shows its introduction, YOUR WALLET, and THE VAULT with the vault balance (4.93 USDC and 0.001929 WETH), the USDC and WETH allocation meters against fum's 2× limit, and the two live strategies, harp and hen. | – |
| 3 | 0:43 | 18 s | The new test wallet 0x2cFf…a199 connects with 0.00134 Sepolia ETH and no tokens. It wraps 0.0003 ETH into WETH from the test-tokens box under the wallet balances, and the wrap step shows "done" with its link. | wrap [`0xa6ab…4e83`](https://sepolia.etherscan.io/tx/0xa6ab764fe06d4f4630a6e510ae475c51c1a817df5aa06f759baf46c4f82d4e83) |
| 4 | 1:01 | 23 s | SWAP is set to pay 0.0001 WETH for USDC. The HARP card reads the text record of quote.feefifofum.eth through CCIP-Read and shows fi's signed quote of 0.27 USDC (2,689.43 USDC per WETH) with its 30 s validity bar. The HEN card shows the v4 pool's 0.25 USDC, and fo's line says the RFQ strategy pays 7.0% more. | none (the quote is served off-chain) |
| 5 | 1:24 | 19 s | "Fill this quote" runs two steps. The wallet approves exactly 0.0001 WETH for the SwapVM router, then sends the fill, and each step shows its state and Etherscan link. | approve [`0x5f3d…81c8`](https://sepolia.etherscan.io/tx/0x5f3d3c03219db9d1769898eed46dc32ca4c56be10c673824a7f6a4f27a1581c8), fill [`0xd563…8bd0`](https://sepolia.etherscan.io/tx/0xd563f576b37c2b8225e16381f3487991996bf551a70457913ac94d4c8ef68bd0) |
| 6 | 1:43 | 10 s | Sepolia Etherscan shows the fill as one successful transaction in block 11787530: 0.0001 WETH goes from the wallet through the router into the vault, and 0.268943 USDC goes from the vault to the wallet. | [`0xd563…8bd0`](https://sepolia.etherscan.io/tx/0xd563f576b37c2b8225e16381f3487991996bf551a70457913ac94d4c8ef68bd0) |
| 7 | 1:53 | 26 s | Back on the dapp, YOUR TRADES lists the RFQ fill and the wrap. The HEN card shows the V4Quoter's price for the same 0.0001 WETH next to the RFQ price, and "Swap through the v4 pool" runs the approval of exactly 0.0001 WETH for PoolSwapTest and then the swap. | approve [`0x6aef…d1c6`](https://sepolia.etherscan.io/tx/0x6aef51b468c56c76213fb56f21bba985aefb97b5b8af8196e2ac2c93cb8dd1c6), swap [`0x3489…9246`](https://sepolia.etherscan.io/tx/0x3489324ef67e5824e8356754758b55bbe83b78ae21be129cd0adb67f28979246) |
| 8 | 2:19 | 10 s | The Logs tab of the swap transaction on Etherscan (13 logs) scrolls past Aqua's Pulled and Pushed events and the token transfers to the hook's JitFill log (0.0001 WETH in, 251282 USDC units out, from the hen strategy 0x4db7…67b1) and the PoolManager's Swap log, whose amount0 and amount1 are both 0 because the hook filled the swap. | [`0x3489…9246`](https://sepolia.etherscan.io/tx/0x3489324ef67e5824e8356754758b55bbe83b78ae21be129cd0adb67f28979246) |
| 9 | 2:29 | 12 s | The dapp, recorded again a few minutes after the swap from the same wallet and with no transactions. The wallet holds 0.52 USDC and 0.0001 WETH, THE VAULT lists harp and the re-centred hen, and the HEN card shows its quote after the re-centre (0.25 USDC for 0.0001 WETH) next to the RFQ quote. | dock [`0xfca5…6758`](https://sepolia.etherscan.io/tx/0xfca50f53688544b47e54893e1bb0b2c276105499e06db20791ba933acb826758) and ship [`0x468b…8f9b`](https://sepolia.etherscan.io/tx/0x468b4e9618e3a5b7949777755aad9d33cf2431bda623f33ea835638941848f9b) happened before this shot |
| 10 | 2:41 | 11 s | Etherscan shows the live run's failed transaction in which fi tried to ship a third strategy, greedy, into CastleVault. The error is OverAllocated(WETH, 0.003904, 0.003718). | [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) (failed) |
| 11 | 2:52 | 7 s | The replay at https://handoff.lol/app/impecc/fee-fi-fo-fum-tale, reading the vault service's stream. It shows THE VAULT, the ALLOCATIONS meters with the reverted greedy ship, and the list of strategies, in which every earlier hen is docked and the newest one is live with 3.53 USDC and 0.001311 WETH. | – |
| 12 | 2:59 | 28 s | The feefifofum project page on handoff.lol, showing the goals and tasks, the agent each was assigned to, and their verified status. | – |
| 13 | 3:27 | 11 s | The README of the GitHub repository https://github.com/34r7h/fee-fi-fo-fum. | – |

## Voiceover

This text is identical to script.md. The captions in feefifofum-demo.srt carry the same words with finer timings.

**00:00** (22 s)

This is feefifofum, our Continuity entry for ETHGlobal Tokyo, built on handoff by a team of AI agents. It is a market-making vault on Ethereum Sepolia. One token balance backs two ways to trade with it. Solvers can get signed quotes through an ENS name, and anyone can swap on a Uniswap v4 pool that the vault fills during each swap.

**00:21** (22 s)

The vault is a 1inch Aqua maker. Its tokens stay in the vault while Aqua records how much each strategy may use, so two strategies can draw on the same balance. Together they are committed to more than the vault holds, which is safe because each token can only be traded out once. The agent fum caps the total at two times the balance, and the contract enforces that limit.

**00:43** (18 s)

I'll use the page the way a user would, with a new test wallet that holds only Sepolia ETH. I connect it and wrap a little ETH into WETH.

**01:01** (23 s)

First, the RFQ strategy, which we call harp. The page asks the ENS name quote.feefifofum.eth for a quote to sell 0.0001 WETH. The resolver reverts with an OffchainLookup, our gateway returns a quote signed by the vault's signer, and the resolver checks that signature. Getting the quote costs no gas, and it is valid for 30 seconds.

**01:24** (19 s)

I fill it. The wallet approves exactly 0.0001 WETH, and the trade goes through the 1inch SwapVM router, where our pricing instruction checks the signature and the expiry again.

**01:43** (10 s)

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
- Every transaction on screen is a real Sepolia transaction: the five from the test wallet, the dock and ship that followed them, and the live run's reverted greedy ship.
- Money figures on screen must be readable at 1080p.
- The redubbed voiceover follows the captions in feefifofum-demo.srt word for word, so the burned-in captions still match.

The pitch deck that goes with the video is https://claude.ai/artifact/D5PyqDuPhGFu69R3NGp958 (10 slides, private until the operator shares it).
