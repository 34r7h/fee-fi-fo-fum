# Uniswap feedback

Draft for the developers.uniswap.org/hackathon-feedback form. The operator submits the form if it needs a human account. This is what the contracts in this repo actually ran into. It is not a review of Uniswap v4: this build does not deploy a v4 pool or a v4 hook.

## CCA

The auction is created from `Castle._openAuction` against factory `0x000000001F26a0044BaA66024e7b6599c61963F8`. The parameters that matter are all in `Castle.sol`: 25 blocks (`AUCTION_BLOCKS`), floor at 80% of the anchor (`FLOOR_PCT`), tick spacing of 1% of that floor (`TICKS_PER_FLOOR`), and a graduation threshold of 50% of the lot valued at the floor (`GRADUATION_PCT`).

A bid that does not meet graduation refunds everyone and leaves the anchor where it was. The comment on `GRADUATION_PCT` says why that exists: a 1-USDC bid one tick above the floor would otherwise clear at the floor and cut the anchor by 20% per round. The factory does not offer that threshold. We had to put it in the caller. The validation hook (`JackHook.validate`) receives the bidder as `owner` and the name label as `hookData`, and it can only read the registry. It cannot tell the factory to reject a self-bid by the holder or the auctioneer.

## Verification

Castle `0x6bF53228d8c5c3b0192B2028bD52fc4E9d1be8Ec` and JackHook `0x50919ddaaf8294865652D53b45f210019AB2fcAd` are Sourcify `exact_match` at `7b863212f649c07327ac53966e8fae40f813cfb7`. Etherscan verification is still waiting on an operator API key (`contracts/deployments/sepolia.json`).

## Form answers

- What did you build? A CCA used as the exit from an ENSv2-leased market-making position. JackHook gates bids to holders of a non-expired name.
- What worked? Creating the auction from a factory with a validation hook, and verifying the same source on Sourcify.
- What got in the way? The factory will clear at the floor on a tiny bid unless the caller adds its own graduation check. Etherscan verification needed an API key we did not have during the build.
- v4: not used.
