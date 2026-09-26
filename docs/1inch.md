# 1inch

Aqua and SwapVM were not in the handoff baseline (`079f8f0`). Castle is the Aqua maker. The SwapVM program's first instruction is `FeeFiFoFumExtruction`, which refuses a fill when the taker names an epoch that is not the live registry token id.

## Addresses

| Contract | Address | Deploy |
|---|---|---|
| Aqua | [`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`](https://sepolia.etherscan.io/address/0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) | external, `contracts/deployments/sepolia.json` |
| AquaSwapVMRouter 1.0.2 | [`0xeDB6933949dB941D495b23604818F9AbF55e70f9`](https://sepolia.etherscan.io/address/0xeDB6933949dB941D495b23604818F9AbF55e70f9) | [`0xb2b319a2…cd4d`](https://sepolia.etherscan.io/tx/0xb2b319a23732ade788971450ed30498b0dbf6cbb54d86c9ad343e7b42a32cd4d) |
| FeeFiFoFumExtruction (v3) | [`0xe54643fC662bd2C569BD614D29336af95C8B73CC`](https://sepolia.etherscan.io/address/0xe54643fC662bd2C569BD614D29336af95C8B73CC) | [`0x47751f5e…929f`](https://sepolia.etherscan.io/tx/0x47751f5e81c3952304a811283a0d9d9e07d350c1b552c76634afd176e712929f) |
| FeeFiFoFumExtruction (v2, retired at v3 genesis) | [`0xfA0455bca2B521664021A883aA78fBEAa470f271`](https://sepolia.etherscan.io/address/0xfA0455bca2B521664021A883aA78fBEAa470f271) | [`0x14ac049e…629f`](https://sepolia.etherscan.io/tx/0x14ac049eeac5f13512c99c67942a4eb88e56f04910b3bc0a5e760fe3ab03629f) |

## Call sites

The lines are from the deployed source, commit `7b863212f649c07327ac53966e8fae40f813cfb7`, not later Castle revisions.

- [`Castle.ship` calls `AQUA.ship`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L363) at line 363.
- [`Castle._dock` calls `AQUA.dock`](https://github.com/34r7h/fee-fi-fo-fum/blob/7b863212f649c07327ac53966e8fae40f813cfb7/contracts/src/Castle.sol#L556) at line 556.
- Live ship: [`0x7306bda6…add7`](https://sepolia.etherscan.io/tx/0x7306bda652ba6ded88f5e49bc98cb9ac8408f999bda39e22ee963f0f5dfbadd7), strategy `0x1b29d5ebd84076bd37322ab50aa0a0cc2825f5610542a96d58983b8125138f48`.
- Live fill while the lease was live: [`0xb349a23c…fa1d`](https://sepolia.etherscan.io/tx/0xb349a23c10f31273752064f5495673b39dff47cf5a3165a72e87352ddb07fa1d), 0.0005 WETH in, 1.329484 USDC out, quote matched swap.
- Live fill after expiry, wind-down only: [`0x0065e64a…0d6c`](https://sepolia.etherscan.io/tx/0x0065e64a899acf825552777189387b0058b8fb58efc1e027cf0de18adfeb0d6c).
