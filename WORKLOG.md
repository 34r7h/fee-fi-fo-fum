# WORKLOG

The running record of the feefifofum build: what was done, who did it, which commit, and where it lives on-chain. SirKit (orchestrator) regenerates it from the handoff board and the evidence agents submit. Agents do not edit it by hand.

- **Handoff project:** `de902056-080b-480f-a95e-dd821b678795` (feefifofum), team `team_da74ee43`, requester SirKit
- **Repo:** https://github.com/34r7h/fee-fi-fo-fum
- **Spec:** [docs/SPEC.md](docs/SPEC.md), from agy's brief [docs/PIVOT.md](docs/PIVOT.md) and korg's [docs/research.md](docs/research.md)
- **Deadline:** Sun 27 Sep 00:00 UTC
- **Pre-existing product:** handoff (private), baseline `079f8f0`
- **Earlier product:** the lease edition, retired at 10:51Z on Sat 26 Sep. Its code and full worklog are at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition).
- **Last regenerated:** Sat 12:44Z

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

### handoff.lol platform support

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| handoff.lol: CCIP-Read-ready castle tunnel <br>`h-platform` `dff91a5e` | handoff-claude | handoff-claude | Sat 15:00Z | done | no handoff repo change | CORS, fi key on helen, durable units, Sepolia payouts |

### Miniapp, deck and video

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| Miniapp: one hoard, every market <br>`m-miniapp` `0a8f80ab` | impecc | impecc | Sat 21:30Z | in_progress |  |  |
| Deck and video script <br>`m-deck` `04cf6e79` | impecc | impecc | Sat 23:00Z | in_progress |  |  |

### Validation and the one live run

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| The one live run on Sepolia <br>`a-live` `a92e968f` | agent-smith | agent-smith | Sat 22:00Z | in_progress |  |  |
| **BLOCKER** Fork end-to-end of the whole demo (two passes) <br>`v-e2e` `48b54583` | agy | agy | Sat 20:00Z | done | dbb243d | two post-deploy fork passes, distinct txs |
| Verify the live run on-chain <br>`v-live` `e113e331` | agy | agy | Sat 22:30Z | in_progress |  |  |

### Submission

| Task | Owner | Assignee | Due | Status | Commit | On-chain |
|---|---|---|---|---|---|---|
| README, sponsor write-ups and FEEDBACK <br>`s-writeups` `ae2058f7` | mister-anderson | mister-anderson | Sat 23:00Z | in_progress |  |  |
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

Live balances read at block 11786296.

| Wallet | handoff agent | Sepolia address | ENSv2 name | Funding txs | Live balance (ETH / USDC / WETH) |
|---|---|---|---|---|---|
| treasury (SirKit) | SirKit | [`0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2`](https://sepolia.etherscan.io/address/0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2) |  | 0.2131 ETH / 5.8 USDC left at 09:05Z, after the crew swept 0.0827 ETH back and 0.007 ETH funded the v3 deployer [0xce3ee83e…](https://sepolia.etherscan.io/tx/0xce3ee83e82134bde6a5199093f329ba60b11715e71a0a509e96172cbf3f340fd) (0.05 ETH in: [0x56611a5a…](https://sepolia.etherscan.io/tx/0x56611a5aa6825a47ca91c85081bb0cb59e743b7079adcab8381ed3924e75cdea)); +0.0186 ETH in: [0x5d37b019…](https://sepolia.etherscan.io/tx/0x5d37b01946d996dd8c456bc59ec0775f1378d21be5d65f7b9c1d9962b7494eac) (PoW faucet); 9 USDC → SirKit's handoff payer 0x6216…1D1C so payouts settle on ethereum-sepolia [0x49146985…](https://sepolia.etherscan.io/tx/0x4914698500bde6ebb629b747783984961e464a94fa1f15f1b2a7db0aad8aad93); 0.2 USDC → handoff-claude [0x5dd969c2…](https://sepolia.etherscan.io/tx/0x5dd969c2b2d5bb4a0a7ee98a571add1c7336dbffe4e72ba332824d2b00e5714c); 0.005 ETH → handoff's Sepolia relayer 0xE43a…5847 [0x0bddf9af…](https://sepolia.etherscan.io/tx/0x0bddf9afc437352c98d8084bb7a646c01c68d7a0dac9839a57302c50ef64ab89); 0.006 WETH refill → Castle after fi's claim [0x29a27da7…](https://sepolia.etherscan.io/tx/0x29a27da7f8a37aab96e92d49ad26ec507f35180405cf65f796c4c35177da18c0) | 0.20206 / 0.80 / 0.00000 |
| deployer (mister-anderson) | mister-anderson | [`0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73`](https://sepolia.etherscan.io/address/0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73) |  | 0.02 ETH [0x6d65d570…](https://sepolia.etherscan.io/tx/0x6d65d570d5f7eac8b00e741388c062d1f9e92ebb034b007563aa5facd94332cb) / 8 USDC [0x4422def9…](https://sepolia.etherscan.io/tx/0x4422def903a2962bfdec6af118c2244138772061deaaf91c7bff588cccc358db); +0.01 [0xdce622c4…](https://sepolia.etherscan.io/tx/0xdce622c4a601be72cd8ade8ac93b5be61bd2b0604eaefedccb236a582ce217cc); +0.04 ETH [0x02f63840…](https://sepolia.etherscan.io/tx/0x02f63840af945a471d17d0a90febd2416c96e00598ccc96da1a1e1cc07f264e4); +0.008 ETH for c-deploy [0x64d87869…](https://sepolia.etherscan.io/tx/0x64d878696bdcf9c53a15cb1762fef457e5d52a2acc2a183ee1d2eb57c3cc5e83) | 0.00407 / 0.33 / 0.00036 |
| korg | korg | [`0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E`](https://sepolia.etherscan.io/address/0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E) (self-custodied) |  | 0.008 ETH [0x13d35fd1…](https://sepolia.etherscan.io/tx/0x13d35fd1cbbfa60bd1ce50f9f0bf6737729124598529281366ad98df6d081881) | 0.00030 / 0.00 / 0.00000 |
| fee | fee | [`0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538`](https://sepolia.etherscan.io/address/0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538) | fee.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.005 ETH [0xb4a1bb3b…](https://sepolia.etherscan.io/tx/0xb4a1bb3b10ec04fc210e8f9ee4f3506571d30fde48f83daa771677bdf30b29e4) / 2 USDC [0x4a5bb82a…](https://sepolia.etherscan.io/tx/0x4a5bb82a1d606a90d154108a816bd73e02d86ba0ba1db1bffcf65f274843945e); +0.004 [0x8f71cc1f…](https://sepolia.etherscan.io/tx/0x8f71cc1f8d366688bfe900200c9009e125c61c951be579bedbd8ccf187dfa37c); +0.02 ETH [0x5e533b6e…](https://sepolia.etherscan.io/tx/0x5e533b6ebb8ecbbdf20c7be745536a26723dbc514d6fade8123e3a15b7103187) | 0.00300 / 2.10 / 0.00100 |
| fi | fi | [`0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2`](https://sepolia.etherscan.io/address/0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2) | fi.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.004 ETH [0x742d1ba8…](https://sepolia.etherscan.io/tx/0x742d1ba88af97c175cd2ee407a9e128876189576f4d4cacb3b3ba555b4daca1b) / 2 USDC [0xc5df2983…](https://sepolia.etherscan.io/tx/0xc5df298310764455ab7f7292214dac2df1bf04a922d9880aa359b3a48e1899bd); +0.004 [0x5e0c7655…](https://sepolia.etherscan.io/tx/0x5e0c7655b6ccb82a572dd9ca5978cdd1b11bec06e18a3e8c7b511c45d6ead3a9); +0.02 ETH [0xf7b1787b…](https://sepolia.etherscan.io/tx/0xf7b1787b0ef45ead0fb094fcf14888960e70e88ef66e0975433fb79aa0efbee6) | 0.00201 / 2.00 / 0.00100 |
| fo | fo | [`0x8689a407A2488A5b2f2De05d2C6978a798f93D56`](https://sepolia.etherscan.io/address/0x8689a407A2488A5b2f2De05d2C6978a798f93D56) | fo.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.001 ETH [0x0033036a…](https://sepolia.etherscan.io/tx/0x0033036adf3a82bc53bfb4e08c90592c30679981365985ccf242123fa883744b); +0.005 ETH [0xa4ade13b…](https://sepolia.etherscan.io/tx/0xa4ade13bad70596f7ab201a2b57d7d717f6554bd8da93a9a503ed88560b10fa2); 5 USDC [0x439268aa…](https://sepolia.etherscan.io/tx/0x439268aa2116dd0eab8768e7a5af7a6786d1cd484cfbfb8e7d9082761102f484) (backup auction bidder) | 0.00200 / 3.50 / 0.00088 |
| fum | fum | [`0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2`](https://sepolia.etherscan.io/address/0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2) | fum.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.003 ETH [0xd63f3304…](https://sepolia.etherscan.io/tx/0xd63f33041b7a3ac024ecaba8fb6c73eb0dd95e0b8c372c1ff8d2cc7582a709c6) / 2 USDC [0xad17fe88…](https://sepolia.etherscan.io/tx/0xad17fe88e2310c40cf758e8bd611e382a3226e48d414f5093713bda1a2578115); +0.002 [0xdc880c47…](https://sepolia.etherscan.io/tx/0xdc880c4714ce6eb5881934e72cd8063e47a981391fce53b7191bcc8835e3ef62); +0.02 ETH [0x16bab3ec…](https://sepolia.etherscan.io/tx/0x16bab3ec1fc09314d8cbc6b6726924b1f8e80352599065537ebc6d20c7ca8564) | 0.00101 / 2.00 / 0.00100 |
| castle (service) | castle (agent-smith; the castle EOA is the ENSv2 registry admin) | [`0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99`](https://sepolia.etherscan.io/address/0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99) |  | 0.005 ETH [0xaeba391d…](https://sepolia.etherscan.io/tx/0xaeba391d38c81761afbf1dd52db8365162e66e05d28f63d07a58811181746ceb) + [0x76c425e7…](https://sepolia.etherscan.io/tx/0x76c425e74d6123e6115529e22daea9c88d3ecd79af59b6104f2d112acd03c20d); +0.005 ETH [0x49d1e57c…](https://sepolia.etherscan.io/tx/0x49d1e57cdfd784a32d1ec6fb9b5cca7892ffd4afbc333ab8bef282688a678968) | 0.00023 / 0.00 / 0.00000 |
| agy | agy (validator; handoff wallet = this EOA via proof of possession, 105f1dd) | [`0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c`](https://sepolia.etherscan.io/address/0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c) | agy.feefifofum.eth (live; handoff ens_name set with ens_proof) | +0.01 ETH [0xd2636171…](https://sepolia.etherscan.io/tx/0xd263617119221dd770d137dc419ecc7c75c3092b950c390a9c2d78a427370566); 6 USDC [0x38ac01d8…](https://sepolia.etherscan.io/tx/0x38ac01d8f9aadc8009e48bf348ef7cf7a44e6f1315ed0077e759c5368a693a5f) (to bid as an outside Jack); +5 USDC [0x7383f639…](https://sepolia.etherscan.io/tx/0x7383f639e32cde9075d8433e94fb5929e96a22a755c87f0bf91de3bde217d3a1) for the shift-change bid; +0.001 ETH for a-live [0xa0d70610…](https://sepolia.etherscan.io/tx/0xa0d706104cb42c621b80bf2ac63fd62b0ea0e40635e54ad5bd3fd62a692cdc10) | 0.00207 / 15.40 / 0.00000 |

## Service and miniapp

| Item | Value |
|---|---|
| Castle service | https://handoff.lol/t/castle/ (health: fiKeyLoaded true, stream v2) |
| Gateway (ERC-3668) | https://handoff.lol/t/castle/ccip/{sender}/{data}.json: live; getEnsText(quote.feefifofum.eth, castle) through UniversalResolverV2 returns the vault (checked by SirKit) |
| Miniapp | --live build reads sepolia.json (e7da5ea); publish after a-live |

## Documentation

| Doc | Owner | Status |
|---|---|---|
| docs/SPEC.md (locked build scope) | SirKit | locked d70dafa, agy PASS |
| docs/PIVOT.md (architecture brief) | agy | 77d2b85 |
| docs/research.md (gates) | korg | verified d6d21a1 (SirKit re-ran the fork probe) |
| miniapp/STREAM.md (stream v2) | impecc | 08ba999 |
| docs/NAMING.md (voice and identifier map) | SirKit | rewritten 852b358 |

## Demo evidence

| Beat | Tx / link | Verified by |
|---|---|---|
| A. Treasury funds the hoard: 5 USDC plus 5/mid WETH (0.001859 WETH at 2689.63) | [0x7e0b4a9f…](https://sepolia.etherscan.io/tx/0x7e0b4a9f0fa7b8920b2f5188de6cfcebbed61c5dfdbf80110da4c1604cb5e8a6), [0xd125c491…](https://sepolia.etherscan.io/tx/0xd125c4919b722aeebda218b7ae2f794e5956afa6e325784829ea215b26d8f543), [0x34840128…](https://sepolia.etherscan.io/tx/0x3484012803e8bc9a1b687326cfc27a727755d03d3c4ec80fd9a52b68d1a3eb3b) | SirKit (balances read back) |
| 1. One balance backs harp and hen; greedy reverts OverAllocated |  |  |
| 2. Solver resolves quote.feefifofum.eth via CCIP-Read and fills |  |  |
| 3. v4 swap filled JIT from the Castle |  |  |
| 4. Miniapp shows all three from a clean browser |  |  |

## Operator-owned contributions

ETHGlobal may exclude entries that rely entirely on AI. The operator's own decisions and work are listed here and mirrored in AI_USAGE.md.

| Time | Contribution |
|---|---|
| Sat 04:25Z | Ruled that nothing for the entry goes in the handoff repo; all work lives in feefifofum |
| Sat 04:40Z | Renamed the entry fee-fi-fo-fum, with Jack the Giant Killer overtones for forward-facing copy |
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
| Sat 11:34Z | SirKit | v-e2e moved from agy to korg (pass 1); agy runs pass 2 on return and keeps v-live and the outside-Jack role; korg's wallet is the backup Jack. SPEC 09caa66: fum docks only when fills push committed past the leverage limit; the demo ships harp and hen at 80% each. |
| Sat 11:55Z | SirKit | Verified c-vault, c-hook and c-ccip after re-running everything: unit and invariant 46/46, fork 15/15 against live Sepolia, the JS signer 6/6, and the viem CCIP-Read quote-fork PASS on a private anvil fork. c-deploy moved ahead of v-e2e (SPEC 43e57ac), so the rehearsals hit the real addresses. The treasury funded the deployer with 0.008 ETH: [0x64d87869…](https://sepolia.etherscan.io/tx/0x64d878696bdcf9c53a15cb1762fef457e5d52a2acc2a183ee1d2eb57c3cc5e83). The hoard is resized to 5 USDC plus 5/mid WETH. |
| Sat 11:55Z | impecc | Deck (10 slides) as a private claude.ai artifact; PRODUCT.md and docs/video-script.md rewritten for this product (3adb718); miniapp mock 100/100 (58fd86f). |
| Sat 11:55Z | korg | v-e2e contract-level demo twice on forks with cheatcodes (dea47ea): 80% ships, greedy OverAllocated, quote registered, OffchainLookup, harp fill then QuoteExpired, v4 JIT swap, no dock. |
| Sat 12:02Z | mister-anderson | c-deploy LIVE on Sepolia (blocks 11786070 to 11786074): PriceExtruction, CastleVault, OffchainQuoteResolver, CastleJITHook (CREATE2), and the pool initialized. All 5 have status 1, cost 0.006927 ETH of the 0.012 share, and all 4 contracts are Sourcify exact_match. SirKit checked the receipts, the code, the owner, the resolver IExtendedResolver support, the hook flags 0x888, pool slot0 and Sourcify independently. deployments/sepolia.json is at 98428e7. register(quote) from 0x67Cc is pending. |
| Sat 12:07Z | agent-smith | quote.feefifofum.eth registered from 0x67Cc with the OffchainQuoteResolver (block 11786115, 0.000144 ETH). SirKit checked on live Sepolia: getResolver(quote) is 0x2D18…A76a, and UniversalResolverV2 reverts OffchainLookup (0x556f1830). With CCIP-Read on, it reaches the gateway, which answers 404 until agent-smith pushes it (ETA 12:30Z). |
| Sat 12:07Z | handoff-claude | fi's key is on helen at a 0600 path outside the checkout (it derives 0xB6eA…40b2), set through a systemd drop-in with CASTLE_FI_KEY_PATH. |
| Sat 12:07Z | SirKit | c-deploy verified on-chain. The total live spend so far is 0.006927 ETH (deploy) plus 0.000144 ETH (register), or 0.007071 ETH of the 0.02 ETH ceiling. |
| Sat 12:13Z | agent-smith | Gateway, stream v2 and MCP tools pushed (2d44311..bab6080) and live on helen through castle-sync; /health reports fiKeyLoaded true. SirKit resolved quote.feefifofum.eth text(castle) on live Sepolia through UniversalResolverV2 and CCIP-Read, and it returned 0x0fa4…7A98. |
| Sat 12:14Z | handoff-claude | h-platform verified: the gateway through the tunnel answers GET and POST with CORS, the preflight returns 204, the live resolver accepts the gateway answers, and the fi key is loaded on helen; no handoff repo change was needed. |
| Sat 12:16Z | SirKit | agy back from the rate limit and briefed: v-live groundwork now (a read-only check of the deployment against the chain), v-e2e pass 2 after korg's pass 1, the outside Jack in a-live, and v-live at 22:30Z. |
| Sat 12:27Z | agy | An independent read-only check of the live deployment against sepolia.json (a394209) found zero discrepancies: code sizes, Sourcify exact_match on all 4 contracts, owners and roles, the resolver signers and URL, the hook wiring and flags, pool slot0, and quote.feefifofum.eth resolving through UniversalResolverV2. |
| Sat 12:27Z | impecc | The live miniapp reads the real castle from a clean browser (93e645e, 1ae8aca); the deploy tx is told as the castle being built; the publish waits for a-live. |
| Sat 12:29Z | agent-smith | a-crew and a-gateway verified by SirKit (agents 9/9, service 6/6, the fork-run record at agents/fork-run/11786199, and live gateway checks). The a-live plan is approved: phases A to F, about 1.77M gas (about 0.0021 ETH), gated on two v-e2e passes of crew-fork.sh, with one go per phase. |
| Sat 12:34Z | SirKit | korg's tasks were redistributed: v-e2e to agy (both passes, with crew-fork.sh and jack.mjs); s-writeups to mister-anderson, with impecc keeping the README voice. The backup Jack is now SirKit's payer 0x6216…1D1C. |
| Sat 12:42Z | agy | v-e2e PASS, verified by SirKit: two passes of crew-fork.sh STRESS=0 on forks at 11786255 and 11786266 against the live contracts, through jack.mjs, the local gateway and the stream, with distinct tx hashes (docs/e2e/pass1, pass2 at dbb243d). a-live is unblocked. |
| Sat 12:44Z | SirKit | a-live phase A LIVE: the treasury funded the Castle with 5 USDC and 0.001858991757230548 WETH (wrap plus transfer) and topped agy up with 0.001 ETH; 4 txs, all status 1, 0.000182 ETH; the vault balances were read back. Phases B and C (fum, fi) have the go. |
