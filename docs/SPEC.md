# feefifofum: the spec

**One hoard, every market.** A market maker's capital is split across pools and chains, and its stale quotes leak value to arbitrage (LVR). In feefifofum, one balance in the Castle vault backs many quotes at once through 1inch Aqua. Solvers discover firm quotes gaslessly through ENS CCIP-Read, and Uniswap v4 swaps are filled just in time from the same balance.

This file is the locked build scope. It wins over [PIVOT.md](PIVOT.md) (agy's architecture brief) and over [miniapp/STREAM.md](../miniapp/STREAM.md). Anything not proven on Sepolia sits under [Stretch](#stretch).

## Done means

Everything below is live on Ethereum Sepolia (chain 11155111), with a tx link for each item.

| # | Beat | Sponsor | Proof |
|---|---|---|---|
| 1 | One Castle balance backs two SwapVM strategies (`harp` and `hen`) whose promises add up to more than the balance. A third ship past fum's leverage cap reverts `OverAllocated`. | 1inch Aqua | two `Shipped` txs, one reverted ship |
| 2 | A solver resolves `quote.feefifofum.eth` through CCIP-Read, gets a firm quote signed by fi, and fills it. | ENS | the gateway log line and the fill tx |
| 3 | A Uniswap v4 swap on the Castle's pool is filled just in time from the Castle. | Uniswap | one tx that contains both v4 `Swap` and Aqua `Pulled`/`Pushed` |
| 4 | The miniapp shows all three from a clean browser. | all | the published URL |

## Existing addresses

| What | Address |
|---|---|
| Aqua | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` |
| AquaSwapVMRouter 1.0.2 | `0xeDB6933949dB941D495b23604818F9AbF55e70f9` |
| USDC (Circle, 6 dp), `currency0` | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| WETH9, `currency1` | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |
| v4 PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| v4 PoolSwapTest | `0x9b6b46e2c869aa39918db7f52f5557fe577b6eee` |
| v4 StateView / Quoter | `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c` / `0x61b3f2011a92d183c7dbadbda940a7555ccf9227` |
| CREATE2 deployer | `0x4e59b44847b379578588920ca78fbf26c0b4956c` |
| ENSv2 feefifofum registry | `0x2F2164507471a1a46506f902aBfdfB9d22e4bE09` |
| UniversalResolverV2 | `0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3` |
| Chainlink ETH/USD (fee's reference) | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |

The v4 addresses come from Uniswap's deployments page and were checked with `eth_getCode` by korg ([research.md](research.md)).

| Key | Address | Holds |
|---|---|---|
| Owner (the treasury, SirKit) | `0xc3Af4CCa3ba691C74F18fa8D3a7ad6816eC65dF2` | vault owner, resolver owner, funds the hoard |
| Deployer (mister-anderson) | `0x89a7d90F6bCAF2FFd5c1519Fa7F3D9DB84e9AA73` | deploys only; no role afterwards |
| fi.feefifofum.eth | `0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2` | ship/dock, quote signer, gateway signer |
| fum.feefifofum.eth | `0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2` | leverage, caps, dock |
| fee.feefifofum.eth | `0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538` | none on-chain; prices |
| fo.feefifofum.eth | `0x8689a407A2488A5b2f2De05d2C6978a798f93D56` | none on-chain; routes |
| agy.feefifofum.eth (outside Jack) | `0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c` | takes quotes, swaps on v4 |
| Registrar | `0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99` | registers `quote` |

## Contracts

Owner: mister-anderson. All are new files in `contracts/src/`. The lease edition's Castle, fence and JackHook stay untouched at tag `lease-edition`, and nothing new reads them.

### CastleVault.sol: the hoard

The Castle is an Aqua maker. Its tokens never leave it when it ships a strategy. Aqua records a virtual balance per strategy, and pulls from the Castle only when a fill happens.

```solidity
constructor(address aqua, address router, address weth, address usdc, address owner, address fi, address fum);
// checks router.AQUA() == aqua; approves Aqua (only) for WETH and USDC; no ERC-1271, no router approval

// fum
function setLeverage(address token, uint16 bps) external;          // 20000 = promises may total 2x the balance
function setCap(uint8 slot, uint256 wethCap, uint256 usdcCap) external;
// fi
function ship(uint8 slot, bytes calldata program, uint256 weth, uint256 usdc)
    external returns (bytes32 strategyHash, ISwapVM.Order memory order);
// fi, fum or owner
function dock(bytes32 strategyHash) external;
// owner (Ownable2Step)
function setFi(address) external; function setFum(address) external;
function withdraw(address token, address to, uint256 amount) external;   // only while the cap still holds after it

// views; MAX_SLOTS = 8 bounds every loop
function committed(address token) external view returns (uint256);    // sum of live strategies' Aqua balances
function headroom(address token) external view returns (uint256);     // balanceOf * leverageBps / 1e4 - committed
function activeStrategies() external view returns (bytes32[] memory);
function strategyIn(uint8 slot) external view returns (bytes32);
function orderOf(bytes32 strategyHash) external view returns (ISwapVM.Order memory);
function slotOf(bytes32 strategyHash) external view returns (uint8);
function capOf(uint8 slot) external view returns (uint256 wethCap, uint256 usdcCap);
function leverageOf(address token) external view returns (uint16);

event Shipped(uint8 indexed slot, bytes32 indexed strategyHash, uint256 weth, uint256 usdc);
event Docked(bytes32 indexed strategyHash, address indexed by);
event CapSet(uint8 indexed slot, uint256 wethCap, uint256 usdcCap);
event LeverageSet(address indexed token, uint16 bps);

error SlotBusy(uint8 slot);
error OverCap(uint8 slot, address token, uint256 amount, uint256 cap);
error OverAllocated(address token, uint256 committedAfter, uint256 limit);
```

- `ship` builds the MakerTraits itself: maker and receiver are the Castle, `useAquaInsteadOfSignature` is on, and there are no hooks and no unwrap. It appends its own `Salt(nonce)`, so a docked program can be shipped again. All checks run before the Aqua call.
- **The cap is leverage, not full backing.** Shared liquidity means the promises can add up to more than the balance, and beat 1 depends on that. `ship` reverts `OverAllocated` when `committed(token) + amount > balanceOf(token) * leverageBps / 1e4`.
- fi supplies the program bytecode. fum's per-slot cap and leverage bound what fi's key can give away: fi compiles, fum bounds.

### PriceExtruction.sol: firm quotes that go stale on time

A SwapVM `Extruction` (both `IExtruction` and `IStaticExtruction`), derived from the lease edition's heartbeat check. It turns a quote signed off-chain into the fill price, so re-pricing costs no gas and a stale quote can't fill.

```solidity
struct Quote {
    bytes32 strategyHash;
    address tokenIn;
    address tokenOut;
    uint256 priceQ96;      // tokenOut per tokenIn in raw units, Q96
    uint256 maxAmountIn;   // per fill
    uint64  validUntil;    // unix seconds
}
// EIP-712 domain: name "feefifofum PriceExtruction", version "1", chainId 11155111, verifyingContract = this
// takerData = abi.encode(Quote, bytes sig); the signer must be vault.fi()
// exact-in only: amountOut = amountIn * priceQ96 >> 96
error QuoteExpired(uint64 validUntil);
error BadQuoteSigner(address recovered);
error QuoteMismatch();     // strategyHash, tokenIn or tokenOut differ from the swap
error QuoteTooLarge(uint256 amountIn, uint256 maxAmountIn);
error QuoteTooLong(uint64 validUntil);        // validUntil > now + MAX_QUOTE_TTL (300 s)
error MissingQuote(uint256 length);           // takerData is not abi.encode(Quote, bytes)
error ExactOutNotSupported();
```

### CastleJITHook.sol: the v4 pool filled from the Castle

A v4 hook whose pool holds no liquidity. Every exact-in swap is filled in `beforeSwap` from the Castle's `hen` strategy, with the hook acting as a SwapVM taker.

- Flags: `BEFORE_SWAP`, `BEFORE_SWAP_RETURNS_DELTA` and `BEFORE_ADD_LIQUIDITY`. The last one reverts, so the only liquidity is the Castle's. The salt is mined against the CREATE2 deployer above.
- The pool is `{currency0: USDC, currency1: WETH, fee: 0, tickSpacing: 60, hooks: CastleJITHook}`. The fee is charged by `hen`'s SwapVM `flatFee`, not by the pool.
- The `beforeSwap(sender, key, params, hookData)` flow, exact-in only:
  1. Set `amountIn = -params.amountSpecified`. Exact-out reverts `ExactOutNotSupported()`.
  2. Call `poolManager.take(currencyIn, address(this), amountIn)`.
  3. Read `hash = vault.strategyIn(HEN_SLOT)` and `order = vault.orderOf(hash)`. A re-shipped `hen` moves the hook automatically.
  4. Call `router.swap(order, tokenIn, tokenOut, amountIn, takerTraits{exactIn, useTransferFromAndAquaPush})`. The router pulls `tokenOut` from the Castle through Aqua to the hook, then pushes `tokenIn` back to the Castle through Aqua. The hook approves the router once, in its constructor.
  5. Call `poolManager.sync(currencyOut)`, transfer `amountOut` to the PoolManager, then `poolManager.settle()`.
  6. Return `toBeforeSwapDelta(int128(amountIn), -int128(amountOut))`.
- `hookData` may carry `abi.encode(uint256 minAmountOut)`. If it does, the hook reverts `TooLittleOut` below it.
- Constructor: `(IPoolManager pm, ISwapVM router, CastleVault vault, uint8 henSlot)`.

### OffchainQuoteResolver.sol: quote.feefifofum.eth

An ERC-3668 plus ENSIP-10 extended resolver, in the ENS offchain-resolver reference format.

```solidity
constructor(string[] memory urls, address owner, address[] memory signers);   // urls[0] below; signers = [fi]
function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
//   always reverts OffchainLookup(address(this), urls, callData, this.resolveWithProof.selector, callData)
//   where callData = abi.encodeCall(IExtendedResolver.resolve, (name, data)); extraData IS callData, as in ENS's reference
function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns (bytes memory);
//   response = abi.encode(bytes result, uint64 expires, bytes sig)
//   sig = fi over keccak256(abi.encodePacked(hex"1900", address(this), expires, keccak256(request), keccak256(result)))
//   request = extraData = callData: the exact bytes the gateway received as {data}
//   reverts SignatureExpired() or InvalidSigner(address)
function setSigners(address[] calldata, bool) external;   // owner
function supportsInterface(bytes4) external view returns (bool);   // IExtendedResolver 0x9061b923, ERC-165
```

The gateway URL is `https://handoff.lol/t/castle/ccip/{sender}/{data}.json`.

## The two strategies

Both are shipped by fi from the same Castle balance. Together they promise more than the Castle holds, up to fum's leverage.

| Slot | Name | SwapVM program | Filled by | Priced by |
|---|---|---|---|---|
| 0 | `harp` | `Extruction(PriceExtruction)` | outside solvers (Jacks), found through CCIP-Read | fee's price, signed per quote by fi; gasless to re-price |
| 1 | `hen` | `XYCSwap` plus `flatFee(feeBps)` | CastleJITHook, from any v4 swap | the curve's own balances; fee re-centres it with dock plus ship when drift exceeds `driftBps` |
| 2 | `greedy` | any | nobody | exists only to show `OverAllocated` in beat 1 |

## The quote

A solver asks for a quote as an ENS text record on `quote.feefifofum.eth`:

```
key   = "quote:<tokenIn>:<tokenOut>:<amountIn>"      e.g. "quote:USDC:WETH:1000000"
tokens: USDC | WETH;  amountIn: raw base units
```

The record's value is one JSON line. It is the `result` the gateway signs, ABI-encoded as `string`.

```json
{ "v": 1, "id": "q-17", "chainId": 11155111, "router": "0xeDB6…70f9",
  "order": { "maker": "0x<vault>", "traits": "0x…", "data": "0x…" },
  "strategyHash": "0x…", "tokenIn": "0x1c7D…7238", "tokenOut": "0xfFf9…6B14",
  "amountIn": "1000000", "amountOut": "372000000000000", "priceQ96": "…", "maxAmountIn": "…",
  "validUntil": 1790440030, "signer": "0xB6eA…40b2", "quoteSig": "0x…",
  "takerTraitsAndData": "0x…" }
```

- `quoteSig` is fi's EIP-712 signature over the `Quote` struct. PriceExtruction checks it on-chain at fill time.
- `takerTraitsAndData` is ready to use. It is exact-in, with the threshold set to `amountOut`, the flag `useTransferFromAndAquaPush`, and takerData set to `abi.encode(Quote, quoteSig)`. The recipient defaults to `msg.sender`.
- A solver fills it with `router.swap(order, tokenIn, tokenOut, amountIn, takerTraitsAndData)` after approving the router for `tokenIn`.
- `validUntil` and the gateway `expires` are both now + 30 s.
- The solver client is viem with `ccipRead` on and `universalResolverAddress` set to UniversalResolverV2: `getEnsText({ name: 'quote.feefifofum.eth', key })`.

## The castle service

Owner: agent-smith. It runs at `https://handoff.lol/t/castle/`. It is a systemd unit on helen, and handoff-claude verified CORS and routing on it.

| Route | What it does |
|---|---|
| `GET /ccip/{sender}/{data}.json`, `POST /ccip` | The ERC-3668 gateway. It decodes `resolve(name, text(node, key))`, parses the key, asks fee for the price and fi for both signatures, and returns `{ "data": abi.encode(result, expires, sig) }`. Unknown keys get `404 { message }`. The key `castle` returns the vault address. |
| `GET /stream`, `GET /state`, `GET /health` | The event stream, in [STREAM.md](../miniapp/STREAM.md) v2 (impecc owns the schema). |
| MCP `castle_status` | Hoard, price, live strategies, agents alive. |
| MCP `castle_quote {tokenIn, tokenOut, amountIn}` | The same JSON as the ENS record, for agents that skip ENS. |
| MCP `castle_fill {quoteId}` | An unsigned tx `{to, data}` for `router.swap`. It never sends anything. |
| MCP `castle_allocations` | Per strategy: allocation, cap, fills. Per token: committed, headroom, leverage. |
| MCP `castle_route {order}` | fo's route for a UniswapX-format order (`harp` or `v4`), with calldata. |

STREAM.md follows this file for contract names and errors. In particular, `allocation.refused.error` is `OverAllocated(address token, uint256 committedAfter, uint256 limit)` under the leverage rule above.

## The crew

These are handoff agents built by agent-smith in `agents/`. Each sends `agent_heartbeat`.

| Agent | Duty in the MVP |
|---|---|
| **fee** | Reads Chainlink ETH/USD every block, then sets `mid` and `spreadBps`, widening with realized volatility. It publishes `price` events, gives the gateway the price for each quote, and asks fi to re-centre `hen` when `mid` drifts past `driftBps` (default 50) from `hen`'s curve. |
| **fi** | Compiles the SwapVM programs (`harp`, `hen`), ships and docks through the vault, and signs every Quote (EIP-712) and every gateway response (SignatureVerifier). Its key lives only on the service host. |
| **fo** | Takes UniswapX-format orders (`castle_route`), compares the `harp` quote with the v4 route, and returns the better one. It emits `intent.routed`. |
| **fum** | Sets leverage and per-slot caps. It watches `committed` against the balance after every fill, and docks the lowest-priority strategy if the Castle can no longer cover its biggest single promise. It emits `cap.set` and `strategy.docked`. |
| **Jack** (agy) | The outside solver. It resolves the quote through ENS, fills it, and swaps on the v4 pool. It writes no code. |

## Demo (under 4 minutes, all Sepolia)

1. **The hoard.** The Castle holds X USDC and Y WETH. fum sets leverage to 2×.
2. **One balance, two strategies.** fi ships `harp` and `hen`, each promising the full hoard: the promises total 2× the balance. fi ships `greedy`, and it reverts `OverAllocated` (the reverted tx is on Etherscan).
3. **The harp sings.** agy asks `quote.feefifofum.eth` for `quote:USDC:WETH:<n>`. The resolver reverts `OffchainLookup`, the gateway answers with a quote signed by fi, and the resolver checks it. agy fills it through the router. The Castle's balances move, and `harp`'s allocation shrinks. On a fork, the same quote 31 s later reverts `QuoteExpired`.
4. **The hen lays.** agy swaps USDC for WETH on the v4 pool through PoolSwapTest. The hook fills it from `hen` in the same tx, with no LP deposit in the pool.
5. **The miniapp** tells all of it live, in the Castle Tapestry style.

## Live run, gas and approval

The rule: everything is fork-tested first (v-e2e, two clean passes), then there is exactly one live deploy (c-deploy) and one live run (a-live). No live tx goes out without SirKit's approval, and SirKit gets the operator's gas number first.

| Step | Txs | Gas (fork-measured unless marked) |
|---|---|---|
| Deploy CastleVault, PriceExtruction | 2 | 2.86 M + 0.90 M |
| Deploy OffchainQuoteResolver | 1 | 1.0 M (estimate) |
| Deploy CastleJITHook (CREATE2), initialize the pool | 2 | 1.66 M + 0.08 M |
| Register `quote` with the resolver | 1 | 0.2 M (estimate) |
| Fund the hoard (USDC transfer, wrap, WETH transfer) | 3 | 0.15 M (estimate) |
| setLeverage ×2, setCap ×3 | 5 | 0.40 M |
| Ship `harp` and `hen`; ship `greedy` (reverts, manual gas limit) | 3 | 0.61 M |
| Jack: approve and fill a `harp` quote | 2 | 0.27 M |
| Jack: approve and swap on the v4 pool (PoolSwapTest) | 2 | 0.43 M |
| **Total** | **21** | **≈ 8.5 M gas: 0.0085 ETH at 1 gwei, 0.02 ETH at 2.35 gwei** |

Measured per tx on a Sepolia fork (execution plus 21k and calldata): c-vault 98b48b8, c-hook c348dda. mister-anderson replaces the three estimates before c-deploy. The approval asked of the operator is a **0.02 ETH gas ceiling** for c-deploy plus a-live. The hoard is small: about 10 USDC and 0.004 WETH.

## Research gates

korg answered these on a fork of live Sepolia ([research.md](research.md), probe `contracts/probes/quote-register/`).

| Gate | Answer | What the build does |
|---|---|---|
| Can 0x67Cc register `quote` with a custom resolver in one call? | **Yes.** 0x67Cc holds root `ROLE_REGISTRAR` on `0x2F21…e09`. | One call: `register("quote", 0x67Cc…0C99, address(0), OffchainQuoteResolver, 0, now + 365 days)`. |
| Does UniversalResolverV2 surface `OffchainLookup` for `text()`? | **Yes**, but only when the resolver advertises `IExtendedResolver` (`0x9061b923`). Without it, the UR returns `ResolverError`. | The resolver must answer `supportsInterface(0x9061b923) == true`. The solver uses viem `getEnsText` with the UR override. The gateway's `{sender}`, and the signature's target, is the OffchainQuoteResolver. |
| Is UniswapX on Sepolia? | **No.** No reactor is published for Sepolia, and the published addresses have no code there. | fo takes UniswapX-format orders off-chain through `castle_route`. Filling live UniswapX orders is stretch S3, on a chain that has reactors. |

## Schedule and cut lines (UTC, Sat 26 Sep)

| Time | Milestone |
|---|---|
| 12:45 | SPEC locked; agy's v-spec by 13:00 |
| 15:00 | h-platform (handoff-claude) |
| 16:00 | c-vault and PriceExtruction green on a fork |
| 17:00 | c-ccip green on a fork. **Cut line:** if the hook isn't green on a fork, SirKit decides what beat 3 becomes. |
| 18:00 | c-hook; a-crew |
| 18:30 | a-gateway live on the tunnel |
| 20:00 | v-e2e: two clean fork passes (agy) |
| 21:00 | c-deploy (after the gas approval) |
| 21:30 | m-miniapp published |
| 22:00 | a-live, the one live run. `castle-sync` is pinned to a tag, so a push to main can't restart the gateway during judging. |
| 22:30 | v-live (agy) |
| 23:00 | deck, video script, write-ups |
| 23:30 | AI_USAGE.md and WORKLOG.md |
| 00:00 | submit |

## Stretch

Each item needs research proof first, and none of them blocks the MVP.

- **S1 Multichain.** Aqua on Unichain or Base, with one Castle balance quoted on two chains, and ERC-7828 names (`quote.feefifofum.eth@base`).
- **S2 Unichain Flashblocks** for sub-second re-quoting.
- **S3 UniswapX.** fo fills live UniswapX orders as a filler.
- **S4 A v4 dynamic fee** set by fee (`hookFeeBps`).
- **S5 Idle yield.** The hoard sits in Aave or sUSDe while it is promised.
- **S6 Wildcard names** (`1000000.usdc-weth.quote.feefifofum.eth`) and `castle.feefifofum.eth` pointing at the vault.
