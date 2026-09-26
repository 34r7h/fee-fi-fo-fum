# Castle auctions on Uniswap CCA

Castle sells WETH for USDC through Uniswap's Continuous Clearing Auction (CCA) v2.1.0. It uses the factory `0x000000001F26a0044BaA66024e7b6599c61963F8` on Sepolia. There are two ways in:

- **`openAuction(amount)`**: the live holder or the auctioneer (fum) sells WETH that no active strategy has claimed. The amount must be at most `freeBalance(WETH)`, so a live fill never meets an over-committed balance.
- **`dissolve()`**: anyone may call it once `expiry + dissolveGrace` has passed with nobody holding the castle. It docks every active strategy and auctions all of Castle's WETH.

`settleAuction()` is open to anyone once the auction reaches its end block. Castle then sweeps the raised USDC and the unsold WETH back to itself. If the auction graduated, it also writes the clearing price to ENS as the next shift's anchor (`handoff-price` on `castle.feefifofum.eth`).

## Parameters

All the parameters are set by Castle (`_openAuction`). None come from the caller.

| Field | Value |
| --- | --- |
| token / currency | WETH / USDC |
| tokensRecipient, fundsRecipient | Castle |
| startBlock | `block.number` of the opening tx |
| endBlock = claimBlock | start + 25 (`AUCTION_BLOCKS`) |
| auctionStepsData | one step, `abi.encodePacked(uint24 400_000, uint40 25)`: 400,000 mps × 25 blocks = 1e7, so an equal share of the lot is released in each block |
| tickSpacing | anchor × 80 / 100 / 100: 1% of the floor |
| floorPrice | tickSpacing × 100: 80% of the anchor, and a multiple of tickSpacing as the CCA requires |
| requiredCurrencyRaised | mulDiv(amount, floor, 2^96) × 50 / 100: half of the lot's value at the floor |
| validationHook | JackHook `0x50919ddaaf8294865652D53b45f210019AB2fcAd` |

**Prices are Q96, in raw USDC per raw WETH times 2^96.** This is the same unit as the anchor. For example, a Q96 floor of 170356870810259155100 is 170356870810259155100 × 10^12 / 2^96 = 2150.21 USDC per WETH.

**Why there is a graduation threshold.** Without one, a single dust bid at the floor would "clear" and write a price of the bidder's choosing into the anchor. `settleAuction` writes the price only when `isGraduated()` is true, `currencyRaised` is non-zero and the clearing price is non-zero. If the auction does not graduate, every bid is refunded, all the WETH returns to Castle and the anchor stays as it was.

## Bidding

A bidder needs:

1. **A live name in the agent registry.** JackHook calls `REGISTRY.getOwner(keccak256(hookData))` and requires the result to equal the bid's `owner`. `hookData` is the raw label, for example `0x616779` for `agy`. A failed check reverts with `Unnamed`, `NameExpired` or `NotNameOwner`, and the CCA wraps that error in `ValidationHookCallFailed(bytes)`.
2. **Permit2 approvals.** The CCA pulls the currency through Permit2 (`0x000000000022D473030F116dDEE9F6B43aC78BA3`):
   - `USDC.approve(Permit2, amount)`;
   - `Permit2.approve(USDC, auction, uint160 amount, uint48 expiration)`.
3. **The bid itself:** `submitBid(uint256 maxPriceQ96, uint128 amount, address owner, bytes hookData)`. The price must be on the tick grid and strictly above the current clearing price. Every filled bid pays the same clearing price, not its own `maxPrice`.

A bid only buys supply released from its own block onward. A late bid meets less supply, so it pushes the clearing price up. When there is a single bidder, the earlier they bid, the closer the clearing price stays to the floor.

After `claimBlock`:

- winning bidders call `claimTokens(bidId)`;
- losing or partly filled bids are refunded through `exitBid` or `exitPartiallyFilledBid`.

## Checkpoints

Castle never calls `checkpoint()` itself. The CCA's `checkpoint()` is public, so fum (or anyone) can call it during the auction to advance the clearing price. At settlement, `sweepCurrency()` and `sweepUnsoldTokens()` both carry the CCA's `ensureEndBlockIsCheckpointed` modifier, so `settleAuction` always reads the final checkpoint.

## Static analysis (deployed commit 7b86321)

- **slither `reentrancy-no-eth` in `_openAuction` and `dissolve`:** the external calls go to the CCA factory, which is immutable and trusted, and to Aqua's `dock`. The auction address is stored before the WETH transfer and before `onTokensReceived`.
- **slither `divide-before-multiply` in the floor:** this is intended. The floor is rounded down to a whole tick, so it is an exact multiple of `tickSpacing`.
- **aderyn H-1 (`delegatecall` to an arbitrary address):** `multicall` delegatecalls only into `address(this)`, and only for six allowlisted selectors: `claim`, `renew`, `relink`, `ship`, `dock` and `openAuction`. Anything else reverts with `SelectorNotAllowed`.
- **aderyn H-2 (state change after an external call):**
  - The constructor instance is a read of `router.AQUA()` during construction, before any code is callable.
  - In `settleAuction`, the only call before `auction = address(0)` is the view `endBlock()` on Castle's own auction. The auction is cleared before the sweeps.
- **aderyn H-3 (unsafe cast):** `uint16(end)` casts the program's end offset. Every segment has a fixed size, so the offset is always 242.

None of these are true positives.
