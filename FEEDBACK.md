# Uniswap feedback

Draft for the developers.uniswap.org/hackathon-feedback form. The operator submits the form if it needs a human account. This is what the contracts in this repo actually ran into. It is not a review of Uniswap v4: this build does not deploy a v4 pool or a v4 hook.

## CCA

The auction is created from `Castle._openAuction` against factory `0x000000001F26a0044BaA66024e7b6599c61963F8`. The parameters that matter are all in `Castle.sol`: 25 blocks (`AUCTION_BLOCKS`), floor at 80% of the anchor (`FLOOR_PCT`), tick spacing of 1% of that floor (`TICKS_PER_FLOOR`), and a graduation threshold of 50% of the lot valued at the floor (`GRADUATION_PCT`).

The factory does take a graduation amount: `AuctionParameters.requiredCurrencyRaised`. Castle sets it at [line 543 of the deployed source](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L543) to 50% of the lot valued at the floor. Nothing in the factory docs or the parameter itself says what that number should be. A naive value, low enough that one small bid clears it, lets that bid clear at the floor and cut the anchor by 20%. The comment on `GRADUATION_PCT` is the only guidance, and it lives in our contract, not in the CCA. `JackHook.validate` receives the bidder as `owner` and the name label as `hookData`. It can only read the registry. It cannot tell the factory to reject a self-bid by the holder or the auctioneer.

## Verification

Castle `0x6bF53228d8c5c3b0192B2028bD52fc4E9d1be8Ec` and JackHook `0x50919ddaaf8294865652D53b45f210019AB2fcAd` are Sourcify `exact_match` at `7b863212f649c07327ac53966e8fae40f813cfb7`. Etherscan verification is still waiting on an operator API key (`contracts/deployments/sepolia.json`).

## Form answers

- What did you build? A CCA used as the exit from an ENSv2-leased market-making position. JackHook gates bids to holders of a non-expired name.
- What worked? Creating the auction from a factory with a validation hook, and verifying the same source on Sourcify.
- What got in the way? `requiredCurrencyRaised` exists, and Castle sets it, but nothing guides the value. A naive setting lets one tiny bid clear at the floor. Etherscan verification needed an API key we did not have during the build.
- v4: not used.
