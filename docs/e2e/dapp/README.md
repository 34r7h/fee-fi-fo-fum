# End-to-End Live Validation: Web3 Dapp (`v-dapp`)

- **Task**: `ffff2-v-dapp` (`93e81dc2-9b78-4ea0-8398-5c243b83b0d3`)
- **Validator**: `agy` (`0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c`)
- **Target URL**: `https://handoff.lol/app/impecc/fee-fi-fo-fum` (v2.0.2)
- **Network**: Ethereum Sepolia (Chain ID 11155111)
- **Outcome**: **PASS**

---

## 1. Overview and Execution Method

The published feefifofum dapp was validated live on Ethereum Sepolia from an isolated, fresh Chrome browser profile with an injected EIP-1193 provider backed by `agy`'s private key (`~/.handoff/agents/agy/sepolia.key`).

All user actions were performed strictly through the page's UI elements:
1. Connected the wallet (`0xDDf2...AE4c`), verifying that balances, network status, and strategy cards loaded properly.
2. Verified the default 0.25 USDC trade amount.
3. Filled the RFQ strategy quote from the Harp via the **"Fill this quote"** button.
4. Swapped through the Uniswap v4 pool from the Hen via the **"Swap through the v4 pool"** button.
5. Verified all 4 resulting on-chain transactions, events, and balance updates.

Gas constraints were strictly maintained within the 1.8 gwei maximum fee cap (0.1 gwei priority fee).

---

## 2. On-Chain Transaction Record

| Beat / Action | Hash | Block | Gas Used | Effective Gas Price | Status |
|---|---|---|---|---|---|
| **Harp USDC Approval** | `0x66f9863bfee8e11149355c606b3476eb57cb163c0ca75d2dc59dcdad44aa850d` | 11787567 | 55,437 | 1.203 gwei | Success (1) |
| **Harp CCIP-Read Fill** | `0x84bd78b6613915c92ca3a8be2e022578450dcb0f3594690fd9998e4b16151414` | 11787568 | 157,005 | 1.137 gwei | Success (1) |
| **Hen USDC Approval** | `0x9dd4e78aef85df87747761666178ee278a233f1590deadb46ad491bed67f3b5e` | 11787577 | 55,437 | 1.169 gwei | Success (1) |
| **Hen Uniswap v4 Swap** | `0x2cc0d568d8234715a7d9748092491f95ad443f2e838ff0048e9089d5e04cb86c` | 11787578 | 278,636 | 1.091 gwei | Success (1) |

- **Total Gas Used**: 546,515
- **Total Gas Cost**: 0.00061399 ETH (within the ~0.00066 ETH budget)

---

## 3. On-Chain Event Verification

1. **Harp Fill (`0x84bd...1414`)**:
   - Emitted 1inch Aqua `Pulled` and `Pushed` events between `CastleVault` and `SwapVM Router`.
   - Transferred 0.25 USDC from `agy` to `CastleVault`.
   - Transferred 0.00009277 WETH from `CastleVault` to `agy`.

2. **Hen Swap (`0x2cc0...866c`)**:
   - Emitted atomic events in a single transaction:
     - Uniswap v4 `PoolManager` swap initialization and settlement.
     - 1inch Aqua `Pulled` and `Pushed` events between `CastleVault` and `SwapVM Router`.
     - `CastleJITHook.JitFill(poolId, hen, sender, USDC, 250000, 86476092014462)`.
   - Transferred 0.25 USDC from `agy` to the pool/vault.
   - Transferred 0.00008647 WETH to `agy`.

---

## 4. Post-Run Balances

- **`agy` (`0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c`)**:
  - ETH: 0.0008289 ETH (-0.000614 ETH spent on gas across 4 txs)
  - USDC: 13.90 USDC (-0.50 USDC paid)
  - WETH: 0.0005301 WETH (+0.0001792 WETH received)
- **`CastleVault` (`0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98`)**:
  - USDC: 4.910627 USDC
  - WETH: 0.0019496 WETH
- **`CastleJITHook` (`0x890125413c9FeDB770D872BbA9415f5E1B7C0888`)**:
  - USDC: 0 (transient strictly 0)
  - WETH: 0 (transient strictly 0)

---

## 5. Artifacts and Screenshots

The browser test captured visual artifacts confirming UI and wallet states:
- `01-connected.png`: Wallet connected, Sepolia balances rendered, trade input set to 0.25 USDC.
- `02-hen-quote-ready.png`: Quotes loaded for both Harp and Hen strategies.
- `03-hen-swapped.png`: Hen swap confirmed in the UI.
- `04-final-full.png`: Full page view showing trades populated under the trades table and updated Castle metrics.
- `txs.json`: Machine-readable array of all sent transaction hashes.
