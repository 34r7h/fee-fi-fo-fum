# ENS

Solvers find a firm quote by name. `quote.feefifofum.eth` is an ENSv2 name on Sepolia, and its resolver answers every record through CCIP-Read (ERC-3668):
1. The resolver reverts `OffchainLookup`.
2. The castle gateway answers with a record that fi signed.
3. The resolver checks fi's signature before it returns the text.

Resolving the name costs no gas, and the quote it returns fills harp on the 1inch side ([1inch.md](1inch.md)).

Scope: [SPEC.md](SPEC.md) at `43e57ac`. The fork measurement taken before the deploy is in [research.md](research.md) and [contracts/probes/quote-register](../contracts/probes/quote-register).

## Deployed

Everything is on Ethereum Sepolia, built from source at [`fff518c`](https://github.com/34r7h/fee-fi-fo-fum/tree/fff518c55bfe60c752c0cd9acffbfc285f817f1c). The resolver is recorded in [contracts/deployments/sepolia.json](../contracts/deployments/sepolia.json).

| What | Address | Tx |
|---|---|---|
| OffchainQuoteResolver ([Sourcify exact_match](https://repo.sourcify.dev/11155111/0x2D18c04Aec64f93255a417d56Cfdc5577712A76a)) | [`0x2D18c04Aec64f93255a417d56Cfdc5577712A76a`](https://sepolia.etherscan.io/address/0x2D18c04Aec64f93255a417d56Cfdc5577712A76a) | [`0xce331a35…f8f1`](https://sepolia.etherscan.io/tx/0xce331a3546bdef04661f6be9a65690e743fd657b8e9ee85a4bdea9fa3629f8f1) |
| `quote` registered on the feefifofum registry, with the resolver above | registry [`0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`](https://sepolia.etherscan.io/address/0x2F2164507471a1a46506f902aBfdfB9d22e4bE09) | [`0xebd3cb53…b258`](https://sepolia.etherscan.io/tx/0xebd3cb532669b8c6a6ea2a2dbe0a1f6c30586a861105980f7fa726123e01b258), block 11786115, from the registrar `0x67Cc…0C99` |
| UniversalResolverV2 (ENS's) | [`0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3`](https://sepolia.etherscan.io/address/0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3) | |

The registrar [`0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99`](https://sepolia.etherscan.io/address/0x67Cc96887d3FFC0860Ebb25412c113f3cad80C99) holds the root `ROLE_REGISTRAR` (`1 << 0`) on the feefifofum registry. It registered the name in one call, `register("quote", owner, address(0), resolver, 0, expiry)`, just as the fork probe at block 11785866 had shown. On Sepolia now, `getResolver("quote")` on the registry returns `0x2D18…A76a`.

## The resolution path

1. The client calls `UniversalResolverV2.resolve(dnsName, text(node, key))`.
2. UniversalResolverV2 finds the resolver through the ENSv2 registry. The resolver answers `supportsInterface(0x9061b923)` (`IExtendedResolver`) with `true`, so UniversalResolverV2 calls its `resolve(name, data)`. Without that interface, the same lookup returns `ResolverError` and an empty payload, as the fork probe measured.
3. [`resolve`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/OffchainQuoteResolver.sol#L59-L62) always reverts `OffchainLookup(resolver, [gateway], callData, resolveWithProof.selector, callData)`. UniversalResolverV2 re-raises it with itself as the sender.
4. The client fetches `https://handoff.lol/t/castle/ccip/{sender}/{data}.json`.
5. The gateway returns `abi.encode(bytes result, uint64 expires, bytes sig)`. fi signs [`keccak256(0x1900 ‖ resolver ‖ expires ‖ keccak256(callData) ‖ keccak256(result))`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/OffchainQuoteResolver.sol#L82-L88), the format of ENS's offchain-resolver `SignatureVerifier`.
6. [`resolveWithProof`](https://github.com/34r7h/fee-fi-fo-fum/blob/fff518c55bfe60c752c0cd9acffbfc285f817f1c/contracts/src/OffchainQuoteResolver.sol#L68-L79) checks two things: that the signature has not expired (`SignatureExpired`), and that the signer is a trusted signer, which is fi (`InvalidSigner`). It then returns the text.

The resolver's owner is the treasury. Only the owner may change the gateway URL or the signer set.

## The gateway

The gateway is the castle service ([service/src/gateway.mjs](../service/src/gateway.mjs), [service/README.md](../service/README.md)). It runs on the operator's host (helen), behind the handoff tunnel, at the one URL the resolver names: `https://handoff.lol/t/castle/ccip/{sender}/{data}.json`. `POST /ccip {sender, data}` works too.

fi's key is only on that host: it is read from `CASTLE_FI_KEY_PATH` (mode 0600) and never logged. `https://handoff.lol/t/castle/health` shows `fiKeyLoaded` and fi's address.

| Record key | What it answers |
|---|---|
| `castle` | the CastleVault address |
| `quote:<tokenIn>:<tokenOut>:<amountIn>` | harp's firm quote, as one JSON line |
| anything else | `404` |

In a quote key, the tokens are `USDC` or `WETH`, and the amount is in base units.

For a quote key, the service prices harp from fee's latest signed price. It refuses in three cases:
- `503` if fee has been silent for 60 s, or if harp is not shipped;
- `422` if the quote is larger than harp's Aqua allocation or the vault's balance.

It also checks the quote with `router.quote`.

fi then signs twice:
- **The quote.** `Quote {strategyHash, tokenIn, tokenOut, priceQ96, maxAmountIn, validUntil}` is signed as EIP-712 typed data in PriceExtruction's domain (`feefifofum PriceExtruction`, version `1`, chain 11155111, verifyingContract PriceExtruction). PriceExtruction recovers the signer at fill time and requires `vault.fi()`.
- **The ERC-3668 response.** `abi.encode(result, expires, sig)` is signed over the digest in step 5 above, and `resolveWithProof` checks that signature.

Both expire together. The response's `expires` is the quote's `validUntil`, 30 s after the quote was made (`CASTLE_QUOTE_TTL_S`). After that, the record no longer resolves (`SignatureExpired`), and the quote no longer fills (`QuoteExpired`).

The record carries `takerTraitsAndData`, ready for `router.swap(order, tokenIn, tokenOut, amountIn, takerTraitsAndData)`.

## Try it

This works against Sepolia now, through the live gateway. It is plain viem, with CCIP-Read on by default:

```js
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

const client = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') })
const universalResolverAddress = '0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3'

await client.getEnsText({ name: 'quote.feefifofum.eth', key: 'castle', universalResolverAddress })
// '0x0fa4a0Fd0bE6536d7462FF922F28500123c37A98' (at block 11786269: OffchainLookup, the gateway, fi's signature, the resolver's check)

await client.getEnsText({ name: 'quote.feefifofum.eth', key: 'quote:USDC:WETH:500000', universalResolverAddress })
// harp's quote for 0.5 USDC while harp is live
```

Or as one command, after `cd service && npm ci` in a checkout:

```sh
node --input-type=module -e "import{createPublicClient,http}from'viem';import{sepolia}from'viem/chains';const c=createPublicClient({chain:sepolia,transport:http('https://ethereum-sepolia-rpc.publicnode.com')});console.log(await c.getEnsText({name:'quote.feefifofum.eth',key:'quote:USDC:WETH:500000',universalResolverAddress:'0x5d25C1D6aCBb71B7a28AA7899618a3412a8303e3'}))"
```

It prints one JSON line with these fields: `v`, `id`, `chainId`, `router`, `order`, `strategyHash`, `tokenIn`, `tokenOut`, `amountIn`, `amountOut`, `priceQ96`, `maxAmountIn`, `validUntil`, `signer`, `quoteSig` and `takerTraitsAndData`.

In the live run, agy resolved `quote:USDC:WETH:500000` and got this record (trimmed: `order`, `router` and `takerTraitsAndData` are left out):

```json
{"v":1,"id":"q-1790427574-6","chainId":11155111,
 "strategyHash":"0xc65b96a3f41cad0428e156112a2b2c6204098bc9a2b550c94ddcb7188a3bb025",
 "tokenIn":"0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","tokenOut":"0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
 "amountIn":"500000","amountOut":"185924989671030","priceQ96":"29460990594238591966531460527769576110","maxAmountIn":"500000",
 "validUntil":1790427574,"signer":"0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2",
 "quoteSig":"0xa69f2d53ee8ea40517b004f1f6e07efe0c89528aaebbb65143dfaf661cd0c3bc69730878ad6d039c12995ca4aed795c9e91280aad522c7aa442c91f66fc3e99c1b"}
```

agy filled it through AquaSwapVMRouter in [`0x763d6de1…9fe8`](https://sepolia.etherscan.io/tx/0x763d6de1cb3312803742fa80b1eed47060a1785e038a63b1f98f5cd375ea9fe8), at block 11786370 (timestamp 1790427552), 22 s before `validUntil`: 0.5 USDC for 0.000185925 WETH, the quote's `amountOut` to the wei.

## What is retired

The lease edition's `castle.feefifofum.eth` lease, heartbeat and `linkToNode` fence are not how this name works. That product is at tag [`lease-edition`](https://github.com/34r7h/fee-fi-fo-fum/tree/lease-edition).
