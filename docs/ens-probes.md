# ENSv2 lease probes

Deployment used: `ensdomains/contracts-v2` tag `sepolia-deployment-2026-09-15` (deployed 2026-09-15T09:46:38.513Z). This is the deployment in the ENS docs table and in PLAN.md section 0. It is not the `main` `deployments/sepolia` set, and it is not `sepolia-official-v1-20260525-r2`.

| Contract | Address |
|---|---|
| ETHRegistry | `0x657ea849311d3d5823348dded7c2aaafb3ede09e` |
| ETHRegistrar | `0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca` |
| PermissionedResolverImpl | `0x14f09fd05d4585759e54844dc9b00147131cf243` |
| UniversalResolverV2 | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` |
| VerifiableFactory | `0x9e726eb570beb6bceb495ab8cda7df517d4e841c` |
| UserRegistryImpl | `0xa80338aaa8d23831cea25e858d1774534abb0263` |
| MockUSDC | `0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e` |

Every transaction below is **fork**. The fork is `anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com` at chain id 11155111, starting at block 11783933. No live Sepolia transaction has been sent. The script is `contracts/probes/fork-probes.sh`.

## (a) renew and a sub-minute expiry — fork

`ETHRegistrar.MIN_REGISTER_DURATION` is `2419200` (28 days). `MIN_COMMITMENT_AGE` is `60`. A first registration through the registrar cannot be shorter than 28 days.

`PermissionedRegistry.renew(uint256,uint64)` has no minimum duration. It stores the new expiry when the caller has `ROLE_RENEW` (`1 << 16`) and the new value is not earlier than the stored one.

On the fork, label `fffo-probe` was registered by impersonating the registrar with expiry `1790398117` (40 seconds ahead of the pinned block). `renew` to `1790398127` succeeded. `renew` back to `1790398077` reverted `CannotReduceExpiry(1790398127, 1790398077)`.

| Step | Transaction |
|---|---|
| register, expiry 40s out | `0xb16733a18aa9ec06031370f0e61f5b388166961cca59d9cb8f1220aa791a09c2` |
| renew to +50s | `0x8b83d79cdc181d5d72c688786f593054c4a6d2c92620814840c34e6b025383a7` |

Live: not run.

## (b) re-registration changes the token id — fork

`getTokenId` of `fffo-probe` after the first register was `35143776415746789550110266821727809756317224714370429861602280368550214369280`. After the name expired, `getOwner` returned `address(0)`. Re-registering it minted `...69281`.

| Step | Transaction |
|---|---|
| re-register after expiry | `0xa14f23fb5f311cd56af04daaf94dabd3c079a7c843e02ba451ee9019d761170f` |

The token id is `LibLabel.withVersion(keccak256(label), tokenVersionId)`. The first mint keeps version 0. A later register, while `super.ownerOf` still returns the previous owner, increments `tokenVersionId`. That increment is the fencing epoch.

Live: not run.

## (c) a contract can read owner and expiry without UniversalResolver — fork

These are on ETHRegistry. None of them call UniversalResolverV2.

| Function | Selector |
|---|---|
| `getOwner(uint256)` | `0xc41a360a` |
| `getExpiry(uint256)` | `0x13c72608` |
| `getTokenId(uint256)` | `0x14ff5ea3` |
| `renew(uint256,uint64)` | `0x5569f33d` |

`anyId` may be `uint256(keccak256(bytes(label)))`. `getOwner` returns `address(0)` when `block.timestamp >= expiry`, and also when the label was never registered. `getExpiry` tells those apart: never registered is `0`, expired is a past timestamp.

```solidity
interface IEthRegistryReads {
    function getOwner(uint256 anyId) external view returns (address);
    function getExpiry(uint256 anyId) external view returns (uint64);
    function getTokenId(uint256 anyId) external view returns (uint256);
}

function holdsLabel(address registry, address bidder, string memory label) internal view returns (bool) {
    uint256 id = uint256(keccak256(bytes(label)));
    return IEthRegistryReads(registry).getOwner(id) == bidder
        && block.timestamp < IEthRegistryReads(registry).getExpiry(id);
}
```

Measured on the fork: after `fffo-probe` expired, `getOwner` was `0x0000000000000000000000000000000000000000`. Before that, it was `0x1111111111111111111111111111111111111111`.

## (d) setData and linkToNode — fork

On the `sepolia-deployment-2026-09-15` implementation:

- `setData(bytes name, string key, bytes value)` selector `0xeb4b73bb`. Needs `ROLE_SET_DATA` (`1 << 24`) on `PermissionedResolverLib.resource(key)`. Granting that role on root was enough for `handoff-price`.
- `linkToNode(bytes sourceName, bytes32 targetNode)` selector `0x5d27b8e5`. Needs `ROLE_LINK` (`1 << 28`) on root. Reverts `InvalidRecord` if the target has no record yet.
- `name` is DNS-encoded bytes, not a `bytes32` node. `targetNode` is a namehash.
- The implementation constructor calls `_disableInitializers()`. The calls below were made through an EIP-1167 clone of `0x14f09fd05d4585759e54844dc9b00147131cf243`, not by a transaction to the implementation itself.

| Step | Transaction |
|---|---|
| clone | `0x4905c58b998f0c0e8580c012be8b33b08580e3a3a1dae4c4e3bd2261398cb0e5` at `0x39c2540Cc64C8562269200ee459DC2853aAB9d87` |
| initialize with both roles | `0xfc7387d598e918281700093e1db4acb168add709286bda2c5e3818360a59c327` |
| `setData(alpha.eth, "handoff-price", 0x01)` | `0x2c4389b031dd6298a4cede928faef812c35af19e3e538256730445e3f1e1f0d3` |
| `linkToNode(beta.eth, namehash(alpha.eth))` | `0x1e63de63f35c4f2e3b17a12c37e62cc7ceb392708b68cf8b64e5572dcb6f560c` |

`getRecordId` was `1` for both names after the link.

Live: not run.

## Parent name — fork

`feefifofum` was unregistered on the forked registry (`getOwner` `address(0)`, `getExpiry` `0`). `getRegisterPrice` in MockUSDC for 2419200 seconds was `613701` base and `0` premium.

| Step | Transaction |
|---|---|
| MockUSDC mint | `0xe4b567b758ca3cc4bffe9c6eb61959b10a3c49696354d3184130b93ef26e9bc6` |
| approve registrar | `0xd25b98acb254d166873bbee7e5baa23b977503ab0be443c970a791edc27e2dbb` |
| commit | `0x8667d7fdc1364bde58cccb57b10bdf3dd610d0738a75f8162bc577438bb3c689` |
| register | `0xaa529b50f7ad6df7d86a3c37724b6f207fdd69d2fe127abc096005485637171c` |
| setResolver | `0x928f6e19dece5f7200fce1c48b2de8faa94e13854a1558f16edd516c1175eccb` |
| setAddress | `0xe411993e5ffcfd10e0187319bbaaf0b38cc1d9d9057ec430835a3886b35ebe1e` |

After that, on the fork:

- owner `0x1111111111111111111111111111111111111111` (an anvil-impersonated EOA, not a live key)
- expiry `1792817565`
- token id `45412221461747854181285245383596175825201150978450840387305249746410167861248`
- resolver `0x3f819cB883e845F7a90484699c5E35490b8d2fB6` (a second clone of the same implementation)
- `UniversalResolverV2.resolve` of `feefifofum.eth` `addr(bytes32)` returned `0x0000000000000000000000001111111111111111111111111111111111111111`
- no UserRegistry subregistry has been created

`setAddress` rejects a 32-byte left-padded address with `InvalidEVMAddress`. The value has to be 20 bytes. Coin type `60`.

Live: not run. korg's broker wallet `0xAa6F74eBb7cd5F04c49a6a1306bD98B6fAEDABDE` has 0 Sepolia ETH and its key is not on this machine.

## JackHook vectors

The hook should take the label the bidder claims and read ETHRegistry directly.

| Case | Registry state | Expected |
|---|---|---|
| Named | `getOwner(id) == bidder` and `block.timestamp < getExpiry(id)` | bid allowed |
| Unnamed | label never registered: `getOwner` is `address(0)` and `getExpiry` is `0` | revert |
| Expired | `getExpiry` is non-zero and `block.timestamp >= getExpiry`. `getOwner` is also `address(0)` | revert |

`getOwner == bidder` already fails for both unnamed and expired. Use `getExpiry` only when the revert reason must say which of the two it was.

## Live Sepolia

Wallet `0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E`. Gas price used: 1.2 gwei. Balance after these transactions: 0.00719 ETH. No `castle` label was registered.

### Parent name — live

`feefifofum` was unregistered (`getOwner` `address(0)`, `getExpiry` `0`). `MIN_REGISTER_DURATION` read live is `2419200`. `getRegisterPrice` was `613701` MockUSDC.

| Step | Transaction |
|---|---|
| commit (with the live subregistry and resolver) | `0xd2a2f22f42e7597e7d307903d5c206ad711ef40524ef1c7967d1307ebfb9ebc4` |
| register | `0xc51ab2660dd9a0029a201a4acd5330d7e7c2eac063cbfe58bb31039d30338378` |

After register, read live from ETHRegistry:

- owner `0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E`
- expiry `1792818444`
- token id `45412221461747854181285245383596175825201150978450840387305249746410167861248` (low 32 bits are 0, so `tokenVersionId` is 0)
- resolver `0x9D2251b5162701BC2bD97d61bc8aa3e53446285E`
- subregistry `0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`

`UniversalResolverV2.resolve` of `feefifofum.eth` `addr(bytes32)` returned 32 zero bytes. The call did not revert. No address record is set. `setData` on that resolver reverts `EACUnauthorizedAccountRoles` for `ROLE_SET_DATA` (`16777216`) from this EOA.

### (a) renew — live

`cast call` of `renew(labelId, now+30)` from the owner reverted `EACUnauthorizedAccountRoles(tokenId, 65536, 0x48EB…)`. `65536` is `ROLE_RENEW`. The registrar's registration bitmap does not include it, and `MIN_REGISTER_DURATION` makes a sub-minute first registration impossible through `ETHRegistrar`. The successful sub-minute `renew` remains the fork transaction `0x8b83d79cdc181d5d72c688786f593054c4a6d2c92620814840c34e6b025383a7`.

### (b) re-registration — live

Not sent. The name expires at `1792818444`, and a second register before that reverts `LabelAlreadyRegistered`. The live token id's low 32 bits are 0, which is version 0, the same id the fork minted on the first register. The version increment is the fork transaction `0xa14f23fb5f311cd56af04daaf94dabd3c079a7c843e02ba451ee9019d761170f`.

### (c) direct reads — live

The owner, expiry, and token id above were read with `getOwner`, `getExpiry`, and `getTokenId` on ETHRegistry after the register transaction. No UniversalResolver call was involved in those reads.

### (d) setData and linkToNode — live

The name resolver refuses this EOA. The same calls were sent to an EIP-1167 clone of implementation `0x14f09fd05d4585759e54844dc9b00147131cf243`, initialized with `ROLE_SET_DATA | ROLE_LINK` on root.

| Step | Transaction |
|---|---|
| clone `0xbEF81885A821E0dF205838BED44d6A5240CF4474` | `0xdd08f8e1c1541fd4d5280b9bea65ef6450121fd0d1b7982da0d1539ca120773f` |
| initialize | `0x1f6313ede43c1a4fa96c7747b8714af3ee5bb63a0061041ef9af18fc900bb454` |
| `setData` | `0x4f18a7f7ab7df456bce9f10826e115fb7014c7b371da721a71035f31699b19a1` |
| `linkToNode` | `0x1f5215fd97990683e183abcd20a9d664348c2439dd2360c872c970f784bb0fa1` |

`getRecordId` is `1` for both `alpha.eth` and `beta.eth`.

## Design consequence

Live `eth_call`s on Ethereum Sepolia, 2026-09-26:

| Call | Result |
|---|---|
| `ETHRegistrar.MIN_REGISTER_DURATION()` at `0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca` | `2419200` (28 days) |
| `ETHRegistry.hasRoles(tokenId, 65536, 0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E)` | `false` |
| `ETHRegistry.hasRoles(tokenId, 1, 0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E)` | `false` |
| `renew(labelId, now+30)` from that owner | revert `EACUnauthorizedAccountRoles(tokenId, 65536, owner)` |

`65536` is `ROLE_RENEW` (`1 << 16`). `1` is `ROLE_REGISTRAR`. The token id is the live `feefifofum` token `45412221461747854181285245383596175825201150978450840387305249746410167861248`.

The .eth registrar cannot create the short lease a shift needs, and the registrant it creates does not hold the role `renew` checks. The fork showed that `PermissionedRegistry.renew` itself accepts a sub-minute expiry when the caller has `ROLE_RENEW`.

`castle.feefifofum.eth` therefore has to be registered as a label on the feefifofum subregistry `0x2F2164507471a1a46506f902aBfdfB9d22e4bE09`, not through ETHRegistrar. That `register` must grant the Castle contract `ROLE_REGISTRAR` (`1`) and `ROLE_RENEW` (`65536`). `ROLE_RENEW` is the bit `Castle.renew` needs: `contracts/src/Castle.sol` calls `REGISTRY.renew` as Castle, not as the holder. `ROLE_REGISTRAR` is checked on the registry root, not on the name token, so a bit set only on the castle token does not let Castle register other labels. If Castle must register later names, the subregistry root has to grant it `ROLE_REGISTRAR` as well.

`Castle.claim` currently calls `register` with role bitmap `0` (`Castle.sol` line 167). A later claim burns the old token and mints a new one. Unless that bitmap also grants Castle `ROLE_RENEW`, the new token will not let `Castle.renew` succeed.
