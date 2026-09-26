# Pivot: the architecture brief

Written by **agy** (AI agent on handoff) at the operator's direction on 2026-09-26, and sent to SirKit as a handoff message. It is kept verbatim below as the planning artifact for the pivot. The locked build scope is [docs/SPEC.md](SPEC.md); where the two differ, SPEC.md wins.

The previous product, the lease edition, is preserved at tag `lease-edition`.

---

ARCHITECTURAL PIVOT SPEC for FeeFiFoFum (per operator directive).

We are pivoting from the COD/Dutch auction toy to an institutional Cross-Chain Shared-Liquidity & JIT Provisioning Giant. We keep the folklore motif, but solve the real $50B DeFi bottleneck: Rollup Liquidity Fragmentation + LVR.

1. SPONSOR TECH INTEGRATION:
- 1inch Aqua & SwapVM (Capital Efficiency): The Castle is an Aqua shared-liquidity vault. Capital stays in LP custody (earning Aave/sUSDe lending yield). Single balance backs quotes across multiple chains simultaneously via programmable SwapVM bytecode. Zero locked AMM deposits, zero-cost allowance revocation.
- Uniswap Multichain / Unichain / v4 (Execution): Listens to UniswapX cross-chain intent auctions. Executes JIT liquidity via Uniswap v4 Aqua-settled hooks. Uses Unichain 200ms Flashblocks + Flashbots verifiable block building for sub-second, LVR-resistant re-quoting.
- ENSv2 Naming Conventions (Discovery): The decentralized routing table. Hierarchical subregistries (castle.eth, fee/fi/fo/fum.castle.eth). ERC-7828 multichain addressing (castle.eth@unichain, castle.eth@base). ERC-3668 CCIP-Read on quote.castle.eth for gasless real-time SwapVM quote discovery for solvers.

2. SWARM ROLE RE-ASSIGNMENT:
- The Castle (castle.eth): Aqua shared vault smart account.
- fee: Dynamic pricing engine (Unichain Flashblocks + Uniswap v4 fee hooks).
- fi: SwapVM compiler (crafts & signs EIP-712 SwapVM bytecode orders).
- fo: Cross-chain forwarder (monitors UniswapX auctions & resolves multi-chain routes).
- fum: Inventory & risk manager (guarantees atomic non-over-allocation of shared Aqua collateral across chains).
- Jack: External solvers (UniswapX fillers / 1inch resolvers) sourcing JIT quotes via CCIP-Read.
- agy: Independent validator / outside Jack test bidder (verifying SwapVM bytecode, CCIP-Read proofs, and Anvil fork execution).

Operator instructed to stand down on old Castle v3 contracts/rehearsals and redirect the swarm to build this. Ready for swarm coordination tasks.
