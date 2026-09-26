# Fork demo, two passes

## 1. Full RPC Passes (Post c-deploy, crew-fork.sh)

Harness: `agents/scripts/crew-fork.sh STRESS=0`. Both passes run on independent Anvil forks of live Sepolia taken after c-deploy (Pass 1 at block 11786255, Pass 2 at block 11786266). All 4 deployed contracts adopted, local castle gateway running with fi key, real crew agents (fee, fi, fo, fum), and Jack (agy) executing real RPC transactions via UniversalResolverV2 and CCIP-Read.

Logs and artifacts: `docs/e2e/pass1/` and `docs/e2e/pass2/`.

All transaction hashes are completely distinct across both passes.

| Beat / Event | Pass 1 Tx Hash | Pass 1 Gas | Pass 2 Tx Hash | Pass 2 Gas |
|---|---|---|---|---|
| fum: setLeverage (WETH) | `0xc8b24fae742d0c7e45ed0dd1226c0d129ccc7da804ad16ab27b804e3aaa7dcca` | 31,401 | `0xcee4c113b226d04b6f5dc7fe77a75181d96431b1e40ce6ddf7062306378a44e9` | 31,401 |
| fum: setLeverage (USDC) | `0x25092e4e35c0916ae5316174a2d1ca55f28850a766c24b2574b8bcbe94d133ad` | 31,357 | `0x82fd54a9f24a57f7bce8b4cc7cdf433c30b1ebde7ea5a93c0838a94ab2d43586` | 31,357 |
| fum: setCap (slot 0) | `0x12fca6dfe2e68362033935e537b9279dcac07f1334b3dc98340d29e366f68a8b` | 70,557 | `0xad2794b99a7d822366149666720c12443738ad60d32302b975fba4cc90a5c1f1` | 70,557 |
| fum: setCap (slot 1) | `0x2ed350c8287f9e34d12c64c9786ee4482d61ab8e75f451f0db38499d9c113c90` | 70,569 | `0x01b22f149fe81c0b0f1fdfbdad6e025c0f285010f7826fcbc8d37b4cd60f2984` | 70,569 |
| fum: setCap (slot 2) | `0x95bdfb60fb08536530b83a3cf0ff94348ed49fd354dd544c910fad2d84574190` | 70,569 | `0x3889b44036a7ed1b190e480c3954003356be86627ee81d158137464929be35ff` | 70,569 |
| fi: ship harp (80%) | `0x6d28ad23766c176f5d15b250307d0cf5388d4b926f8b43ea70f660895f0633bf` | 238,098 | `0x73dc7b041b3403be9b6e162e73251d26f5ca922dcad651334237460a21985ff3` | 238,098 |
| fi: ship hen (80%) | `0xd2af98bc0dfe7a668a6df251c0e0ef34d3c6a0702389d9dc1136b5654db164a9` | 223,064 | `0xf9dc95e05ff724b0ed5d57ba41cb5445675ac729c5c2aa76b1aa8f8dbba3023e` | 223,064 |
| fi: greedy (0.5x, OverAllocated) | `0x87a0f215d3affad87224ed5b25e88841a7f0c17ba36bbdf530d2fb8c86fec615` | 66,713 | `0xc144a9e2dfd87313d6868b49eb8fe739020d9986d2b4e0e91bbc487a3b718194` | 66,713 |
| Jack: CCIP-Read harp fill | `0x2700accfbb7804cfb4c1b80f6cae7260cafd3808cd76392f69870f81842261b5` | 157,005 | `0x943f18e473292a66c96d7841223a746318d9721342f423cc7d614ee7f374e3a0` | 157,005 |
| Jack: v4 swap (JIT fill from hen) | `0x2f9beabc3ba22cc4ea17787d861ad511a48345be919e386242733def36280b12` | 278,346 | `0xcf2da30d3ed5eba8b7b76f6a7afa3b72e00ca918b42cb7a90ce84579c897e008` | 278,346 |
| fo: route intent | `0x5c128f166868123db9b8df870f84c73b595c5e4af7a4d65671083c0be961902d` | 157,005 | `0x0da4c437d7ebe1cdd81ef51fbf0dc631618b2430cd10b5c99b69da463be8bee1` | 157,005 |
| Jack: expired quote revert | `0xff05db12212d997b9a806e71c4bb6fcb5227d0157aeda2aa4d6113d43dfae69a` | 46,654 | `0xf7a358a4b13cfec4a68d66d9a0c3762e528c4e005fda2f3de23f0118266de934` | 46,654 |
| fum: ledger checks & docks | 7 ledger checks, **0 docks** | — | 7 ledger checks, **0 docks** | — |
| service: test checks | **13 of 13 passed** | — | **13 of 13 passed** | — |

## 2. Contract-Level Passes (SpecDemoFork.t.sol)

Harness: `contracts/test/fork/SpecDemoFork.t.sol`, `forge test --match-contract SpecDemoForkTest -vv` from `contracts/`.

Both contract cheatcode passes passed. Pass 1 uses block 11785880. Pass 2 uses block 11785881. Logs: `pass-11785880.log`, `pass-11785881.log`.

