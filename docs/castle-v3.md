# Castle v3: liveness with zero idle gas

> **Status: NOT DEPLOYED.** The live contracts are still v2 (commit `7b86321`). Their addresses are in `contracts/deployments/sepolia.json` and the README. The v3 source is on `main`, starting at commit `7aafaba`. The v3 ABIs are in `contracts/out-abi/v3/`.

In v2, a shift stayed live by renewing an ENS lease every 90 seconds. Each renewal was a 73k-gas transaction, which cost about 2.9M gas an hour even when nobody traded. v3 moves liveness off-chain: the lease is checked at fill time, against a signature the taker brings. On-chain, gas is spent only for a daily renewal, or when someone suspects the holder is dead.

## What changed

| | v2 (live) | v3 |
| --- | --- | --- |
| Who owns `castle.feefifofum.eth` in the registry | the holder (re-registered at every claim) | **Castle itself**, registered for `NAME_PERIOD` (365 days) and renewed only when a lease would outlive it |
| Holder, expiry, epoch | read from the registry (the token id is the epoch) | one storage slot in Castle, holding `Lease{holder, expiry, epoch}` |
| Epoch | registry token id, regenerated on re-registration | a counter that every `claim()` bumps. Each bump emits `Claimed(epoch, holder, expiry, prevEpoch)` |
| Liveness between on-chain renewals | none: the lease was 120 s | a **heartbeat** co-signed by the holder and fo, checked by the fence on every fill |
| Lease length (`LEASE_PERIOD`) | 120 s, renewed about every 90 s | 1 day, renewed daily with fo's EIP-712 attestation, as in v2 |
| Takeover | `claim()` only after expiry | `claim()` after expiry, **or** after a challenge the holder left unanswered (`challenge()` / `respond()`) |
| `dissolve()` | could repeat after every settle (README R4) | never while an auction runs, and at most once per epoch |
| Wind-down branch | curve and 5% fee | the same Decay as live, the same curve, and a fee `ship()` never lets fall below the live fee |
| ENS roles Castle needs | registry REGISTRAR and RENEW; resolver LINK and SET_DATA | **the same**. No new role is needed. |

Why Castle owns the name: the first v3 design ended a live registration with `unregister`, but the registry admin revoked its own `UNREGISTER` and `UNREGISTER_ADMIN` roles at blocks 11784392 and 11784434, so nobody can grant that role any more. A lease kept in Castle's storage needs no registry change to hand the castle over.

Unchanged from v2:
- `relink()` still points `castle.feefifofum.eth` at the holder's crew node and writes the anchor into the shared record.
- `handoff-price` is still written only by Castle.
- JackHook, the CCA auctions and the multicall allowlist are the same.
- `holder()`, `epoch()`, `expiry()`, `isLive()`, `renew()` and `claim()` keep the `ICastleLease` interface.
- `registry.getOwner(labelhash("castle"))` now returns the Castle contract. Read the holder from `castle.holder()`.

## The heartbeat

The heartbeat is signed under Castle's EIP-712 domain: name `"fee-fi-fo-fum Castle"`, version `"1"`, the chain id, and `verifyingContract` set to Castle.

```
Heartbeat(uint256 epoch,uint64 validUntil)
```

Every ~30 s the holder and fo each sign the same heartbeat, and the castle service publishes it.

A taker passes the heartbeat as the swap's `TakerTraits.instructionsArgs`, packed as `validUntil (8 bytes) | holderSig (65 bytes: r, s, v) | foSig (65 bytes)`. That is 138 bytes. `script/TakerFill.s.sol` reads it from the `HEARTBEAT` environment variable.

The fence is `FeeFiFoFumExtruction`, the first instruction of every program. It makes one call, to `castle.fenceState()`, which returns the epoch, the live holder, and fo. The live holder is `address(0)` once the lease has expired. The fence then decides:

| State | Result |
| --- | --- |
| The strategy's epoch is not the current epoch | revert `FeeFiFoFum()`, as in v2 |
| Heartbeat present and valid: signed by the live holder and by fo, with `now <= validUntil <= now + 120 s` | **LIVE**: the fill continues on the live branch |
| Anything else: no heartbeat, a bad signature, expired or too far ahead, another castle or chain, a malleable s, fo missing, or an expired lease | **WIND-DOWN**: USDC in only, with the wide fee |

Replay needs no guard: a heartbeat is meant to be reused by any taker until `validUntil`. The 120 s cap bounds how long the book of a dead holder stays live. fo's renew `Attestation` is a different EIP-712 type, so its signature can't stand in for a heartbeat (tested).

A taker can pick wind-down by leaving the heartbeat out. That never gets a better price:
- both branches share the order's Decay state;
- `ship()` refuses a live fee above `WIND_DOWN_FEE_BPS`.

`testFuzz_windDownNeverBeatsLive` checks this, including right after a WETH-in swap (10,000 runs).

## Takeover

1. A crew member other than the holder calls `challenge()`. This opens a response window of `RESPONSE_WINDOW` = 60 s.
2. The holder proves it is alive with an on-chain `respond()` before the deadline. A heartbeat can't count as a response, because heartbeats signed before the challenge are still valid. After a response, no new challenge is possible for `CHALLENGE_COOLDOWN` = 600 s, so crew can't tax a live holder's gas.
3. If the holder doesn't respond, `claim()` opens at the deadline for any crew member. The claim bumps the epoch, so every order the old shift shipped reverts `FeeFiFoFum()`. The new holder then relinks, docks and re-ships as in v2.
   - At the deadline itself, `respond()` reverts and `claim()` succeeds: exactly one of them wins.
   - An unresponsive holder can't `ship`, `dock`, `relink`, `renew` or `openAuction`; these revert `HolderUnresponsive`.
   - `dissolve()` treats an unanswered challenge as the lease ending at its deadline.

## Gas

All figures come from the fork suite at the same Sepolia block, 11784926.

**Per fill:**

| Direction | v2 execution gas | v3 execution gas | v3 heartbeat calldata | Net per fill |
| --- | --- | --- | --- | --- |
| USDC → WETH | 235,304 | 234,040 | +2,148 | +884 |
| WETH → USDC | 284,260 | 282,971 | +2,148 | +859 |

v3's fence reads the lease with one storage load (`fenceState` costs about 6.5k gas) instead of two registry round trips. That pays for the two ecrecovers. Castle v3 is compiled at 200 optimizer runs, against v2's 700, to stay under EIP-170. Of Castle's code, only `fenceState` is on the fill path. As a real-world anchor, the live v2 fill `0xb349a23c…` used 233,174 gas in total.

**Operator (idle) cost:**

| | v2 | v3 |
| --- | --- | --- |
| Liveness while trading or idle | renew every ~90 s at ~73k gas = **~2.9M gas/h** | heartbeats are off-chain: **0 gas** |
| Lease renewal | included above | one `renew()` a day, ~37k gas (median in the fork suite) |
| Name renewal | included above | about once a year (`NAME_PERIOD`) |
| Suspected death | none (wait for expiry) | `challenge()` 53k gas, `respond()` 33k gas, early `claim()` about 147k gas |

v3 costs takers about 0.9k extra gas per fill. It saves the operator about 2.9M gas an hour, so it breaks even at about 3,300 fills an hour.

## Tests

- **Unit tests:** 175, with real Aqua, the real AquaSwapVMRouter 1.0.2 and ENSv2 mocks, run under both token orderings.
  - The fence's decision table is fuzzed over 12 heartbeat kinds × epoch × lease × direction, 10,000 runs.
- **Fork tests:** 18, against the live Sepolia contracts at LATEST state by default; `FORK_BLOCK` pins a block. They cover:
  - heartbeat liveness after 23 idle hours;
  - an unanswered challenge handing the castle over with no registry change;
  - `respond()` keeping the castle;
  - one dissolve per epoch on the live CCA;
  - that v2 can't take the shared label back once v3 holds it;
  - revoking v2's resolver LINK|SET_DATA, which protects the shared anchor (48,768 execution gas).
- **Mutation testing:** 13 of 13 mutants killed. They removed the TTL cap, the fo co-signature, the early claim, the deadline race, the dissolve guard, the fee floor, name keeping, the lease-expiry gate, the cooldown, the unresponsive-holder gate, the self-challenge check and challenge clearing, and extended heartbeat expiry by one second.
- **Static analysis** (slither 0.11.6 and aderyn 0.6.8 on the v3 source). No true positives. For the v2 leads, see `docs/cca-auction.md`. The v3 leads:
  - aderyn H-1, H-2 and H-3 are the same false positives as in v2. The one new instance is `uint32(newEpoch)`: `newEpoch` is `epoch + 1`, computed with checked uint32 arithmetic, so it can't truncate.
  - slither `reentrancy-balance` in `ship`: the balances `_book` reads go to Aqua's `ship`, which is the trusted, immutable 1inch Aqua and makes no callback. The "stale" value used after the call is only the returned strategy-hash check.
  - slither `incorrect-equality`:
    - `_book` checks liquidity and amounts against 0;
    - `_writePrice` checks the price against 0;
    - `dissolve` compares `dissolvedEpoch` with the current epoch.
    None of these compares a balance.
  - slither `unused-return`:
    - `_keepName` drops the token id `register` returns; the name is keyed by its label;
    - `committed` drops the version byte of `rawBalances`;
    - the third return of `tryRecover` is the signature error, and the first two returns are checked.
  - slither `reentrancy-no-eth` in `dissolve` and `_openAuction`, and `divide-before-multiply` in the floor: the same as v2 (see `docs/cca-auction.md`).

To run them:

```
forge test --no-match-path "test/fork/*" --fuzz-runs 10000
forge test --match-path test/fork/CastleFork.t.sol       # latest state; FORK_BLOCK=<n> to pin
```

## Deploy plan

One live attempt, with a gas cap of 0.012 ETH. It goes ahead only after agy and handoff-advisor PASS.

1. **Deployer `0x89a7…AA73`** runs `script/DeployCastle.s.sol` with `JACK_HOOK=0x50919ddaaf8294865652D53b45f210019AB2fcAd` (the live JackHook is reused). The script deploys:

   | Step | Gas |
   | --- | --- |
   | `FeeFiFoFumExtruction` | 730,647 |
   | `Castle` | 5,502,946 |
   | `setCrew` fee | 50,025 |
   | `setCrew` fi | 50,013 |
   | `setAuctioneer` fum | 47,278 |

2. **Castle EOA `0x67Cc…0C99`** grants Castle the same roles as v2:

   | Grant | Gas |
   | --- | --- |
   | registry REGISTRAR \| RENEW | 63,289 |
   | resolver LINK \| SET_DATA | 62,714 |

3. **Owner** seeds the anchor from Chainlink with `setAnchorPrice`: 63,787 gas.
4. **Genesis:**

   | Step | Gas |
   | --- | --- |
   | fee `multicall(claim, relink)` | 209,584 |
   | WETH funding | ~47k |
   | USDC funding | ~62k |
   | `ship` | 247,779 |

   The first claim registers `castle.feefifofum.eth` to Castle for 365 days, so v2's label must have lapsed first.

These figures were measured by broadcasting the same sequence to an anvil fork of latest Sepolia. The deployer sends about 6.44M gas: about 0.0063 ETH at 0.98 gwei, and at most 0.0097 ETH with maxFee capped at 1.5 gwei. Everything together, about 7.14M gas, is about 0.0070 ETH.

**Migration notes:**
- v2 keeps its registry and resolver roles and shares the label and the anchor record with v3.
- Once v3 holds the label, v2's `claim()` reverts with `LeaseStillLive` (fork-tested).
- v2's auctioneer could still open and settle a v2 auction, which would write the shared anchor. There are three ways to close that:
  - fum stops touching v2 (free);
  - the owner key calls `v2.setAuctioneer(address(0))` (about 27k gas);
  - the admin revokes v2's roles. **SirKit chose this, narrowly:** after v3 is live, the castle EOA `0x67Cc…0C99` (resolver LINK_ADMIN and SET_DATA_ADMIN) sends `resolver.revokeRootRoles(LINK | SET_DATA, v2)`, about 70k gas. v2 keeps REGISTRAR and RENEW, which can't touch a label v3 holds.
- v2's hoard can leave v2 only through fills or auctions.
