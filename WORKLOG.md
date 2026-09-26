# WORKLOG

The running record of the feefifofum build: what was done, who did it, which commit, and where it lives on-chain. SirKit (orchestrator) regenerates it from the handoff board and the evidence agents submit. Agents do not edit it by hand.

- **Handoff project:** `de902056-080b-480f-a95e-dd821b678795` (feefifofum), team `team_da74ee43`, requester SirKit
- **Repo:** https://github.com/34r7h/fee-fi-fo-fum
- **Spec:** [docs/SPEC.md](docs/SPEC.md), from agy's brief [docs/PIVOT.md](docs/PIVOT.md) and korg's [docs/research.md](docs/research.md)
- **Deadline:** Sun 27 Sep 00:00 UTC
- **Pre-existing product:** handoff (private), baseline `079f8f0`
- **Earlier product:** the lease edition, retired at 10:51Z on Sat 26 Sep. Its code and full worklog are at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition).
- **Last regenerated:** Sat 17:14Z

All times are UTC. Status key: `todo`, `in_progress`, `review` (pending verification), `done` (verified).

## Board

### Spec lock

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| **BLOCKER** Research gate: prize rules, Sepolia deployments, and the CCIP-Read path <br>`research` `53d4d720` | korg | korg | Sat 12:15Z | done | d6d21a1 | fork probe: register(quote) + UR OffchainLookup |
| **BLOCKER** Lock docs/SPEC.md <br>`spec` `3136bd1d` | SirKit | SirKit | Sat 12:45Z | done | d70dafa | agy PASS (v-spec) |
| Validate SPEC.md against the architecture <br>`v-spec` `c7d24d0e` | agy | agy | Sat 13:00Z | done | d70dafa | PASS; SirKit re-ran CastleVault.t.sol: 19 passed |

### Contracts: the Castle vault, the v4 JIT hook and the CCIP-Read resolver

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| **BLOCKER** Castle vault: one Aqua balance backs many SwapVM strategies, and fum's caps stop over-allocation <br>`c-vault` `d9d935bc` | mister-anderson | mister-anderson | Sat 16:00Z | done | bf77b95, 98b48b8 | fork: beat 1 end to end; deploy 2.63M gas |
| **BLOCKER** Uniswap v4 JIT hook: swaps filled just in time from the Castle <br>`c-hook` `18cafd6e` | mister-anderson | mister-anderson | Sat 18:00Z | done | c348dda | fork 6/6 re-run by SirKit |
| **BLOCKER** CCIP-Read resolver for quote.feefifofum.eth, with its signature scheme <br>`c-ccip` `68662597` | mister-anderson | mister-anderson | Sat 17:00Z | done | 804741e, eb01aa5, db0743b | quote-fork PASS re-run by SirKit |
| One live deploy: vault, hook, resolver and the quote name <br>`c-deploy` `bb9f6fbe` | mister-anderson | mister-anderson | Sat 21:00Z | done | 98428e7, 9e443dd | 5 txs + register; 0.007071 ETH total |

### Crew agents and the castle service

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| **BLOCKER** Crew agents: fee prices, fi compiles, fo routes, fum guards <br>`a-crew` `29e2bfea` | agent-smith | agent-smith | Sat 18:00Z | done | 006698a..1aa208a | fork-run agents/fork-run/11786199 |
| **BLOCKER** Castle service: CCIP-Read gateway, MCP tools for solvers, and the stream <br>`a-gateway` `93785681` | agent-smith | agent-smith | Sat 18:30Z | done | 2d44311..bab6080 | live: CCIP-Read through UR resolves |
| **BLOCKER** Browser module for the dapp: the harp quote, the fill and the hen swap <br>`a-dapplib` `a276992b` | agent-smith | agent-smith | Sat 15:30Z | done |  |  |

### handoff.lol platform support

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| handoff.lol: CCIP-Read-ready castle tunnel <br>`h-platform` `dff91a5e` | handoff-claude | handoff-claude | Sat 15:00Z | done | no handoff repo change | CORS, fi key on helen, durable units, Sepolia payouts |

### Miniapp, deck and video

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| Miniapp: one hoard, every market <br>`m-miniapp` `0a8f80ab` | impecc | impecc | Sat 21:30Z | done | d4a53a0 | published v1.1.0 |
| Deck and video script <br>`m-deck` `04cf6e79` | impecc | impecc | Sat 23:00Z | done | 3adb718, b681da0 | deck artifact v6 (private; the operator shares it) |
| The tale: the storybook retelling as a second miniapp <br>`m-tale` `3f88c126` | impecc | impecc | Sat 16:30Z | done |  |  |
| **BLOCKER** The dapp: the main miniapp is the web3 interface <br>`m-dapp` `9ef75e7f` | impecc | impecc | Sat 18:00Z | done |  |  |

### Validation and the one live run

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| The one live run on Sepolia <br>`a-live` `a92e968f` | agent-smith | agent-smith | Sat 22:00Z | done | 4d1f983, cacf0f8 | agents/live-run/11786346: 17 txs |
| **BLOCKER** Fork end-to-end of the whole demo (two passes) <br>`v-e2e` `48b54583` | agy | agy | Sat 20:00Z | done | dbb243d | two post-deploy fork passes, distinct txs |
| Verify the live run on-chain <br>`v-live` `e113e331` | agy | agy | Sat 22:30Z | done |  | PASS: every live tx, balances, live CCIP-Read |
| Validate the dapp live from a clean browser <br>`v-dapp` `93e81dc2` | agy | agy | Sat 19:30Z | review |  |  |

### Submission

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| README, sponsor write-ups and FEEDBACK <br>`s-writeups` `ae2058f7` | mister-anderson | mister-anderson | Sat 23:00Z | done | fadf7a4..4ac2fba | 102 links, 0 bad; live txs filled |
| AI_USAGE.md and WORKLOG.md <br>`s-ai` `e16fb6a1` | SirKit | SirKit | Sat 23:30Z | todo |  |  |
| OPERATOR: record the video and submit on ETHGlobal <br>`s-submit` `fd56d78b` | OPERATOR |  | Sat 23:59Z | todo |  |  |

## Contracts (Ethereum Sepolia)

| Contract | Address | Verified | Deployed by | Tx |
|---|---|---|---|---|
| PriceExtruction | [`0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757`](https://sepolia.etherscan.io/address/0xda14a4e0cC06eaFcd6Da1905C033b3c1224aE757) | Sourcify exact_match | mister-anderson | [0x86569016…](https://sepolia.etherscan.io/tx/0x86569016c696bbcb10d4a340e7aa6e44134d971c8756fac0db6c55d5bea9d5d5) (823,693 gas) |
| CastleVault | [`0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98`](https://sepolia.etherscan.io/address/0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98) | Sourcify exact_match | mister-anderson | [0xc561b03e…](https://sepolia.etherscan.io/tx/0xc561b03ec7b32b3aee21a4f1be3af465de845f957273047495ca20b57253947b) (2,632,135 gas) |
| OffchainQuoteResolver | [`0x2D18c04Aec64f93255a417d56Cfdc5577712A76a`](https://sepolia.etherscan.io/address/0x2D18c04Aec64f93255a417d56Cfdc5577712A76a) | Sourcify exact_match | mister-anderson | [0xce331a35…](https://sepolia.etherscan.io/tx/0xce331a3546bdef04661f6be9a65690e743fd657b8e9ee85a4bdea9fa3629f8f1) (1,363,439 gas) |
| CastleJITHook (CREATE2, flags 0x888) | [`0x890125413c9FeDB770D872BbA9415f5E1B7C0888`](https://sepolia.etherscan.io/address/0x890125413c9FeDB770D872BbA9415f5E1B7C0888) | Sourcify exact_match | mister-anderson | [0x70bca459…](https://sepolia.etherscan.io/tx/0x70bca459512ff6f5c59bb3333b19d013f8b2f9b3069dcdffe9f5768ac427b9e5) (1,632,010 gas) |
| v4 pool USDC/WETH, fee 0, tickSpacing 60, hook (no LP liquidity) | poolId `0xb1d82d46…ad112a` | initialized | mister-anderson | [0x9cf53df8…](https://sepolia.etherscan.io/tx/0x9cf53df8517a4e38d99ee6b03fbcc641d0dfefea4cd64822d9540a83fad7379e) (52,239 gas) |

## ENS names

| Name | Owner / resolver | Status | Tx |
|---|---|---|---|
| quote.feefifofum.eth | 0x67Cc…0C99; resolver OffchainQuoteResolver 0x2D18…A76a | live: UniversalResolverV2 reverts OffchainLookup (checked by SirKit) | [0xebd3cb53…](https://sepolia.etherscan.io/tx/0xebd3cb532669b8c6a6ea2a2dbe0a1f6c30586a861105980f7fa726123e01b258) (122,841 gas) |
| fee / fi / fo / fum / agy .feefifofum.eth | crew EOAs (see Agents) | live since the lease edition |  |

## Wallets

Live balances read at block 11787594.

| Wallet | handoff agent | Sepolia address | ENSv2 name | Funding txs | Live balance (ETH / USDC / WETH) |
|---|---|---|---|---|---|
| treasury (SirKit) | SirKit | [`0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2`](https://sepolia.etherscan.io/address/0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2) |  | 0.2131 ETH / 5.8 USDC left at 09:05Z, after the crew swept 0.0827 ETH back and 0.007 ETH funded the v3 deployer [0xce3ee83e…](https://sepolia.etherscan.io/tx/0xce3ee83e82134bde6a5199093f329ba60b11715e71a0a509e96172cbf3f340fd) (0.05 ETH in: [0x56611a5a…](https://sepolia.etherscan.io/tx/0x56611a5aa6825a47ca91c85081bb0cb59e743b7079adcab8381ed3924e75cdea)); +0.0186 ETH in: [0x5d37b019…](https://sepolia.etherscan.io/tx/0x5d37b01946d996dd8c456bc59ec0775f1378d21be5d65f7b9c1d9962b7494eac) (PoW faucet); 9 USDC → SirKit's handoff payer 0x6216…1D1C so payouts settle on ethereum-sepolia [0x49146985…](https://sepolia.etherscan.io/tx/0x4914698500bde6ebb629b747783984961e464a94fa1f15f1b2a7db0aad8aad93); 0.2 USDC → handoff-claude [0x5dd969c2…](https://sepolia.etherscan.io/tx/0x5dd969c2b2d5bb4a0a7ee98a571add1c7336dbffe4e72ba332824d2b00e5714c); 0.005 ETH → handoff's Sepolia relayer 0xE43a…5847 [0x0bddf9af…](https://sepolia.etherscan.io/tx/0x0bddf9afc437352c98d8084bb7a646c01c68d7a0dac9839a57302c50ef64ab89); 0.006 WETH refill → Castle after fi's claim [0x29a27da7…](https://sepolia.etherscan.io/tx/0x29a27da7f8a37aab96e92d49ad26ec507f35180405cf65f796c4c35177da18c0) | 0.19298 / 0.30 / 0.00000 |
| deployer (mister-anderson) | mister-anderson | [`0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73`](https://sepolia.etherscan.io/address/0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73) |  | 0.02 ETH [0x6d65d570…](https://sepolia.etherscan.io/tx/0x6d65d570d5f7eac8b00e741388c062d1f9e92ebb034b007563aa5facd94332cb) / 8 USDC [0x4422def9…](https://sepolia.etherscan.io/tx/0x4422def903a2962bfdec6af118c2244138772061deaaf91c7bff588cccc358db); +0.01 [0xdce622c4…](https://sepolia.etherscan.io/tx/0xdce622c4a601be72cd8ade8ac93b5be61bd2b0604eaefedccb236a582ce217cc); +0.04 ETH [0x02f63840…](https://sepolia.etherscan.io/tx/0x02f63840af945a471d17d0a90febd2416c96e00598ccc96da1a1e1cc07f264e4); +0.008 ETH for c-deploy [0x64d87869…](https://sepolia.etherscan.io/tx/0x64d878696bdcf9c53a15cb1762fef457e5d52a2acc2a183ee1d2eb57c3cc5e83) | 0.00407 / 0.33 / 0.00036 |
| korg | korg | [`0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E`](https://sepolia.etherscan.io/address/0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E) (self-custodied) |  | 0.008 ETH [0x13d35fd1…](https://sepolia.etherscan.io/tx/0x13d35fd1cbbfa60bd1ce50f9f0bf6737729124598529281366ad98df6d081881) | 0.00030 / 0.00 / 0.00000 |
| fee | fee | [`0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538`](https://sepolia.etherscan.io/address/0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538) | fee.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.005 ETH [0xb4a1bb3b…](https://sepolia.etherscan.io/tx/0xb4a1bb3b10ec04fc210e8f9ee4f3506571d30fde48f83daa771677bdf30b29e4) / 2 USDC [0x4a5bb82a…](https://sepolia.etherscan.io/tx/0x4a5bb82a1d606a90d154108a816bd73e02d86ba0ba1db1bffcf65f274843945e); +0.004 [0x8f71cc1f…](https://sepolia.etherscan.io/tx/0x8f71cc1f8d366688bfe900200c9009e125c61c951be579bedbd8ccf187dfa37c); +0.02 ETH [0x5e533b6e…](https://sepolia.etherscan.io/tx/0x5e533b6ebb8ecbbdf20c7be745536a26723dbc514d6fade8123e3a15b7103187) | 0.00300 / 2.10 / 0.00100 |
| fi | fi | [`0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2`](https://sepolia.etherscan.io/address/0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2) | fi.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.004 ETH [0x742d1ba8…](https://sepolia.etherscan.io/tx/0x742d1ba88af97c175cd2ee407a9e128876189576f4d4cacb3b3ba555b4daca1b) / 2 USDC [0xc5df2983…](https://sepolia.etherscan.io/tx/0xc5df298310764455ab7f7292214dac2df1bf04a922d9880aa359b3a48e1899bd); +0.004 [0x5e0c7655…](https://sepolia.etherscan.io/tx/0x5e0c7655b6ccb82a572dd9ca5978cdd1b11bec06e18a3e8c7b511c45d6ead3a9); +0.02 ETH [0xf7b1787b…](https://sepolia.etherscan.io/tx/0xf7b1787b0ef45ead0fb094fcf14888960e70e88ef66e0975433fb79aa0efbee6) | 0.00256 / 2.00 / 0.00100 |
| fo | fo | [`0x8689a407A2488A5b2f2De05d2C6978a798f93D56`](https://sepolia.etherscan.io/address/0x8689a407A2488A5b2f2De05d2C6978a798f93D56) | fo.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.001 ETH [0x0033036a…](https://sepolia.etherscan.io/tx/0x0033036adf3a82bc53bfb4e08c90592c30679981365985ccf242123fa883744b); +0.005 ETH [0xa4ade13b…](https://sepolia.etherscan.io/tx/0xa4ade13bad70596f7ab201a2b57d7d717f6554bd8da93a9a503ed88560b10fa2); 5 USDC [0x439268aa…](https://sepolia.etherscan.io/tx/0x439268aa2116dd0eab8768e7a5af7a6786d1cd484cfbfb8e7d9082761102f484) (backup auction bidder) | 0.00200 / 3.50 / 0.00088 |
| fum | fum | [`0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2`](https://sepolia.etherscan.io/address/0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2) | fum.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.003 ETH [0xd63f3304…](https://sepolia.etherscan.io/tx/0xd63f33041b7a3ac024ecaba8fb6c73eb0dd95e0b8c372c1ff8d2cc7582a709c6) / 2 USDC [0xad17fe88…](https://sepolia.etherscan.io/tx/0xad17fe88e2310c40cf758e8bd611e382a3226e48d414f5093713bda1a2578115); +0.002 [0xdc880c47…](https://sepolia.etherscan.io/tx/0xdc880c4714ce6eb5881934e72cd8063e47a981391fce53b7191bcc8835e3ef62); +0.02 ETH [0x16bab3ec…](https://sepolia.etherscan.io/tx/0x16bab3ec1fc09314d8cbc6b6726924b1f8e80352599065537ebc6d20c7ca8564) | 0.00069 / 2.00 / 0.00100 |
| castle (service) | castle (agent-smith; the castle EOA is the ENSv2 registry admin) | [`0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99`](https://sepolia.etherscan.io/address/0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99) |  | 0.005 ETH [0xaeba391d…](https://sepolia.etherscan.io/tx/0xaeba391d38c81761afbf1dd52db8365162e66e05d28f63d07a58811181746ceb) + [0x76c425e7…](https://sepolia.etherscan.io/tx/0x76c425e74d6123e6115529e22daea9c88d3ecd79af59b6104f2d112acd03c20d); +0.005 ETH [0x49d1e57c…](https://sepolia.etherscan.io/tx/0x49d1e57cdfd784a32d1ec6fb9b5cca7892ffd4afbc333ab8bef282688a678968) | 0.00023 / 0.00 / 0.00000 |
| agy | agy (validator; handoff wallet = this EOA via proof of possession, 105f1dd) | [`0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c`](https://sepolia.etherscan.io/address/0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c) | agy.feefifofum.eth (live; handoff ens_name set with ens_proof) | +0.01 ETH [0xd2636171…](https://sepolia.etherscan.io/tx/0xd263617119221dd770d137dc419ecc7c75c3092b950c390a9c2d78a427370566); 6 USDC [0x38ac01d8…](https://sepolia.etherscan.io/tx/0x38ac01d8f9aadc8009e48bf348ef7cf7a44e6f1315ed0077e759c5368a693a5f) (to bid as an outside solver); +5 USDC [0x7383f639…](https://sepolia.etherscan.io/tx/0x7383f639e32cde9075d8433e94fb5929e96a22a755c87f0bf91de3bde217d3a1) for the shift-change bid; +0.001 ETH for a-live [0xa0d70610…](https://sepolia.etherscan.io/tx/0xa0d706104cb42c621b80bf2ac63fd62b0ea0e40635e54ad5bd3fd62a692cdc10) | 0.00083 / 13.90 / 0.00053 |

## Service and miniapp

| Item | Value |
|---|---|
| Castle service | https://handoff.lol/t/castle/ (health: fiKeyLoaded true, stream v2) |
| Gateway (ERC-3668) | https://handoff.lol/t/castle/ccip/{sender}/{data}.json: live; getEnsText(quote.feefifofum.eth, castle) through UniversalResolverV2 returns the vault (checked by SirKit) |
| Miniapp: the dapp | https://handoff.lol/app/impecc/fee-fi-fo-fum (being rebuilt as the web3 interface, m-dapp, due 18:00Z) |
| Miniapp: the tale | https://handoff.lol/app/impecc/fee-fi-fo-fum-tale (the storybook, live from the castle stream; checked by SirKit in a fresh Chrome profile, 0 console errors) |

## Documentation

| Doc | Owner | Status |
|---|---|---|
| docs/SPEC.md (locked build scope) | SirKit | locked d70dafa, agy PASS |
| docs/PIVOT.md (architecture brief) | agy | 77d2b85 |
| docs/research.md (gates) | korg | verified d6d21a1 (SirKit re-ran the fork probe) |
| miniapp/STREAM.md (stream v2) | impecc | 08ba999 |
| docs/NAMING.md (voice and identifier map) | SirKit | rewritten 852b358 |
| README.md, docs/1inch.md, docs/uniswap.md, docs/ens.md, FEEDBACK.md | mister-anderson (from korg's skeletons); README voice by impecc | verified |
| Deck (claude.ai artifact, 10 slides) and docs/video-script.md | impecc | live txs filled |

## Demo evidence

| Beat | Tx / link | Verified by |
|---|---|---|
| A. Treasury funds the hoard: 5 USDC plus 5/mid WETH (0.001859 WETH at 2689.63) | [0x7e0b4a9f…](https://sepolia.etherscan.io/tx/0x7e0b4a9f0fa7b8920b2f5188de6cfcebbed61c5dfdbf80110da4c1604cb5e8a6), [0xd125c491…](https://sepolia.etherscan.io/tx/0xd125c4919b722aeebda218b7ae2f794e5956afa6e325784829ea215b26d8f543), [0x34840128…](https://sepolia.etherscan.io/tx/0x3484012803e8bc9a1b687326cfc27a727755d03d3c4ec80fd9a52b68d1a3eb3b) | SirKit (balances read back) |
| B. fum sets 2x leverage on both tokens and caps slots 0 to 2 | [0x53336098…](https://sepolia.etherscan.io/tx/0x533360983d9b137e5f2513f88c5a8c9d63003c60d0201b5c43fd92162fa0e5f7), [0xcf95760d…](https://sepolia.etherscan.io/tx/0xcf95760df456850bb1db11811c887c06fae925611984c7fc4e188f838b1a54f9), [0xd2fbb4f8…](https://sepolia.etherscan.io/tx/0xd2fbb4f8db826c5a202d4724da0767b10ebf8be666751f1324c91b467ba788b5), [0x3d145621…](https://sepolia.etherscan.io/tx/0x3d145621afcd2d43c97a400139b8f5caee7768d6f3e4477dddc4723e5b568970), [0x1b24490f…](https://sepolia.etherscan.io/tx/0x1b24490f1c5a1ae23ab58d8d1c79508c9ba85903b06b9735b73ef2f0d068481f) | SirKit (leverageOf and capOf read back) |
| 1. (Aqua) One balance backs harp and hen at 80% each (1.6x); greedy reverts OverAllocated(WETH, 3903882690184150, 3717983514461096) | [0x15711ddf…](https://sepolia.etherscan.io/tx/0x15711ddff90cc60b42144f8e62facb6cc4cd69bb6e3263956fe674bcc396095a) harp, [0x5d7bee55…](https://sepolia.etherscan.io/tx/0x5d7bee55fe98474b4fcdcef0940e5d03d0767da89d3f20290b19bb00fa1cd6ce) hen, [0x647aba61…](https://sepolia.etherscan.io/tx/0x647aba61fbb7442ccd986346c6acb8de2dae42eab5e5160ed950277dc7a9d0ba) greedy (reverted) | SirKit (receipts, plus a replay of greedy decoded as OverAllocated) |
| 2. (ENS) agy resolves quote.feefifofum.eth through UniversalResolverV2 plus CCIP-Read (quote q-1790427574-6, served via ccip, signed by fi) and fills it: 0.5 USDC for 0.000185925 WETH | [0xb1e065aa…](https://sepolia.etherscan.io/tx/0xb1e065aa641b2c4625d0bdbd9ef28926164426cf87a608e3e72b1fd9846e5cfb) approve, [0x763d6de1…](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8) fill (Aqua Pulled and Pushed) | SirKit (receipt events; the stream quote.served matches the fill) |
| 3. (Uniswap) agy swaps 0.5 USDC on the Castle's v4 pool; the hook fills it just in time from hen: 0.000164970 WETH | [0x1f846b85…](https://sepolia.etherscan.io/tx/0x1f846b85087d0ae1c3c0e15f0cd723cc43cd0ed78cebb6f75a96f9472983f5b7) approve, [0x53f773de…](https://sepolia.etherscan.io/tx/0x53f773ded5f3f8c8586d05c9129a897a0796a92ee0a1c27a1711ba708290e116) swap (one tx: Aqua Pulled and Pushed, hook JitFill, v4 Swap) | SirKit (receipt events) |
| F. fee sees hen drift from the mid after the v4 fill; fi docks and re-ships hen at the mid | [0x32a20d16…](https://sepolia.etherscan.io/tx/0x32a20d169556fd013eaa69cb2dc2db2108275c9513d36e24b0886ceab23d638a) dock, [0x03dbf62b…](https://sepolia.etherscan.io/tx/0x03dbf62b16214b7bf36dce5b742ad80c7deccc466a9925328f9b26a817e267f3) re-ship | SirKit |
| 4. The miniapp shows all three from a clean browser | https://handoff.lol/app/impecc/fee-fi-fo-fum | SirKit (a fresh browser profile) |

## Operator-owned contributions

ETHGlobal may exclude entries that rely entirely on AI. The operator's own decisions and work are listed here and mirrored in AI_USAGE.md.

| Time | Contribution |
|---|---|
| Sat 04:25Z | Ruled that nothing for the entry goes in the handoff repo; all work lives in feefifofum |
| Sat 04:40Z | Renamed the entry fee-fi-fo-fum, with a storybook voice for forward-facing copy (replaced at 14:24Z by the plain-writing rule) |
| Sat 04:47Z | Funded the treasury with 20 Circle Sepolia USDC (tx 0x1dc2132a810bd8f2551e337193a446bb507478f9d2be5a4dcc522f1e95fb4884) |
| Sat 05:00Z | Funded the treasury with 0.05 Sepolia ETH and a further 20 USDC |
| Sat 05:05Z | Sent Sepolia ETH to the treasury 0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2 |
| Sat 05:05Z | Linked the GitHub repo (PAT) to handoff project 2af16779 |
| Sat 05:05Z | Confirmed Continuity-track registration |
| Sat 05:12Z | Ruled that validators (agy) validate only and never build or edit other agents' work |
| Sat 05:35Z | Mined 0.0186 Sepolia ETH on the PoW faucet for the treasury |
| Sat 05:40Z | Approved XMBL_GATE=skip for the handoff.lol deploy of the platform fixes; standing instruction: don't hold up progress |
| Sat 07:00Z | Sent 20 Sepolia USDC to the SirKit treasury for bids, refills and payouts |
| Sat 07:15Z | Set the binding role map: agent-smith builds the agents and the castle service; mister-anderson does the contracts; agy validates and never builds; impecc does presentation and the miniapp; handoff-claude fixes the handoff.lol platform; korg researches; SirKit orchestrates |
| Sat 07:18Z | Sepolia ETH costs real money (0.03 ETH ≈ $80): no more ETH top-ups; run on current balances |
| Sat 07:30Z | Gas spend is unacceptable: cut every non-essential live tx |
| Sat 07:48Z | Approved ~0.011 ETH for a Castle v3 redeploy (zero idle liveness gas) once fork-tested |
| Sat 10:51Z | Retired the lease edition (tag lease-edition) and pivoted the entry to agy's architecture brief: one Aqua balance backing many quotes, ENS CCIP-Read quote discovery and v4 JIT fills. Kept the Castle Tapestry design and motif, cleared the other agents' memory, and asked for a new handoff project, feefifofum, with tasks oriented to the best agent for each |
| Sat 11:05Z | Removed handoff-advisor from the swarm |
| Sat 11:22Z | Asked for frequent commits and a well-organized repo: main carries only this product, and the lease edition lives at its tag |
| Sat 11:25Z | Approved a 0.02 ETH gas ceiling for the one live deploy and live run, and asked that the total budget be watched |
| Sat 11:32Z | agy is rate-limited until 12:15Z: asked for agy's current tasks to be redistributed |
| Sat 12:34Z | korg is out for the week (rate limits); asked for korg's tasks to be redistributed |
| Sat 13:20Z | Ruled that the main miniapp is the product's web3 interface (a user connects a wallet and trades with the castle as live Sepolia txs), since the demo must be live and prove the work on-chain; the storybook tale moves to a second miniapp |
| Sat 14:05Z | Filled in the ETHGlobal submission with SirKit (project details, images, tech stack, prizes: Continuity, Top 10 and partner prizes for ENS, Uniswap Foundation and 1inch, grants and incubator interest), rejected the first draft of the copy as AI-style prose and had it rewritten plainly |
| Sat 14:18Z | Asked for a 3–4 minute screencast of the dapp as the demo video, with a voiceover and captions the operator will redub from, re-recorded from scratch whenever an issue turns up |
| Sat 14:24Z | Ruled that no AI-slop prose ('broetry') may appear anywhere a person might read: the demo, the README, the docs, the apps and the deck |

## Log

| Time | Who | What |
|---|---|---|
| Sat 11:00Z | SirKit | New handoff project feefifofum de902056 (7 goals, 18 tasks), team team_da74ee43; assignments sent; agy's brief committed as docs/PIVOT.md (77d2b85); old main tagged lease-edition (a5fc4e7) |
| Sat 11:10Z | korg | Research gates measured on a fork: v4 Sepolia addresses by eth_getCode; 0x67Cc registers quote with a custom resolver in one call; UniversalResolverV2 surfaces OffchainLookup for text() when the resolver advertises IExtendedResolver; no UniswapX on Sepolia |
| Sat 11:12Z | SirKit | docs/SPEC.md locked (d2c5eac, 7c3a6fd): CastleVault with leverage caps, PriceExtruction, CastleJITHook, OffchainQuoteResolver; quote format; gateway; crew duties; demo; 0.02 ETH gas ceiling; cut lines |
| Sat 11:14Z | SirKit | Verified korg's research (re-ran contracts/probes/quote-register on a live Sepolia fork: 1 passed). Board: 16 of 18 tasks claimed. WORKLOG and AI_USAGE switched to this product; the lease edition's record stays at tag lease-edition. |
| Sat 11:18Z | agy | v-spec: a conditional FAIL on 7c3a6fd (four of its five items came from a stale working tree; one real fix: the resolver extraData is the callData), then PASS on d70dafa. SirKit re-ran test/CastleVault.t.sol: 19 passed. spec, v-spec and research are verified. |
| Sat 11:22Z | mister-anderson | c-vault fork-green: CastleVault and PriceExtruction (bf77b95), 19 unit tests; CastleVaultFork on live Sepolia Aqua and router (98b48b8), 3 of 3: 2x leverage, harp and hen each promising the whole hoard, greedy reverting OverAllocated, a fi-quoted harp fill, the same quote 31 s later reverting QuoteExpired, and a hen fill. OffchainQuoteResolver (804741e) and the JS signer (eb01aa5) are on main; v4-core added (5af11fd). |
| Sat 11:22Z | SirKit | Repo cleanup: the lease edition docs are retired from main (852b358; kept at tag lease-edition); NAMING.md rewritten; root .gitignore. The contract, agent and service cleanup is delegated to their owners. |
| Sat 11:24Z | mister-anderson | c-hook fork-green at c348dda, ahead of the 17:00Z cut line: CastleJITHook at a CREATE2-mined address (flags 0x888), a pool with no LP liquidity, a 1 USDC swap through PoolSwapTest filled from hen in one tx (v4 Swap, Aqua Pulled/Pushed, JitFill), both directions, and the guarded reverts. SirKit re-ran CastleJITHookFork: 6 passed. SPEC gas table updated from fork measurements, about 8.5M gas (54366ae). |
| Sat 11:24Z | korg | README Repository layout section; research.md points at the lease-edition tag (e95d402). |
| Sat 11:34Z | SirKit | v-e2e moved from agy to korg (pass 1); agy runs pass 2 on return and keeps v-live and the outside-solver role; korg's wallet is the backup solver. SPEC 09caa66: fum docks only when fills push committed past the leverage limit; the demo ships harp and hen at 80% each. |
| Sat 11:55Z | SirKit | Verified c-vault, c-hook and c-ccip after re-running everything: unit and invariant 46/46, fork 15/15 against live Sepolia, the JS signer 6/6, and the viem CCIP-Read quote-fork PASS on a private anvil fork. c-deploy moved ahead of v-e2e (SPEC 43e57ac), so the rehearsals hit the real addresses. The treasury funded the deployer with 0.008 ETH: [0x64d87869…](https://sepolia.etherscan.io/tx/0x64d878696bdcf9c53a15cb1762fef457e5d52a2acc2a183ee1d2eb57c3cc5e83). The hoard is resized to 5 USDC plus 5/mid WETH. |
| Sat 11:55Z | impecc | Deck (10 slides) as a private claude.ai artifact; PRODUCT.md and docs/video-script.md rewritten for this product (3adb718); miniapp mock 100/100 (58fd86f). |
| Sat 11:55Z | korg | v-e2e contract-level demo twice on forks with cheatcodes (dea47ea): 80% ships, greedy OverAllocated, quote registered, OffchainLookup, harp fill then QuoteExpired, v4 JIT swap, no dock. |
| Sat 12:02Z | mister-anderson | c-deploy LIVE on Sepolia (blocks 11786070 to 11786074): PriceExtruction, CastleVault, OffchainQuoteResolver, CastleJITHook (CREATE2), and the pool initialized. All 5 have status 1, cost 0.006927 ETH of the 0.012 share, and all 4 contracts are Sourcify exact_match. SirKit checked the receipts, the code, the owner, the resolver IExtendedResolver support, the hook flags 0x888, pool slot0 and Sourcify independently. deployments/sepolia.json is at 98428e7. register(quote) from 0x67Cc is pending. |
| Sat 12:07Z | agent-smith | quote.feefifofum.eth registered from 0x67Cc with the OffchainQuoteResolver (block 11786115, 0.000144 ETH). SirKit checked on live Sepolia: getResolver(quote) is 0x2D18…A76a, and UniversalResolverV2 reverts OffchainLookup (0x556f1830). With CCIP-Read on, it reaches the gateway, which answers 404 until agent-smith pushes it (ETA 12:30Z). |
| Sat 12:07Z | handoff-claude | fi's key is on helen at a 0600 path outside the checkout (it derives 0xB6eA…40b2), set through a systemd drop-in with CASTLE_FI_KEY_PATH. |
| Sat 12:07Z | SirKit | c-deploy verified on-chain. The total live spend so far is 0.006927 ETH (deploy) plus 0.000144 ETH (register), or 0.007071 ETH of the 0.02 ETH ceiling. |
| Sat 12:13Z | agent-smith | Gateway, stream v2 and MCP tools pushed (2d44311..bab6080) and live on helen through castle-sync; /health reports fiKeyLoaded true. SirKit resolved quote.feefifofum.eth text(castle) on live Sepolia through UniversalResolverV2 and CCIP-Read, and it returned 0x0fa4…7A98. |
| Sat 12:14Z | handoff-claude | h-platform verified: the gateway through the tunnel answers GET and POST with CORS, the preflight returns 204, the live resolver accepts the gateway answers, and the fi key is loaded on helen; no handoff repo change was needed. |
| Sat 12:16Z | SirKit | agy back from the rate limit and briefed: v-live groundwork now (a read-only check of the deployment against the chain), v-e2e pass 2 after korg's pass 1, the outside solver in a-live, and v-live at 22:30Z. |
| Sat 12:27Z | agy | An independent read-only check of the live deployment against sepolia.json (a394209) found zero discrepancies: code sizes, Sourcify exact_match on all 4 contracts, owners and roles, the resolver signers and URL, the hook wiring and flags, pool slot0, and quote.feefifofum.eth resolving through UniversalResolverV2. |
| Sat 12:27Z | impecc | The live miniapp reads the real castle from a clean browser (93e645e, 1ae8aca); the deploy tx is told as the castle being built; the publish waits for a-live. |
| Sat 12:29Z | agent-smith | a-crew and a-gateway verified by SirKit (agents 9/9, service 6/6, the fork-run record at agents/fork-run/11786199, and live gateway checks). The a-live plan is approved: phases A to F, about 1.77M gas (about 0.0021 ETH), gated on two v-e2e passes of crew-fork.sh, with one go per phase. |
| Sat 12:34Z | SirKit | korg's tasks were redistributed: v-e2e to agy (both passes, with crew-fork.sh and jack.mjs); s-writeups to mister-anderson, with impecc keeping the README voice. The backup solver is now SirKit's payer 0x6216…1D1C. |
| Sat 12:42Z | agy | v-e2e PASS, verified by SirKit: two passes of crew-fork.sh STRESS=0 on forks at 11786255 and 11786266 against the live contracts, through jack.mjs, the local gateway and the stream, with distinct tx hashes (docs/e2e/pass1, pass2 at dbb243d). a-live is unblocked. |
| Sat 12:44Z | SirKit | a-live phase A LIVE: the treasury funded the Castle with 5 USDC and 0.001858991757230548 WETH (wrap plus transfer) and topped agy up with 0.001 ETH; 4 txs, all status 1, 0.000182 ETH; the vault balances were read back. Phases B and C (fum, fi) have the go. |
| Sat 12:56Z | agent-smith | a-live phase B LIVE: fum setLeverage 2x on USDC and WETH and setCap on slots 0 to 2; 5 txs, all status 1, 0.000312 ETH. SirKit read back leverageOf = 20000 and the caps on-chain. fee, fo and fum are running live against the castle service; phase C (fi) is under way. |
| Sat 12:58Z | agent-smith | a-live phase C LIVE, which is BEAT 1: fi shipped harp and hen at 80% each from one balance, and greedy reverted OverAllocated. 0.000607 ETH. SirKit verified the receipts and replayed greedy at the block before to decode OverAllocated(WETH, 3903882690184150, 3717983514461096). Phases D and E (agy) have the go. |
| Sat 13:00Z | agy | a-live phases D and E LIVE, which are BEATS 2 and 3. D: CCIP-Read quote q-1790427574-6 through UniversalResolverV2 and the gateway, signed by fi, filled through router.swap (0x763d6de1). E: the v4 swap through PoolSwapTest, filled by CastleJITHook from hen in one tx (0x53f773de: Aqua Pulled and Pushed, JitFill, v4 Swap). 0.000631 ETH. Then F: fee re-centred hen (dock 0x32a20d16, ship 0x03dbf62b). SirKit verified every receipt and its events, and matched the stream quote.served to the fill. |
| Sat 13:04Z | agy | v-live PASS, verified by SirKit after one send-back (phase F added, the leverage labels corrected, greedy replayed to OverAllocated). Live spend in total: 0.0091 ETH of the 0.02 ETH ceiling (deploy 0.006927, register 0.000144, a-live 0.002033). |
| Sat 13:12Z | SirKit | Verified a-live (all 17 live txs match SirKit's own receipt and event checks; record at agents/live-run/11786346) and m-miniapp (published; a fresh Chrome profile shows LIVE FROM THE CASTLE and all three beats with 0 console errors, which is beat 4). Requested follow-ups: header name quote.feefifofum.eth, and two stale README lines. |
| Sat 13:14Z | SirKit | s-writeups verified (README and the sponsor docs read and grepped; the live tx links match the on-chain checks). Miniapp 1.1.1 republished with quote.feefifofum.eth in the header (checked in a fresh profile). The deck and video script were checked against the live run. |
| Sat 13:16Z | SirKit | m-deck verified (the deck's proof, miniapp and close slides and the video script were checked against the live run). The service's config.name is now quote.feefifofum.eth (e3b8852). AI_USAGE.md Files and Prompts sections rewritten from git blame for this product, with dbb243d disclosed as agy's. |
| Sat 13:17Z | SirKit | main tagged live-run (132f11b); handoff-claude pinned castle-sync on helen to the tag, so the gateway no longer follows main. 16 of 18 tasks are verified; left are s-ai (SirKit, final reconcile) and s-submit (the operator: share the deck, record the video, the ETHGlobal and Uniswap feedback forms). |
| Sat 13:23Z | SirKit | Operator ruling applied: SPEC fc85b67 adds 'The miniapps' (the dapp's panels and chain calls, and the tale as a second miniapp). New tasks: a-dapplib (agent-smith, browser module, 15:30Z), m-dapp (impecc, blocker, 18:00Z), m-tale (impecc, 16:30Z) and v-dapp (agy, live UI validation from a clean browser, 19:30Z). Goal budgets raised: miniapp 1.2 to 1.6, validation 1.1 to 1.3 USDC. |
| Sat 13:30Z | SirKit | m-tale verified: https://handoff.lol/app/impecc/fee-fi-fo-fum-tale is live from the castle stream in a fresh Chrome profile, with 0 console errors and a link to the dapp. |
| Sat 13:34Z | SirKit | Funded impecc's self-custodied Sepolia test wallet 0x23E5…FC32 for the dapp's live test: 0.0015 ETH (0x8a8458e1…b104) and 0.5 USDC (0x8863b8c7…cc15), 0.000091 ETH gas. Spend so far: 0.0092 ETH gas plus 0.0015 ETH to the test wallet, 0.0107 of the 0.02 ceiling. |
| Sat 13:54Z | SirKit | a-dapplib verified: agent-smith's dependency-free browser module (miniapp/lib/dapplib.js, 5c7a520) passes 16/16 when SirKit re-runs it: keccak and the ABI coder fuzzed against viem, a harp fill and a hen swap in both directions on a Sepolia fork, and live dry runs (fill ~198,913 gas, swap ~358,940). |
| Sat 14:21Z | SirKit | m-dapp verified: the published page is the dapp, and impecc's page-driven harp fill 0xb825bdd0…a59d and hen swap 0xf840c09a…466b check out on-chain. fi topped up with 0.003 ETH (0x3bc7799d…031e) so the hen's automatic re-centres keep working through judging; fee's drift threshold to 300 bps. Spend: 0.0137 of the 0.02 ETH ceiling. |
| Sat 14:27Z | SirKit | Plain-writing rule sent to the swarm and written into docs/NAMING.md: mister-anderson rewrites the README and the sponsor docs, impecc the dapp (2.0.2), the tale, the deck and PRODUCT/DESIGN, agent-smith the service and MCP text, and agy reviews every reader-facing file afterwards. SirKit records the demo video from the dapp once 2.0.2 is live. |
| Sat 14:30Z | SirKit | agent-smith's service text commit 4a5dbbc (the plain-prose MCP tool descriptions and messages, text only; 6 of 6 service tests pass) checked, and the live-run tag moved to it, so castle-sync redeploys the service. impecc's dapp 2.0.2 (plain copy, the hen-restock message) is live. A demo test wallet 0x9745…b5B1 was funded with 0.003 ETH (0x9420f347…97f9) for the screencast. Spend: 0.0167 of the 0.02 ETH ceiling. |
| Sat 16:41Z | SirKit | Demo video recorded from the published dapp with a scripted test wallet. Take 1 (wallet 0x9745…b5B1) stopped before the v4 swap because the recorder misread the hen card; its wrap 0x7254f918…71ea, approve 0x51895bf1…7355 and RFQ fill 0x4b229bf8…8152 are on-chain. That wallet's remaining 0.0024 ETH went to a new wallet 0xf807…3309 (0x175b0912…089c), so take 2 starts from a wallet that holds only ETH. Take 2 recorded every shot: wrap 0x63c720b6…bd0f, approve 0x0e16aa02…b778, RFQ fill 0x186b88a7…6f95 (170,876 gas), approve 0x8fb9c21d…fe15 and v4 swap 0x4749dfc2…d0ad (274,519 gas), after which fi re-centred the hen strategy within 30 s (0x0e66…7522, 0xf27b…4b78). Its re-centre shot later turned out to show the hen still docked, so the take was redone. Spend stays at 0.0167 of the 0.02 ETH ceiling, because the gas came from the demo wallet's 0.003 ETH and fi's re-centre from its 14:21Z top-up. |
| Sat 17:17Z | SirKit | The demo video is take 5. Takes 3 and 4 stopped on recorder errors after sending some transactions: take 3 (wallet 0x99eD…531c) did wrap 0x95f2aa54…dda2, approve 0xe0f76dbc…4472, RFQ fill 0xb542558c…a5f1, approve 0xdd83f656…39b2 and v4 swap 0x12fab69c…0a7f, and take 4 (wallet 0xF303…14F1) did wrap 0x8d4513e5…45e2, approve 0x62fa1c61…3f67 and RFQ fill 0x13dbadfa…ccf1. Each take started from a new wallet holding only Sepolia ETH, funded from the previous wallet (0x2bc7787d…9406, 0x190d6242…7e8e, 0xf62ec344…9f78) and from the treasury (0.0008 ETH in 0x50897042…9dad, 0.0006 ETH in 0x3d0ca795…e3c2). Take 5 (wallet 0x2cFf…a199) recorded every shot: wrap 0xa6ab764f…4e83, approve 0x5f3d3c03…81c8, RFQ fill 0xd563f576…8bd0, approve 0x6aef51b4…d1c6 and v4 swap 0x3489324e…9246, after which fi re-centred the hen at 17:03Z. Its re-centre shot was recorded again without transactions, because the first recording showed the hen quote from before the re-centre. The video runs 3:38 with a text-to-speech voiceover and captions, which the operator redubs. Spend: 0.0181 of the 0.02 ETH ceiling. |
