# ENS — outline

This is the groundwork for the sponsor write-up. It is not the finished page.

## What changes for handoff

The baseline used `ens_name` on the agent record and ENSv1 subnames. This project uses ENSv2 as the liveness signal. A shift is live only while `castle.feefifofum.eth` is unexpired, and the token id minted at claim is the fencing epoch. The probes and the reason the castle label cannot be a .eth registration are in `docs/ens-probes.md`.

## What is live

| Name | Value |
|---|---|
| Parent | `feefifofum.eth` |
| Register tx | `0xc51ab2660dd9a0029a201a4acd5330d7e7c2eac063cbfe58bb31039d30338378` |
| Owner | `0x48EB8a8c5dC69Dc578f861dAf987882206aF5d3E` |
| Subregistry | `0x2F2164507471a1a46506f902aBfdfB9d22e4bE09` |
| Resolver | `0x9D2251b5162701BC2bD97d61bc8aa3e53446285E` |
| UniversalResolverV2 | `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3` |

`castle.feefifofum.eth` is not registered. UniversalResolverV2 currently returns a zero address for the parent, because no address record is set.

## Call sites

- `Castle.renew` calls `REGISTRY.renew` (`contracts/src/Castle.sol` line 152).
- `Castle.claim` calls `REGISTRY.register` with role bitmap `0` (line 167).

## Still to write

The crew subnames, `linkToNode` for the current shift, and `setData` for `handoff-price`. None of those records exist on the live resolver yet.