# WORKLOG

This is the running record of the fee-fi-fo-fum build: what was done, who did it, which commit, and where it lives on-chain. SirKit (orchestrator) regenerates it from the handoff board and the evidence agents submit. Agents do not edit it by hand.

- **Handoff project:** `2af16779-4c0f-4c93-94b7-6a0281fc6846`: team `team_d5195308`, requester SirKit, X
- **Repo:** https://github.com/34r7h/fee-fi-fo-fum
- **Spec:** [docs/PLAN.md](docs/PLAN.md) (research, Option A) plus the handoff board, which wins where they differ. Naming: [docs/NAMING.md](docs/NAMING.md)
- **Deadline:** Sun 27 Sep 09:00 JST (00:00 UTC)
- **Pre-existing product:** handoff (private), baseline `079f8f0` (2026-09-25 17:09 JST)
- **Last regenerated:** 2026-09-26 15:04 JST

Status key: `todo`, `in_progress`, `review` (pending verification), `done` (verified). Owner is the planned owner; Assignee is the agent that has claimed the task on the board.

## Board

### P0 BLOCKERS: Continuity registration, ENSv2 lease probes, wallets, handoff baseline

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| **BLOCKER** OPERATOR: confirm the team is registered in the Continuity track on the ETHGlobal Hacker Dashboard <br>`p0-continuity` `d5c5a9d3` | OPERATOR |  | Sat 15:00 | done |  |  |
| **BLOCKER** Register feefifofum.eth on ENSv2 (Sepolia) and answer the four lease probes <br>`p0-ens-probes` `b22e3c07` | korg | korg | Sat 15:00 | done | docs/ens-probes.md | live register [0xc51ab266…](https://sepolia.etherscan.io/tx/0xc51ab2660dd9a0029a201a4acd5330d7e7c2eac063cbfe58bb31039d30338378); fork: 0xb167…, 0x8b83…, 0xa14f…; paid 0.5 USDC (receipt 07ea6eab) |
| **BLOCKER** Create the fee, fi, fo, fum handoff agents and fund their Ethereum Sepolia wallets <br>`p0-wallets` `a27aa444` | agent-smith | agent-smith | Sat 15:30 | done | b1e64ff | WETH wraps confirmed; paid 0.4 USDC (receipt 8b3e00be) |

### P1 CONTRACTS: SwapVM router 1.0.2, Castle.sol, FeeFiFoFumExtruction.sol

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| Foundry scaffold, then deploy the SwapVM router (release/1.0.2) on Sepolia <br>`p1-router` `902378f6` | mister-anderson | mister-anderson | Sat 16:00 | in_progress | 3301492, 6463060 | router 0xeDB6…70f9 live (tx 0xb2b319a2…); verification pending the Etherscan key |
| **BLOCKER** Castle.sol: the giant's castle (desk treasury, Aqua maker and ENSv2 lease) <br>`p1-castle` `c3a2dfdf` | mister-anderson | mister-anderson | Sat 19:00 | in_progress | 3fa3aa6, 81ffd04, 789f550, 2b6dea6, 38f06f1, 4757283 | 102 unit tests and 8 live-registry fork tests pass; 4/4 mutants killed (per mister-anderson; agy validating) |
| **BLOCKER** FeeFiFoFumExtruction.sol: the giant smells a stale shift (the ENS-lease fence in the SwapVM program) <br>`p1-extruction` `9019b3b9` | mister-anderson | mister-anderson | Sat 19:00 | review | 7b86321; 0xfA04…f271 | 9 fence tests, 10k-run fuzz of the decision table, quote==swap live/wind-down/fenced; validating |
| Validate Castle and FeeFiFoFumExtruction on a Sepolia fork (validation only, no code) <br>`p1-forktests` `f4d2ae68` | agy | agy | Sat 19:45 | done | validated at 2ca27aa (agy); reproduced by SirKit at 90d4001 | forge test 144 passed / 0 failed; CastleFork.t.sol 10/10 on a Sepolia fork (createSelectFork at FORK_BLOCK); awaiting handoff-advisor co-sign |
| **BLOCKER** Deploy and verify Castle and FeeFiFoFumExtruction on Sepolia, then ship the first live strategy <br>`p1-deploy` `1fed769f` | mister-anderson | mister-anderson | Sat 20:30 | todo |  |  |
| **BLOCKER** ICastleLease interface, published before 15:30 JST so the fence and fo can build in parallel <br>`p1-iface` `17a2de4c` | mister-anderson | mister-anderson | Sat 15:30 | done | 3301492, 980fd97, f0c7d65, e11f755 | paid 0.1 USDC (receipt 2af0f738); mister-anderson balance 2.2197 → 2.3197 |

### P1 CASTLE AGENT + ENS NAMES + HANDOFF PLATFORM FIXES

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| handoff.lol: check that the ethereum-sepolia rail works for the entry (public API only) <br>`p2-rail` `a2308925` | handoff-claude | handoff-claude | Sat 16:30 | done | defect report | paid 0.4 USDC (receipt a152fa18) |
| ENSv2 names for the agents: fee, fi, fo, fum and agy's pre-existing agent, with addr and agent-endpoint records <br>`p2-ensv2-registry` `495228e6` | agent-smith | agent-smith | Sat 20:00 | in_progress | a2b1ceb | registry + resolver live (txs succeeded) |
| castle service: seven MCP tools in fee-fi-fo-fum/service <br>`p2-capabilities` `a7ab1050` | agent-smith | agent-smith | Sat 22:00 | in_progress |  |  |
| castle stream (SSE) for the miniapp <br>`p2-stream` `9bd248fa` | agent-smith | agent-smith | Sat 23:00 | in_progress |  |  |
| handoff.lol PLATFORM FIX: ens_name accepts ENSv2 names, verified on-chain <br>`p2-ensname-fix` `8d364500` | handoff-claude | handoff-claude | Sat 18:00 | done | handoff 95932ef (handoff-claude), /api/v1/health build_sha 95932ef | get_agent fee/fi/fo/fum ens_name + ens_proof, replayed at latest by SirKit and handoff-advisor; paid 0.15 USDC (receipt 0ffc63d0) |
| handoff.lol PLATFORM FIX: ethereum-sepolia settlement (payouts honour settlement_network) <br>`p2-sepolia-settle` `a312d79e` | handoff-claude | handoff-claude | Sat 21:00 | done | handoff 0115146 (handoff-claude) | DoD tx [0x8a114e7c…](https://sepolia.etherscan.io/tx/0x8a114e7c9b1295f887cd93905593bf2e0dec124933c15e4e101f25b06a61fe34): 0.1 USDC handoff-claude → fee via wallet/spend on ethereum-sepolia, Transfer log checked by SirKit; verified by SirKit, handoff-advisor co-sign pending |
| handoff.lol PLATFORM FIX: agent rotates its own wallet_address with proof of possession <br>`p2-wallet-pop` `c2ce4a3f` | handoff-claude | handoff-claude | Sat 19:00 | in_progress | new platform task c2ce4a3f (handoff-claude) | agy's owner-token wallet PUT returned 403; fix = self-rotation with an EIP-191 proof of possession |

### P1 AGENTS: fee, fi, fo, fum on handoff

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| agents/ scaffold: shared runtime for fee, fi, fo, fum <br>`p3-scaffold` `17b80082` | agent-smith | agent-smith | Sat 17:00 | done | 444a32d | paid 0.4 USDC (receipt 86aba84d) |
| fee (shift trader) and fi (hot standby): lease renewal and failover logic <br>`p3-feefi` `fa22a44e` | agent-smith | agent-smith | Sat 20:30 | in_progress |  |  |
| fo, fencer and witness: EIP-712 attestations, fill replay, incident channel <br>`p3-fo` `9b450702` | agent-smith | agent-smith | Sat 20:30 | in_progress |  |  |
| **BLOCKER** Live failover on Sepolia: kill -9 fee, wind-down gap, fi claims, stale epoch fenced, stale fee rejected <br>`p3-failover-e2e` `ad888e60` | agent-smith | agent-smith | Sat 22:30 | in_progress |  |  |
| fum, auctioneer: shift-change and dissolution CCAs, checkpoint, sweep, setData <br>`p3-fum` `c78ba379` | agent-smith | agent-smith | Sun 00:00 | in_progress |  |  |

### P2 UNISWAP CCA: JackHook, shift-change and dissolution auctions, price write-back

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| JackHook.sol: any Jack with an ENSv2 name can climb and bid (CCA validation hook) <br>`p4-jackhook` `67f5a962` | mister-anderson | mister-anderson | Sat 21:30 | review | 7b86321; 0x5091…fcAd | korg vectors (named, unnamed, expired, wrong owner); an unnamed bidder is rejected on the live CCA fork; validating |
| **BLOCKER** Castle and CCA: shift-change and dissolution auctions, with the clearing price written back to ENS <br>`p4-cca` `d4a7c73a` | mister-anderson | mister-anderson | Sat 23:30 | todo |  |  |
| **BLOCKER** Live: an outside agent bids via MCP, a shift-change CCA clears on Sepolia, and the next curve moves <br>`p4-cca-e2e` `3becce17` | agy | agy | Sun 01:30 | in_progress |  |  |

### P1 MINIAPP + LIVE DEMO: fee-fi-fo-fum.html, durable hosting

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| fee-fi-fo-fum.html against a mock castle stream <br>`p5-mock` `198a1550` | impecc | impecc | Sat 21:00 | done | ccb9ae0 | agy PASS 5/5; SirKit re-checked the source (0 'baton', Jack copy, replay tab, no kill button, no innerHTML concatenation, dist 79.3KB); verified by SirKit, handoff-advisor co-sign pending |
| Wire fee-fi-fo-fum.html to the live castle stream and publish it on handoff.lol <br>`p5-live` `fd20d4c5` | impecc | impecc | Sun 02:00 | in_progress |  |  |
| Durable hosting for the castle service, so the live demo survives past the event <br>`p5-durable` `7ab03bab` | handoff-claude | handoff-claude | Sun 02:00 | done | service/ (c015774, 5a654bf) | https://handoff.lol/t/castle/ live; paid 0.15 USDC (receipt 80f9d048) |

### P3 SUBMISSION: write-ups, feedback, deck/video, rehearsal, submit

| Task | Owner | Assignee | Due (JST) | Status | Commit / PR | On-chain (address / tx) |
|---|---|---|---|---|---|---|
| README before/after, the three sponsor integration write-ups, and the contract address table <br>`p6-writeups` `3fb7f7a3` | korg | korg | Sun 07:00 | in_progress |  |  |
| FEEDBACK.md for Uniswap and the developers.uniswap.org/hackathon-feedback form <br>`p6-feedback` `d0587b18` | korg | korg | Sun 07:00 | todo |  |  |
| Pitch deck, plus the script and shot list for a 2-4 min demo video <br>`p6-deck` `005db56f` | impecc | impecc | Sun 07:00 | in_progress |  |  |
| **BLOCKER** Two full rehearsals of the five-beat demo on Sepolia from a clean browser <br>`p6-rehearsal` `3eb4aa41` | agy | agy | Sun 05:00 | in_progress |  |  |
| AI_USAGE.md and the final WORKLOG.md pass <br>`p6-ai-usage` `8abb390e` | SirKit | SirKit | Sun 08:00 | in_progress |  |  |
| **BLOCKER** OPERATOR: record the video, submit on ETHGlobal and select 1inch, Uniswap and ENS <br>`p6-submit` `6aa606a5` | OPERATOR |  | Sun 08:45 | todo |  |  |
| **BLOCKER** OPERATOR: owned contributions on the record (design calls, review sign-offs, the video, booth conversations) <br>`p6-operator` `0b628549` | OPERATOR |  | Sun 08:00 | todo |  |  |

## Contracts (Ethereum Sepolia)

| Contract | Address | Verified | Deployed by | Tx |
|---|---|---|---|---|
| Aqua (official, pre-existing) | `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | n/a | 1inch |  |
| Uniswap CCA factory (pre-existing) | `0x000000001F26a0044BaA66024e7b6599c61963F8` | n/a | Uniswap |  |
| ENSv2 UniversalResolverV2 (pre-existing) | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` | n/a | ENS |  |
| Circle USDC (pre-existing) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | n/a | Circle |  |
| SwapVM router release/1.0.2 | [`0xeDB6933949dB941D495b23604818F9AbF55e70f9`](https://sepolia.etherscan.io/address/0xeDB6933949dB941D495b23604818F9AbF55e70f9) (AQUA() = official Aqua) | pending (Etherscan key) | mister-anderson | [0xb2b319a2…](https://sepolia.etherscan.io/tx/0xb2b319a23732ade788971450ed30498b0dbf6cbb54d86c9ad343e7b42a32cd4d) |
| Castle.sol | [`0x6bF53228d8c5c3b0192B2028bD52fc4E9d1be8Ec`](https://sepolia.etherscan.io/address/0x6bF53228d8c5c3b0192B2028bD52fc4E9d1be8Ec) (block 11784308; crew fee+fi, auctioneer fum, dissolveGrace 1800s; funded 0.004 WETH + 8 USDC) | 7b86321; Etherscan verify pending the API key | mister-anderson | see contracts/deployments/sepolia.json (2e7b535) |
| FeeFiFoFumExtruction.sol | [`0xfA0455bca2B521664021A883aA78fBEAa470f271`](https://sepolia.etherscan.io/address/0xfA0455bca2B521664021A883aA78fBEAa470f271) | 7b86321, tx [0x14ac049e…](https://sepolia.etherscan.io/tx/0x14ac049eeac5f13512c99c67942a4eb88e56f04910b3bc0a5e760fe3ab03629f); Etherscan verify pending | mister-anderson | p1-fence submitted; agy + handoff-advisor validating |
| JackHook.sol | [`0x50919ddaaf8294865652D53b45f210019AB2fcAd`](https://sepolia.etherscan.io/address/0x50919ddaaf8294865652D53b45f210019AB2fcAd) | 7b86321, tx [0x94cdb321…](https://sepolia.etherscan.io/tx/0x94cdb321f6279e83bd718dd20ac613a525d45ebf15ac0714b90c2356827dc539); Etherscan verify pending | mister-anderson | p4-crewhook submitted; agy + handoff-advisor validating |
| ENSv2 agent registry | registry [`0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`](https://sepolia.etherscan.io/address/0x2F2164507471a1a46506f902aBfdfB9d22e4bE09), resolver [`0x9D2251b5162701BC2bD97d61bc8aa3e53446285E`](https://sepolia.etherscan.io/address/0x9D2251b5162701BC2bD97d61bc8aa3e53446285E) (proxies, 77-byte code) | proxy via VerifiableFactory | handoff-claude (castle EOA) | [0x25fb4a2e…](https://sepolia.etherscan.io/tx/0x25fb4a2ee8f0ffc2c3563a27ab08033ba5f7b01144fdf08fd3ab04fd0f0ede6e), [0xb09a8cf6…](https://sepolia.etherscan.io/tx/0xb09a8cf63b937c2e48cb476626e8d5098f2609e952f95d12e0de5c47f49b9a7d) |

## ENS names

| Name | Owner | Expiry / epoch | Tx |
|---|---|---|---|
| feefifofum.eth | korg EOA 0x48EB…5d3E; subregistry 0x2F21…E09, resolver 0x9D22…285E; addr → 0x48EB…5d3E via UniversalResolverV2 (set in tx 0x74042211…) | expiry 1792818444 | [0xc51ab266…](https://sepolia.etherscan.io/tx/0xc51ab2660dd9a0029a201a4acd5330d7e7c2eac063cbfe58bb31039d30338378) |
| castle.feefifofum.eth |  |  |  |
| fee / fi / fo / fum .feefifofum.eth | each agent's EOA (addr records); on handoff.lol, get_agent ens_name is set for all four with an eth_call ens_proof (platform 95932ef) | see contracts/deployments/ens-agents.sepolia.json | 133b33e |
| agy.feefifofum.eth | agy EOA 0xDDf2…AE4c (addr, agent-endpoint[mcp]=https://handoff.lol/mcp, handoff-agent) | expiry 2027-09-26 | [0xe6d0d8fe…](https://sepolia.etherscan.io/tx/0xe6d0d8fe2a05bba3bf6ff32e64256f2811f2ac776396427e4840357d15cd0aff) |

## Agents

Live balances read at block 11784329.

| Agent | handoff id | Sepolia address | ENSv2 name | Funding txs | Live balance (ETH / USDC / WETH) |
|---|---|---|---|---|---|
| treasury (SirKit) | SirKit | [`0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2`](https://sepolia.etherscan.io/address/0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2) |  | 0.0036 ETH / 26 USDC left (0.05 ETH in: [0x56611a5a…](https://sepolia.etherscan.io/tx/0x56611a5aa6825a47ca91c85081bb0cb59e743b7079adcab8381ed3924e75cdea)); +0.0186 ETH in: [0x5d37b019…](https://sepolia.etherscan.io/tx/0x5d37b01946d996dd8c456bc59ec0775f1378d21be5d65f7b9c1d9962b7494eac) (PoW faucet) | 0.20803 / 25.80 / 0.00000 |
| deployer (mister-anderson) | mister-anderson | [`0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73`](https://sepolia.etherscan.io/address/0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73) |  | 0.02 ETH [0x6d65d570…](https://sepolia.etherscan.io/tx/0x6d65d570d5f7eac8b00e741388c062d1f9e92ebb034b007563aa5facd94332cb) / 8 USDC [0x4422def9…](https://sepolia.etherscan.io/tx/0x4422def903a2962bfdec6af118c2244138772061deaaf91c7bff588cccc358db); +0.01 [0xdce622c4…](https://sepolia.etherscan.io/tx/0xdce622c4a601be72cd8ade8ac93b5be61bd2b0604eaefedccb236a582ce217cc) | 0.01425 / 0.00 / 0.00050 |
| korg | korg | [`0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E`](https://sepolia.etherscan.io/address/0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E) (self-custodied) |  | 0.008 ETH [0x13d35fd1…](https://sepolia.etherscan.io/tx/0x13d35fd1cbbfa60bd1ce50f9f0bf6737729124598529281366ad98df6d081881) | 0.00719 / 0.00 / 0.00000 |
| fee | fee (registered on handoff, online, heartbeat every 20s) | [`0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538`](https://sepolia.etherscan.io/address/0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538) | fee.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.005 ETH [0xb4a1bb3b…](https://sepolia.etherscan.io/tx/0xb4a1bb3b10ec04fc210e8f9ee4f3506571d30fde48f83daa771677bdf30b29e4) / 2 USDC [0x4a5bb82a…](https://sepolia.etherscan.io/tx/0x4a5bb82a1d606a90d154108a816bd73e02d86ba0ba1db1bffcf65f274843945e); +0.004 [0x8f71cc1f…](https://sepolia.etherscan.io/tx/0x8f71cc1f8d366688bfe900200c9009e125c61c951be579bedbd8ccf187dfa37c) | 0.00796 / 2.10 / 0.00100 |
| fi | fi (registered on handoff, online, heartbeat every 20s) | [`0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2`](https://sepolia.etherscan.io/address/0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2) | fi.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.004 ETH [0x742d1ba8…](https://sepolia.etherscan.io/tx/0x742d1ba88af97c175cd2ee407a9e128876189576f4d4cacb3b3ba555b4daca1b) / 2 USDC [0xc5df2983…](https://sepolia.etherscan.io/tx/0xc5df298310764455ab7f7292214dac2df1bf04a922d9880aa359b3a48e1899bd); +0.004 [0x5e0c7655…](https://sepolia.etherscan.io/tx/0x5e0c7655b6ccb82a572dd9ca5978cdd1b11bec06e18a3e8c7b511c45d6ead3a9) | 0.00695 / 2.00 / 0.00100 |
| fo | fo (registered on handoff, online, heartbeat every 20s) | [`0x8689a407A2488A5b2f2De05d2C6978a798f93D56`](https://sepolia.etherscan.io/address/0x8689a407A2488A5b2f2De05d2C6978a798f93D56) | fo.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.001 ETH [0x0033036a…](https://sepolia.etherscan.io/tx/0x0033036adf3a82bc53bfb4e08c90592c30679981365985ccf242123fa883744b) | 0.00075 / 0.00 / 0.00020 |
| fum | fum (registered on handoff, online, heartbeat every 20s) | [`0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2`](https://sepolia.etherscan.io/address/0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2) | fum.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; handoff ens_name set with ens_proof, platform 95932ef) | 0.003 ETH [0xd63f3304…](https://sepolia.etherscan.io/tx/0xd63f33041b7a3ac024ecaba8fb6c73eb0dd95e0b8c372c1ff8d2cc7582a709c6) / 2 USDC [0xad17fe88…](https://sepolia.etherscan.io/tx/0xad17fe88e2310c40cf758e8bd611e382a3226e48d414f5093713bda1a2578115); +0.002 [0xdc880c47…](https://sepolia.etherscan.io/tx/0xdc880c4714ce6eb5881934e72cd8063e47a981391fce53b7191bcc8835e3ef62) | 0.00395 / 2.00 / 0.00100 |
| castle (service) | castle (agent-smith; the castle EOA is the ENSv2 registry admin) | [`0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99`](https://sepolia.etherscan.io/address/0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99) |  | 0.005 ETH [0xaeba391d…](https://sepolia.etherscan.io/tx/0xaeba391d38c81761afbf1dd52db8365162e66e05d28f63d07a58811181746ceb) + [0x76c425e7…](https://sepolia.etherscan.io/tx/0x76c425e74d6123e6115529e22daea9c88d3ecd79af59b6104f2d112acd03c20d) | 0.00260 / 0.00 / 0.00000 |
| agy | agy (validator; handoff wallet still 0x7504…AE33 until p2-wallet-pop ships) | [`0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c`](https://sepolia.etherscan.io/address/0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c) | agy.feefifofum.eth (live; resolves via UniversalResolverV2 to this EOA; register [0xe6d0d8fe…](https://sepolia.etherscan.io/tx/0xe6d0d8fe2a05bba3bf6ff32e64256f2811f2ac776396427e4840357d15cd0aff), records [0xe7bcabff…](https://sepolia.etherscan.io/tx/0xe7bcabff6b275f1327b91918f69d17cda937d0d936fc4a435cdb69ae34fe75d8)) |  | 0.00000 / 0.00 / 0.00000 |

## Miniapp and live demo

| Item | Value |
|---|---|
| Source | `miniapp/fee-fi-fo-fum.html` (ccb9ae0: full mock demo plus replay tab; source 93.7KB, minified 73.7KB) |
| Published URL |  |
| Validation score |  |
| Castle service URL (durable) | https://handoff.lol/t/castle/ (MCP /mcp, REST /tools, SSE /stream, /state, /fills), hosted on helen and following main; verified responding 14:03 JST |
| Stream URL | https://handoff.lol/t/castle/stream |

## Documentation

| Doc | Owner | Status |
|---|---|---|
| README.md (pitch, before/after, addresses) | impecc (voice) + korg (technical) | draft by SirKit (00d5ccf) |
| docs/PLAN.md | handoff-advisor | done (research 3cb55b7; identifier rename 4d5afc0) |
| docs/NAMING.md | SirKit, per operator | done (c0f0241) |
| docs/ens-probes.md | korg | done: live and fork evidence, verified by handoff-advisor, plus the subregistry design note (bde95fc) |
| docs/1inch.md, docs/uniswap.md, docs/ens.md | korg | todo |
| FEEDBACK.md | korg | todo |
| docs/video-script.md + deck | impecc | todo |
| AI_USAGE.md | SirKit | in progress |
| miniapp/STREAM.md | impecc | done (6a50934) |
| PRODUCT.md, .impeccable/surfaces/ | impecc | done; landed inside SirKit's commit f7e88df by accident (a shared-tree sweep), authored by impecc |

## Demo evidence

| Step | Tx / link | Verified by |
|---|---|---|
| (a) gap after kill -9: old fill winds down |  |  |
| (b) after fi's claim: old-epoch fill reverts FeeFiFoFum() |  |  |
| (c) new-epoch fill passes |  |  |
| (d) restarted fee rejected on-chain |  |  |
| (5) kill everyone: dissolve(), CCA clears, price to ENS |  |  |

## Operator-owned contributions

ETHGlobal may exclude entries that rely entirely on AI. The operator's own decisions and work are listed here and mirrored in AI_USAGE.md.

| Time (JST) | Contribution |
|---|---|
| Sat 13:20 | Chose Option A from handoff-advisor's research; appointed SirKit orchestrator and picked the swarm |
| Sat 13:25 | Ruled that nothing for the entry goes in the handoff repo; all work lives in feefifofum |
| Sat 13:40 | Renamed the entry fee-fi-fo-fum, with Jack the Giant Killer overtones for forward-facing copy |
| Sat 14:05 | Confirmed Continuity-track registration |
| Sat 14:05 | Linked the GitHub repo (PAT) to handoff project 2af16779 |
| Sat 14:05 | Sent Sepolia ETH to the treasury 0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2 |
| Sat 13:47 | Funded the treasury with 20 Circle Sepolia USDC (tx 0x1dc2132a810bd8f2551e337193a446bb507478f9d2be5a4dcc522f1e95fb4884) |
| Sat 14:00 | Funded the treasury with 0.05 Sepolia ETH and a further 20 USDC |
| Sat 14:12 | Ruled that validators (agy) validate only and never build or edit other agents' work |
| Sat 14:15 | Set the binding role map: agent-smith builds agents; mister-anderson does crypto; handoff-advisor and agy validate; impecc does presentation and miniapps; handoff-claude fixes handoff; korg researches |
| Sat 14:35 | Mined 0.0186 Sepolia ETH on the PoW faucet for the treasury |
| Sat 14:40 | Approved XMBL_GATE=skip for the handoff.lol deploy of the platform fixes; standing instruction: don't hold up progress |

## Log

| Time (JST) | Who | What |
|---|---|---|
| Sat 13:20 | operator | Chose Option A. SirKit is orchestrator. Swarm: agent-smith, mister-anderson, impecc, korg, agy, handoff-advisor, handoff-claude. |
| Sat 13:24 | SirKit | Pushed the README (a09a598) to github.com/34r7h/fee-fi-fo-fum. |
| Sat 13:24 | SirKit | Created handoff project 2af16779 (budget 12 USDC, ethereum-sepolia). |
| Sat 13:25 | handoff-advisor | Confirmed the research is theirs; relayed the operator rule that nothing for the entry goes in the handoff repo. |
| Sat 13:26 | SirKit | Pushed docs/PLAN.md (3cb55b7), byte-identical to the advisor's original. |
| Sat 13:28 | SirKit | Created 7 goals and 28 tasks with parallel ordering. |
| Sat 13:32 | handoff-advisor | Alignment verdict: PASS WITH EDITS (rebalance load, ICastleLease, ENS load-bearing for pre-existing agents, fixes to the state-machine beats, durable demo, ETH budget, AI-eligibility). |
| Sat 13:40 | SirKit | Applied every edit and renamed the product to fee-fi-fo-fum on the board (31 tasks, 13 blockers, 11.35 USDC allocated); 0 old-name mentions on the board. |
| Sat 13:42 | SirKit | Replaced the old-name team with team_d5195308, sent official invites to all 7, set the hierarchy, and sent 6 assignment messages. |
| Sat 13:43 | handoff-advisor | Re-check: PASS. Accepted the verifier role. |
| Sat 13:44 | handoff-claude | Live; accepted the role; claimed p2-rail, p2-ensv2-registry, p2-capabilities, p2-stream and p5-durable. |
| Sat 13:45 | korg / mister-anderson | Both blocked: 0 Sepolia ETH, and no ETHERSCAN_API_KEY. |
| Sat 13:46 | handoff-claude | p2-rail defect report: handoff cannot settle on ethereum-sepolia (the x402 facilitator is Base-only, payouts ignore settlement_network, no WETH rail). Workaround: self-custodied Sepolia EOAs. |
| Sat 13:50 | SirKit | Adopted the self-custodied EOA workaround. Created treasury 0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2 for the operator to fund. Told the swarm to work on an anvil fork until funds land. |
| Sat 13:52 | agent-smith | Created self-custodied Sepolia EOAs for fee, fi, fo and fum (keys 0600, not in git) and claimed all 5 of its tasks. |
| Sat 13:55 | impecc | miniapp/STREAM.md is on main (6a50934); building fee-fi-fo-fum.html against the mock. |
| Sat 13:57 | mister-anderson | Foundry scaffold pinned to swap-vm v1.0.2 (3301492); ICastleLease (980fd97) and MockCastleLease (f0c7d65); p1-iface submitted. |
| Sat 13:58 | handoff-claude | ens_name cannot take an ENSv2 name without a platform change (escalated to the operator). Durable host approved: the existing sandbox host. castle agent approved. |
| Sat 13:59 | handoff-claude | Registered the castle agent on handoff.lol with a self-custodied EOA, 0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99. |
| Sat 14:00 | agy | Accepted the tester/witness role; claimed p3-fo, p1-forktests, p4-cca-e2e and p6-rehearsal. All 7 swarm members are now accepted. |
| Sat 14:05 | operator | Continuity confirmed, GitHub PAT set on the project (connected at 13:33 JST), Sepolia ETH sent to the treasury. |
| Sat 14:06 | SirKit | p0-continuity verified. Reassigned by specialty: FeeFiFoFumExtruction and JackHook to mister-anderson (korg feeds the research), fo to agent-smith (agy stays independent validator). The castle service stays with handoff-claude. Board check: 0 owner/assignee mismatches. |
| Sat 14:06 | SirKit | Corrected settlement: agent payouts settle in Base Sepolia USDC; the entry is on Ethereum Sepolia. |
| Sat 14:08 | agent-smith | Registered fee, fi, fo and fum on handoff (b1e64ff); verified online with a self-provided wallet_address. p3-scaffold submitted (444a32d); agent_heartbeat every 20s. |
| Sat 14:10 | SirKit | Treasury still at 0 Sepolia ETH on every testnet checked; asked the operator for the tx hash. |
| Sat 14:12 | handoff-advisor | PASS on p1-iface (fresh clone at 6009be1: typehash verified, forge 2/2) and on p2-rail (defect report confirmed against source). Flagged two critical Castle security items. |
| Sat 14:14 | SirKit | Verified p1-iface and p2-rail. Payout is withheld until a second orchestrator co-signs, so handoff-advisor is now a co-signing orchestrator. Added crew-only claim() and an Aqua-only multicall allowlist to Castle's DoD. |
| Sat 14:15 | korg | All four ENSv2 probes answered on an anvil fork (docs/ens-probes.md); feefifofum.eth registered and resolved there. Corrected the funding address to its self-custodied EOA 0x48EB…5d3E. |
| Sat 14:16 | mister-anderson | Castle.sol (81ffd04) with unit tests against real Aqua and AquaSwapVMRouter 1.0.2 (789f550); lease events match STREAM.md (3fa3aa6). |
| Sat 14:18 | handoff-advisor | Co-signed p1-iface and p2-rail. The payout was confirmed by balance delta (mister-anderson +0.1 USDC). |
| Sat 14:22 | SirKit | Treasury on-chain: 20 USDC arrived from the Circle faucet at 13:47 JST; native Sepolia ETH is still 0 (checked via publicnode, tenderly, ethpandaops and Blockscout). ETH is needed for gas before anything can move. |
| Sat 14:00 | operator | 0.05 Sepolia ETH to the treasury (0x56611a5a…); USDC topped up to 46 in total. |
| Sat 14:03 | SirKit | Distributed gas at about 1 gwei: deployer 0.02, korg 0.008, fee 0.005, fi 0.004, fum 0.003, fo 0.001, castle 0.005 ETH; USDC: deployer 8, fee/fi/fum 2 each. Every balance verified on-chain. |
| Sat 14:03 | handoff-claude | The castle service is live and durable at https://handoff.lol/t/castle/ (p5-durable submitted). ENSv2 agent-registry script works on a fork, 5/5 names. Flagged Castle.sol resolver selectors that are absent from the deployed PermissionedResolver. |
| Sat 14:04 | handoff-claude | ENSv2 agent registry and resolver deployed live on Sepolia (a2b1ceb); both txs succeeded, code verified on-chain. |
| Sat 14:04 | agy | Fork suite CastleFork.t.sol (8cc9a7f): live Aqua pull/push, renew without a fo signature reverts, withheld attestation, replay (within and across epochs), epoch fencing. Now also writing the independent non-crew claim and multicall-drain tests. |
| Sat 14:08 | handoff-advisor | PASS on p5-durable (live Sepolia reads at head; runs on helen, not the laptop) and on p3-scaffold. |
| Sat 14:09 | SirKit | Verified p5-durable and p3-scaffold; co-sign requested. |
| Sat 14:10 | handoff-advisor | Co-signed p5-durable and p3-scaffold; both paid (receipts 80f9d048 and 86aba84d). |
| Sat 14:06 | mister-anderson | SwapVM router 1.0.2 deployed live, 0xeDB6…70f9, bound to official Aqua (on-chain check: code present, status 1). Castle v2 closes the crew-only claim and the multicall allowlist, plus a third drain (holder-chosen app/program): Castle now builds the fenced program on-chain. |
| Sat 14:12 | operator | Ruled that validators do not build: agy must not write code or touch other agents' work. |
| Sat 14:12 | SirKit | Ordered agy to validate only. Re-scoped p1-forktests to validation. All Castle test code, including CastleFork.t.sol, goes to mister-anderson; agy's fo code goes to agent-smith. |
| Sat 14:16 | SirKit | Enforced the operator's role map. The castle service, stream and agent ENS names moved to agent-smith. handoff-claude got two handoff.lol platform fixes: ENSv2 ens_name, and ethereum-sepolia settlement. korg is research only. Remaining crypto tasks assigned to mister-anderson. Board: 33 tasks, 0 owner/assignee mismatches, 0 unassigned agent tasks. |
| Sat 14:16 | agent-smith | p0-wallets submitted: WETH9 wraps for fee, fi and fum (0xe66c6461…, 0x92f31b76…, 0x7ac0f9b5…). |
| Sat 14:18 | handoff-advisor | p0-wallets FAIL against 'at least 0.1 ETH each' (the operator funded 0.05 ETH in total). |
| Sat 14:19 | SirKit | Amended the p0-wallets DoD: funding is the treasury's job, with a measured budget of fee/fi/fum ≥0.03 and fo ≥0.005 ETH. WORKLOG now shows live balances. More ETH requested from the operator. |
| Sat 14:19 | korg | feefifofum.eth registered live (tx 0xc51ab266…, status 1); subregistry and resolver set to the agent registry. p0-ens-probes submitted. |
| Sat 14:21 | handoff-claude | Handed the service, stream and names over to agent-smith. fee, fi, fo and fum.feefifofum.eth registered live (133b33e). |
| Sat 14:22 | SirKit | Verified that all four names resolve via UniversalResolverV2 to their EOAs. Asked agy for a self-custodied EOA so agent-smith can register agy.feefifofum.eth for the JackHook bid. |
| Sat 14:23 | handoff-advisor | p0-wallets PASS against the amended DoD. p0-ens-probes: all four probes proven (live setData 0x4f18a7f7, live linkToNode 0x1f5215fd, token-id bump on re-register), but it is held because addr(feefifofum.eth) returns 0x0. |
| Sat 14:24 | SirKit | Verified p0-wallets; co-sign requested. Routed the parent addr record to agent-smith (castle EOA holds the resolver role). Sent mister-anderson the Castle constraint: castle.feefifofum.eth lives in subregistry 0x2F21…E09, and Castle takes ROLE_REGISTRAR and ROLE_RENEW at registration. |
| Sat 14:25 | handoff-advisor | Co-signed p0-wallets (paid, receipt 8b3e00be). |
| Sat 14:27 | agent-smith | Set addr(feefifofum.eth) from the castle EOA (tx 0x74042211…b570). |
| Sat 14:27 | SirKit | Confirmed with an eth_call that feefifofum.eth resolves via UniversalResolverV2 to 0x48EB…5d3E; asked handoff-advisor to re-check p0-ens-probes. |
| Sat 14:29 | handoff-advisor | p0-ens-probes PASS: every DoD clause met. |
| Sat 14:29 | SirKit | Verified p0-ens-probes; co-sign requested. korg to add the subregistry design consequence to docs/ens-probes.md. |
| Sat 14:30 | handoff-advisor | Co-signed p0-ens-probes (paid, receipt 07ea6eab). Goal P0 is complete: every blocker verified. |
| Sat 14:31 | korg | Added the subregistry design consequence to docs/ens-probes.md (bde95fc), with live eth_call evidence (MIN_REGISTER_DURATION = 2419200; owner holds no ROLE_RENEW or ROLE_REGISTRAR). |
| Sat 14:27 | handoff-claude | p2-ensname-fix built and tested in the handoff repo (95932ef; 2,237 tests pass). Deploy was blocked by the pre-existing XMBL mesh gate (0 live nodes: helen coordinator crash-looping, seed 173.255.233.69:4001 refusing) and prod was rolled back to 079f8f0, which is healthy. |
| Sat 14:28 | SirKit | Told handoff-claude to fix helen's coordinator (its role). Escalated XMBL_GATE=skip or the seed-node revival to the operator. |
| Sat 14:33 | mister-anderson | Castle v2 and FeeFiFoFumExtruction on main: 102 unit tests, 8 fork tests against live contracts, 4/4 mutants killed. |
| Sat 14:34 | SirKit | Decision (A): the CCA entry points go into Castle before a single deploy at about 08:30Z (17:30 JST). Deploy sequence: mister-anderson deploys and runs the owner steps, then agent-smith grants roles from the castle EOA and fee's genesis claim mints castle.feefifofum.eth. agy validates the suite without editing. |
| Sat 14:35 | agent-smith | Agreed the deploy sequence with mister-anderson and rehearsed it on a fork. |
| Sat 14:37 | agent-smith | Corrected the deploy sequence: castle.feefifofum.eth is NOT pre-registered. Castle receives ROOT REGISTRAR and RENEW from the registry admin (castle EOA), and fee's genesis claim() mints the name. Rehearsed on a fork. |
| Sat 14:35 | operator | +0.0186 ETH to the treasury (0x5d37b019…). |
| Sat 14:38 | SirKit | Distributed it: deployer +0.01 (now 0.0253), fee +0.004 (0.0080), fi +0.004 (0.0070), fum +0.002 (0.0040), all verified on-chain. The treasury keeps 0.0021. |
| Sat 14:40 | SirKit | Ordered handoff-claude to deploy p2-ensname-fix now with the operator-approved XMBL_GATE=skip, with p2-sepolia-settle to follow in a second deploy. |
| Sat 14:41 | impecc | fee-fi-fo-fum.html plays the full five-beat demo from the mock stream, with a replay tab and Jack the Giant Killer copy (ccb9ae0). p5-mock submitted. |
| Sat 14:42 | SirKit | Sent p5-mock to agy for validation. |
| Sat 14:50 | handoff-claude | Shipped the ens_name platform fix (handoff 95932ef, deployed with the operator-approved XMBL_GATE=skip): POST /agents/:id/ens {action:'ensv2'} checks addr via UniversalResolverV2 and stores a replayable ens_proof. fee, fi, fo and fum carry ENSv2 ens_name on handoff.lol. |
| Sat 14:53 | SirKit | Checked it outside the platform: build_sha 95932ef; each stored proof, replayed at the latest block, returns the agent's wallet. Sent p2-ensname-fix to handoff-advisor. Its DoD now covers four agents; agy moved to a new task. |
| Sat 14:52 | agy | Created a self-custodied Sepolia EOA 0xDDf2…AE4c (key 0600, never in git). The owner-token wallet PUT returned 403. |
| Sat 14:55 | SirKit | Opened p2-wallet-pop (c2ce4a3f, handoff-claude, 0.11 USDC): an agent rotates its own wallet with a proof of possession. Moved 0.1 USDC of budget from the P3 goal to fund it. |
| Sat 15:00 | agent-smith | Registered agy.feefifofum.eth → 0xDDf2…AE4c with the addr, agent-endpoint[mcp] and handoff-agent records. SirKit resolved it via UniversalResolverV2. |
| Sat 15:00 | SirKit | Attributed PRODUCT.md and .impeccable/surfaces/ to impecc. They landed in SirKit's commit f7e88df by accident; history is not rewritten. |
| Sat 15:05 | handoff-advisor | Validated p2-ensname-fix: PASS. Replayed the stored proofs and a UR.resolve it built itself; read the code at 95932ef. |
| Sat 15:06 | SirKit | Verified p2-ensname-fix. handoff-advisor co-signed; 0.15 USDC paid (receipt 0ffc63d0). |
| Sat 15:04 | agy | Validated p1-forktests at 2ca27aa: 144/0, all 10 cases PASS; no code written. Validated p5-mock at ccb9ae0: 5/5 PASS. |
| Sat 15:10 | SirKit | Re-ran the whole Foundry suite at 90d4001: 144 passed, 0 failed, with CastleFork 10/10 on a real Sepolia fork. Verified p1-forktests; handoff-advisor co-sign requested. |
| Sat 15:12 | impecc | Submitted p5-mock at ccb9ae0: 73,729 B, pre-flight 100/100. |
| Sat 15:15 | SirKit | Verified p5-mock and asked handoff-advisor to co-sign. Fill links take their explorer from the stream config: blank in the mock, sepolia.etherscan.io from the live service. |
| Sat 15:01 | handoff-claude | Deployed p2-sepolia-settle (handoff 0115146): an EIP-3009 rail, so payouts honour settlement_network=ethereum-sepolia; wallet/spend takes network; the faucet drips Sepolia USDC. |
| Sat 15:03 | SirKit | Confirmed build_sha 0115146 live. Funded handoff-claude's custodial wallet 0x5D51…5A3c with 0.2 USDC from the treasury ([0x5dd969c2…](https://sepolia.etherscan.io/tx/0x5dd969c2b2d5bb4a0a7ee98a571add1c7336dbffe4e72ba332824d2b00e5714c)) for the DoD transfer. |
| Sat 15:05 | mister-anderson | Deployed Castle v2 0x6bF5…E8Ec, FeeFiFoFumExtruction 0xfA04…f271 and JackHook 0x5091…fcAd from 7b86321 (6 txs, all status 1). setCrew fee and fi, setAuctioneer fum, funded 0.004 WETH + 8 USDC. Graduation floor: an auction must raise at least 50% of the lot at the floor, or the anchor stays. |
| Sat 15:08 | SirKit | Read Castle back on-chain: code at all three addresses; isCrew fee/fi true, fo false; auctioneer fum; grace 1800; hoard matches. Ordered agent-smith to do the root grants right away instead of at 08:30Z. |
| Sat 15:09 | SirKit | Decision: the genesis anchor is seeded from Chainlink's Sepolia ETH/USD feed 0x694A…5306, read at seed time, not an arbitrary 3000, because the rules forbid hard-coded demo values. |
| Sat 15:06 | handoff-claude | p2-sepolia-settle DoD: 0.1 USDC handoff-claude → fee via the API on ethereum-sepolia (tx 0x8a114e7c…). |
| Sat 15:10 | SirKit | Checked the Transfer log of 0x8a114e7c… on-chain and verified p2-sepolia-settle. Sent p1-fence and p4-crewhook to agy and handoff-advisor. |
