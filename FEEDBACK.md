# Uniswap developer feedback

ETHGlobal Tokyo 2026, Continuity. The form is <https://developers.uniswap.org/hackathon-feedback>. This file is what we actually ran into while choosing Sepolia addresses and reading the deployment docs on 2026-09-26. The hook is not deployed yet, so this is not a report of a failed swap.

## Two Universal Router addresses for one Sepolia row

The deployments page, section "Sepolia: 11155111", lists an unlabeled Universal Router at `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` (codesize 19540 at block 11785837).

`deployments.json` on the same site says `generatedAt` `2026-07-15T22:25:40.000Z` and lists Sepolia UniversalRouter as `0x470FFC67b1feEEC31D16C46AC7545C98716a194c` (codesize 21738 at the same block).

Both addresses have code. The page and the JSON feed disagree, and the page does not say which row is wired to the PoolManager in the same table (`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`). We took the unlabeled row on the page because the task said to use the docs page. We did not send a swap through either router.

## UniswapX is not on the chain ENSv2 is on

ENSv2 for this hackathon is Sepolia. The UniswapX deployment page lists Ethereum mainnet, Arbitrum, Unichain, and Base. It has no Sepolia section.

These published reactors all returned codesize 0 on Sepolia at block 11785837:

- `0x00000011f84b9aa48e5f8aa8b9897600006289be`
- `0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4`
- `0x0000000015757c461808EA25Eb309638B62681cf`
- `0xB274d5F4b833b61B340b654d600A864fB604a87c`
- `0x000000005aF66799D1a6317714D66800f9CA1406`
- `0x000000001Ec5656dcdB24D90DFa42742738De729`
- `0x000000008a8330B5d1F43A62Bf4C673A49f27ba0`

A Sepolia entry cannot fill a live UniswapX order against those addresses. We are taking UniswapX-format orders off-chain and filling them against Aqua instead.

## What did match

PoolManager, PositionManager, Quoter, StateView, and PoolSwapTest on the Sepolia section of the v4 deployments page all had code at block 11785837. PoolSwapTest is the path the spec uses for the no-LP hook demo, and it is listed. That part of the page was usable without guessing.

Measurements and the command behind the codesizes: [docs/research.md](docs/research.md).
