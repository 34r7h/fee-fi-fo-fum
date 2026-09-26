# Research gate

Measured 2026-09-26 by korg for task `53d4d720-1f61-4476-ac5e-84b3259826e1`. No live transactions. SirKit dropped question (1) the same morning. Line 45 of [docs/PLAN.md](https://github.com/34r7h/fee-fi-fo-fum/blob/lease-edition/docs/PLAN.md) ("Don't pair Aqua with a v4 hook") is a novelty opinion in that plan, not a prize rule and not a technical limit found in the prize pages below. The file is no longer on `main`. It is at tag `lease-edition`.

Reproduction of (a) and (b) is `contracts/probes/quote-register/`. From that directory:

```
forge test --match-test test_registerQuoteAndFollowOffchainLookup -vv
```

The run recorded below used `https://ethereum-sepolia-rpc.publicnode.com`. The committed probe passed at fork block 11785866. An earlier run of the same calls at block 11785857 produced the same token id, resolver address, and `OffchainLookup` sender.

## (a) `quote` in one `register()` call

Yes. `0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99` holds root `ROLE_REGISTRAR` on subregistry `0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`, and one `register` call stored both the owner and a newly deployed resolver.

Signature, from `contracts/src/interfaces/IENSv2.sol`, which matches the call that succeeded on the fork:

```solidity
function register(
    string calldata label,
    address owner,
    address registry,
    address resolver,
    uint256 roleBitmap,
    uint64 expiry
) external returns (uint256 tokenId);
```

Role: `ROLE_REGISTRAR` is `1 << 0`. Live `eth_call` and the fork both returned `hasRootRoles(1, 0x67Cc…0C99) == true`. The bitmap passed for the new name was `0`. The caller's root role is what authorized the register; the new name did not need its own registrar bit.

Fork, block 11785866, `vm.prank` of `0x67Cc…0C99`:

| Check | Result |
|---|---|
| `getOwner(keccak256("quote"))` before | `0x0000…0000` |
| `register("quote", 0x67Cc…0C99, address(0), resolver, 0, block.timestamp + 365 days)` | token id `16076246017904453531093369257206757643205809390628667946437262027001803309056` |
| `getOwner` after | `0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99` |
| `getResolver("quote")` | the resolver deployed in the same test, `0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f` |

`registry = address(0)` means no child registry. A second way to point the name at a resolver was not required.

## (b) UniversalResolverV2 and `text()`

Yes, when the resolver advertises ENSIP-10. `UniversalResolverV2` `0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3` `resolve(bytes name, bytes data)` with `data = text(bytes32,string)` (`0x59d1d43c`, key `"description"`) reverted `OffchainLookup` (`0x556f1830`). The `sender` in that revert was the universal resolver itself, `0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3`. That revert is what a CCIP-Read client, including viem, reads. viem was not executed in this run; the revert was.

The resolver in that run implemented `supportsInterface` for ERC-165 (`0x01ffc9a7`) and `IExtendedResolver` (`0x9061b923`), and `resolve(bytes,bytes)` reverted `OffchainLookup`.

A resolver that only implements `resolve(bytes,bytes)` and does not advertise `IExtendedResolver` does not get that call. The same fork, one run earlier (block 11785850), returned `ResolverError(bytes)` (`0x95c0c752`) with an empty payload instead of `OffchainLookup`. `cast 4byte 0x95c0c752` is `ResolverError(bytes)`.

## (c) UniswapX on Sepolia

No reactor is listed for Sepolia, and the reactors that are listed for other chains have no code on Sepolia.

The deployment page opened this turn, <https://developers.uniswap.org/docs/liquidity/uniswapx/deployments>, has tables for Ethereum mainnet, Arbitrum, Unichain, and Base. It has no Sepolia section.

`eth_getCode` at Sepolia block 11785837, `https://ethereum-sepolia-rpc.publicnode.com`, codesize 0 for every published reactor address checked:

| Address | Where it is published |
|---|---|
| `0x00000011f84b9aa48e5f8aa8b9897600006289be` | mainnet V2 Dutch Order Reactor |
| `0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4` | mainnet Exclusive Dutch Order Reactor |
| `0x0000000015757c461808EA25Eb309638B62681cf` | UniswapX README, mainnet V3 Dutch Order Reactor |
| `0xB274d5F4b833b61B340b654d600A864fB604a87c` | Arbitrum DutchV3 |
| `0x000000005aF66799D1a6317714D66800f9CA1406` | Unichain DutchV3 |
| `0x000000001Ec5656dcdB24D90DFa42742738De729` | Base Priority |
| `0x000000008a8330B5d1F43A62Bf4C673A49f27ba0` | Base DutchV3 |

No code means those addresses have no order flow. A reactor deployed at some other address was not searched.

## (d) Prize rules

Opened 2026-09-26. These are the Continuity prizes. Amounts in [docs/PLAN.md](https://github.com/34r7h/fee-fi-fo-fum/blob/lease-edition/docs/PLAN.md) (checked 2026-09-26 03:30 UTC, now only on tag `lease-edition`) match these three Continuity purses.

### 1inch, Continuity

<https://ethglobal.com/events/tokyo2026/prizes/1inch>

"Build an Aqua App - Continuity Track" is $2,000. 1st $1,500. 2nd $500. "This prize is only available to Continuity Track participants."

> Create a custom Aqua app that implements a sophisticated DeFi position. If you use SwapVM, you may modify SwapVM opcodes and define your own instructions. The final positions must be demonstrated through tests scripts or a UI.
>
> Projects that utilize SwapVM will be scored higher during the final judging.

Qualification requirements, quoted:

- Official Aqua/SwapVM contracts must be used (redeployments of a modified SwapVM contract is allowed)
- Onchain execution of token transfers should be presented during the final demo (local forks are ok)
- Proper Git commit history (no single-commit entries on the final day)

### Uniswap Foundation, Continuity

<https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation>

"Best Uniswap Stack Contribution" for Continuity is $4,000. 1st $2,000. 2nd $1,000. 3rd $1,000. Continuity only.

> Build on or integrate any part of the Uniswap stack, including the Uniswap API, the Uniswap AMM (v2, v3, or v4), CCA, or any other Uniswap protocol. This also includes new v4 hooks, extensions or improvements to official Uniswap repositories, and tooling or solutions built for the broader ecosystem.

Qualification requirements, quoted:

> A public GitHub repository with open-source code, a FEEDBACK.md file, and a completed submission to the Uniswap Developer Feedback Form (https://developers.uniswap.org/hackathon-feedback) that includes the link to your FEEDBACK.md file.

> Submissions without it will be reviewed and audited before winners are finalized. Make sure your README clearly points to the relevant contracts and lines of code so we can verify your integration.

### ENS, Continuity

<https://ethglobal.com/events/tokyo2026/prizes/ens>

"Best Integration of ENSv2 into an Existing Project" is $4,000. 1st $2,000. 2nd $1,000. 3rd $1,000. Continuity only.

> ENSv2 is only live on Sepolia for now, so this track is about getting a head start: explore how ENSv2's feature set — the new registry hierarchy, Enhanced Access Control, Permissioned Resolvers, record and namespace aliasing — can plug into an existing protocol or project to improve the user experience or unlock entirely new use cases. Take a project you already know, yours or an open one, and integrate it against ENSv2 on its testnet deployment. This track pairs well with AI agent identity too — consider giving agents their own namespace and delegated permissions within your integration.

Qualification requirements, quoted:

> Integration must use ENSv2 on Sepolia and target an existing project's testnet deployment. It should be clear how ENSv2 improves the project, not just a cosmetic add-on. Your demo must be functional and not just include hard-coded values. Upon submission, your project showcase must have a link to a live demo and the code needs to be open source and accessible on Github or a similar platform.

## Sepolia Uniswap v4 addresses

Source: <https://developers.uniswap.org/docs/protocols/v4/deployments>, section "Sepolia: 11155111", fetched 2026-09-26. Codesize is `cast codesize` at block 11785837 on `https://ethereum-sepolia-rpc.publicnode.com`.

| Contract | Address | Codesize |
|---|---|---|
| PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` | 24009 |
| PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` | 23877 |
| Quoter | `0x61b3f2011a92d183c7dbadbda940a7555ccf9227` | 5820 |
| StateView | `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c` | 3531 |
| Universal Router (unlabeled current row) | `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` | 19540 |
| PoolSwapTest | `0x9b6b46e2c869aa39918db7f52f5557fe577b6eee` | 6950 |
| Universal Router 2.1.2 (same page, not the current row) | `0x7E4f6c5e954Da5c61B3423D81E2277431Ac043f3` | 24380 |

Disagreement: `https://developers.uniswap.org/deployments.json` says `generatedAt` `2026-07-15T22:25:40.000Z` and lists Sepolia `UniversalRouter` as `0x470FFC67b1feEEC31D16C46AC7545C98716a194c` (codesize 21738 at the same block). The deployments page fetched today lists `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` as the unlabeled Universal Router. Both addresses have code. The page is the newer source.

## Stretch, already measured, not pursued

SirKit said to skip Unichain Sepolia and Base Sepolia. Codesize only, same hour, no bridge quote and no ETH cost:

| Chain | RPC | Aqua `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` | SwapVM `0x8fdd04dbf6111437b44bbca99c28882434e0958f` |
|---|---|---|---|
| Ethereum Sepolia | `ethereum-sepolia-rpc.publicnode.com` | 5619 | 22640 |
| Base Sepolia | `base-sepolia-rpc.publicnode.com` | 0 | 0 |
| Unichain Sepolia | `unichain-sepolia-rpc.publicnode.com` | 0 | 0 |

The SwapVM README lists a unified address and does not list Sepolia among its networks. The Sepolia codesize at that address is 22640 anyway. [docs/PLAN.md](https://github.com/34r7h/fee-fi-fo-fum/blob/lease-edition/docs/PLAN.md) on tag `lease-edition` said the Sepolia vanity router was empty. Those two sources disagree with this codesize; the codesize is the measurement.
