# ENS

Solvers find a firm quote by resolving `quote.feefifofum.eth` through UniversalResolverV2. The name's resolver reverts `OffchainLookup`. The gateway returns a quote signed by fi. The resolver checks that signature and returns the text record.

Scope: [SPEC.md](SPEC.md) at `d70dafa`. The fork measurement is [research.md](research.md) and [contracts/probes/quote-register](../contracts/probes/quote-register).

## The name

`quote` is a label on the feefifofum subregistry [`0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`](https://sepolia.etherscan.io/address/0x2F2164507471a1a46506f902aBfdfB9d22e4bE09).

`0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99` holds root `ROLE_REGISTRAR` (`1 << 0`) on that registry. One call is enough:

```solidity
register("quote", owner, address(0), resolver, 0, expiry)
```

On a fork of Sepolia at block 11785866 that call set `getOwner` to the registrar and `getResolver("quote")` to the resolver deployed in the same transaction. The label was unowned before the call. No live register has been sent. The live name, the resolver address, and the register transaction are filled in after the deploy.

## OffchainLookup

UniversalResolverV2 is [`0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3`](https://sepolia.etherscan.io/address/0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3).

A `text()` lookup through `resolve(bytes,bytes)` reverts `OffchainLookup` (`0x556f1830`) with `sender` equal to the universal resolver, when the name's resolver advertises `IExtendedResolver` (`supportsInterface(0x9061b923) == true`). The same lookup without that interface returns `ResolverError(bytes)` (`0x95c0c752`) and an empty payload. OffchainQuoteResolver has to implement that interface. The solver uses viem `getEnsText` with `universalResolverAddress` set to this contract. viem itself was not run in the research probe. The revert the client reads was.

The gateway URL in the spec is `https://handoff.lol/t/castle/ccip/{sender}/{data}.json`. The record key is `quote:<tokenIn>:<tokenOut>:<amountIn>`. The signed result is one JSON line, ABI-encoded as a string. The gateway and the resolver source are not deployed yet, so this document does not link a live quote.

## What is retired

The lease edition's `castle.feefifofum.eth` lease, heartbeat, and `linkToNode` fence are not how this name works. That product is at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition).
