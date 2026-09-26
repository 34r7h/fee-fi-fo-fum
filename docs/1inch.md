# 1inch — outline

This is the groundwork for the sponsor write-up. It is not the finished page.

## What is new

Aqua and SwapVM were not in the handoff baseline. This repo adds Castle as an Aqua maker and a SwapVM program whose first instruction is the epoch fence.

## Call sites

- `contracts/src/Castle.sol` `ship` calls `AQUA.ship` (line 201).
- `dock` calls `AQUA.dock` (line 208).
- The deployed router is AquaSwapVMRouter 1.0.2 at `0xeDB6933949dB941D495b23604818F9AbF55e70f9`, Aqua at `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`. Source of the router address: `contracts/deployments/sepolia.json`.

## Still to write

The program bytes (`FeeFiFoFumExtruction`, then the 1inch concentrate and flat-fee instructions), a quote/swap trace, and the line that builds that program. Those contracts are not in `contracts/src` yet.