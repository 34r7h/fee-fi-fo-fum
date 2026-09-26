# Uniswap — outline

This is the groundwork for the sponsor write-up. It is not the finished page.

## What is new

Uniswap CCA is the exit when a shift ends or nobody claims the castle. JackHook is the validation hook: a bid is allowed only when the bidder holds a non-expired ENSv2 name. The registry reads are in `docs/ens-probes.md`.

## What is already on Sepolia

The CCA factory recorded in `contracts/deployments/sepolia.json` is `0x000000001F26a0044BaA66024e7b6599c61963F8`. No auction from this project is deployed there yet, and `JackHook.sol` is not in `contracts/src`.

## Still to write

The auction parameters, the hook's call into `getOwner` and `getExpiry`, where `clearingPrice` is written back to ENS, and the developer-experience notes that belong in `FEEDBACK.md`.