# a-live, the live run on Sepolia (Sat 26 Sep, 12:43–13:03 UTC)

This directory records the demo's one live run on Ethereum Sepolia. The run used the contracts deployed by c-deploy,
which are CastleVault [`0x0fa4…7A98`](https://sepolia.etherscan.io/address/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98),
PriceExtruction `0xda14…E757`, OffchainQuoteResolver `0x2D18…A76a` and CastleJITHook `0x8901…0888`, together with
the ENS name `quote.feefifofum.eth`. Each phase was sent after SirKit approved it, once its gas had been measured on a
fork. The crew (fee, fi, fo and fum) ran from this repository at commit `5f0d049`, each agent with its own key,
against the castle service at `https://handoff.lol/t/castle`. agy acted as the test taker and ran `scripts/jack.mjs`
with its own key. Every transaction from the crew and from agy was sent at a max fee of 1.8 gwei with a 0.1 gwei tip,
and every one except greedy was simulated first. greedy was sent without a simulation because its revert is what the
phase demonstrates.

| Phase | Who | Tx | Block | Gas |
|---|---|---|---|---|
| A | treasury | Sent USDC to the vault [`0x7e0b…e8a6`](https://sepolia.etherscan.io/tx/0x7e0b4a9f0fa7b8920b2f5188de6cfcebbed61c5dfdbf80110da4c1604cb5e8a6), wrapped ETH [`0xd125…d543`](https://sepolia.etherscan.io/tx/0xd125c4919b722aeebda218b7ae2f794e5956afa6e325784829ea215b26d8f543) and sent WETH to the vault [`0x3484…eb3b`](https://sepolia.etherscan.io/tx/0x3484012803e8bc9a1b687326cfc27a727755d03d3c4ec80fd9a52b68d1a3eb3b), in all 5 USDC and 5/mid WETH (1,858,991,757,230,548 wei) | 11786292–94 | 154,003 |
| B | fum | Set leverage to 2× for USDC [`0x5333…e5f7`](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7) and WETH [`0xcf95…54f9`](https://sepolia.etherscan.io/tx/0xcf95760df456850bb1db11811c887c06fae925611984c7fc4e188f838b1a54f9) with `setLeverage`, and set the caps of slot 0 [`0xd2fb…88b5`](https://sepolia.etherscan.io/tx/0xd2fbb4f8db826c5a202d4724da0767b10ebf8be666751f1324c91b467ba788b5), slot 1 [`0x3d14…8970`](https://sepolia.etherscan.io/tx/0x3d145621afcd2d43c97a400139b8f5caee7768d6f3e4477dddc4723e5b568970) and slot 2 [`0x1b24…481f`](https://sepolia.etherscan.io/tx/0x1b24490f1c5a1ae23ab58d8d1c79508c9ba85903b06b9735b73ef2f0d068481f) to the vault's whole balance with `setCap` | 11786346–50 | 274,453 |
| C | fi | Shipped harp [`0x1571…095a`](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) and hen [`0x5d7b…d6ce`](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) with `ship`, each with 80% of the vault's balance. The greedy ship [`0x647a…d0ba`](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) asked for 0.5× more with a manual 90k gas limit and reverted with `OverAllocated(WETH, 3903882690184150, 3717983514461096)` | 11786354–56 | 527,875 |
| D | agy | Approved the router [`0xb1e0…5cfb`](https://sepolia.etherscan.io/tx/0xb1e065aa641b2c4625d0bdbd9ef28926164426cf87a608e3e72b1fd9846e5cfb), then filled `quote:USDC:WETH:500000`, resolved by CCIP-Read (`q1-live.json`), with `router.swap` [`0x763d…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8), paying 0.5 USDC for 185,924,989,671,030 wei of WETH | 11786369–70 | 226,122 |
| E | agy | Approved PoolSwapTest [`0x1f84…f5b7`](https://sepolia.etherscan.io/tx/0x1f846b85087d0ae1c3c0e15f0cd723cc43cd0ed78cebb6f75a96f9472983f5b7), then swapped 0.5 USDC on the vault's v4 pool with `PoolSwapTest.swap` [`0x53f7…e116`](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116). CastleJITHook filled the swap from hen in the same transaction, for 164,969,810,023,109 wei of WETH | 11786371–72 | 333,783 |
| F | fee, fi | fee read hen's price at 3,399.91 against a mid of 2,686.57 (2,098 bps apart) and asked for a re-centre. fi docked hen [`0x32a2…638a`](https://sepolia.etherscan.io/tx/0x32a20d169556fd013eaa69cb2dc2db2108275c9513d36e24b0886ceab23d638a) and shipped it again at the mid [`0x03db…67f3`](https://sepolia.etherscan.io/tx/0x03dbf62b16214b7bf36dce5b742ad80c7deccc466a9925328f9b26a817e267f3) | 11786373–74 | 270,071 |
| — | fo | Routed a UniswapX-format order (0.5 USDC to WETH, swapper agy) that arrived through `castle_route` over MCP. harp offered 185,924,989,671,030 and the v4 pool 160,819,112,822,369, so fo routed the order to harp (`intent.routed` i-1790427777-1). No transaction was sent | | |

Phases B to F used 1,632,304 gas and cost 0.001852157 ETH, at effective gas prices of 1.02 to 1.21 gwei. fum docked
nothing, because harp and hen at 80% each add up to 1.6×, which is inside the 2× leverage limit.

The following checks were read from Sepolia after the run.
- After phase B, `leverageOf` is 20000 for both tokens, and `capOf` is the vault's whole balance for slots 0–2.
- After phase C, slots 0 and 1 hold harp and hen, and slot 2 is empty.
- The `quoteSig` in `q1-live.json` recovers to fi under PriceExtruction's EIP-712 domain, and the calldata of the
  phase D fill carries that exact signature and `takerTraitsAndData`.

| File | What |
|---|---|
| `txs.json` | Every tx above, from its receipt: from, nonce, block, status, gas used, effective and max fee, cost |
| `q1-live.json` | The quote record `getEnsText` returned for D, the one that was filled |
| `jack-D.json`, `jack-E.json` | agy's `jack.mjs` result lines |
| `stream.jsonl`, `state.json` | The castle stream replayed from `?since=0` (the snapshot, then 61 events) and `/state`, both after the route |
| `logs/` | fee, fi, fo and fum as they ran |
