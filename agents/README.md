# agents: fee, fi, fo and fum

The four syllables of the giant's chant, each a handoff agent with its own process, its own signing key and its
own self-custodied Ethereum Sepolia EOA. See [docs/NAMING.md](../docs/NAMING.md) for who does what.

| Agent | Role | Sepolia address |
|---|---|---|
| fee | shift trader | [`0x56EB…6538`](https://sepolia.etherscan.io/address/0x56EB9F80f3cBb4E627ED28108af1c1fbe8a46538) |
| fi | hot standby | [`0xB6eA…40b2`](https://sepolia.etherscan.io/address/0xB6eA66c2bE639820DFE546f49DF0349Cf27440b2) |
| fo | fencer and witness | [`0x8689…3D56`](https://sepolia.etherscan.io/address/0x8689a407A2488A5b2f2De05d2C6978a798f93D56) |
| fum | auctioneer | [`0xcaD0…82D2`](https://sepolia.etherscan.io/address/0xcaD061b80EC52a18D31aE9b00FC1b4Df253f82D2) |

## Run

```sh
cd agents && npm ci
cp .env.example .env            # optional: real values (ETHERSCAN_API_KEY, a keyed RPC). Never commit it.
./scripts/up.sh                  # fee, fi, fo, fum as four processes; logs in agents/logs/<id>.log
kill -9 "$(cat logs/fee.pid)"    # the failover demo: exactly one giant falls
./scripts/down.sh                # SIGTERM everyone (each also stops its listener)
```

### Rehearse on a fork first

The renew loop spends real Sepolia ETH (a renew costs about 73k gas, a ship about 218k, a claim about 280k), so
every demo runs on an anvil fork first. `scripts/local-castle.sh` deploys Castle v2 and the fence on its own
timed anvil (port 8745) and wires them to the LIVE router, Aqua, WETH, USDC and ENSv2 agent registry and
resolver. It grants roles as the registry admin (impersonated), sets fee and fi as crew, seeds the anchor and
funds the book. `scripts/rehearse.sh` then drives a whole demo and fails loudly at the first missing beat:

```sh
./scripts/rehearse.sh failover   # genesis claim, ship centred on the ENS anchor, renewals, kill -9 fee,
                                 # fi claims within one lease period and re-ships, stale fee reverts NotHolder
./scripts/rehearse.sh withhold   # fee hangs, fo withholds (trader-hang) and posts an incident,
                                 # fee's self-signed renew reverts BadAttestation, fi takes over
./scripts/down.sh && ./scripts/local-castle.sh --stop
```

A local primary RPC disables the fallbacks, so a rehearsal can't leak a transaction onto Sepolia, and fo's
incidents go to `fee-fi-fo-fum-rehearsal`, not the live channel.

Demo switches for fee: `FEE_STAGE_HANG=1` (heartbeat on, no ships), `FEE_STALE=1` (one unsimulated renew
from stale state), `FEE_FORCE_RENEW=1` (forge its own seal after fo withholds). Pacing: `RENEW_EVERY_S` (40),
`RESHIP_EVERY_S` (240), and fo's `FO_STALE_QUOTES_S` (300), which must stay above the reship period.

## Layout

| Path | What |
|---|---|
| `run.mjs` | One crew member: heartbeat loop, realtime listener, role tick loop, JSON-line logs |
| `roles/<id>.mjs` | The role's logic: `tick(ctx)` on an interval and `onMessage(ctx, msg)` for inbound handoff messages |
| `lib/handoff.mjs` | Signed handoff client (Ed25519 over `handoff-signed-req`; no bearer key on the wire) |
| `lib/chain.mjs` | viem on Sepolia: fallback RPCs from env, the key-file account, deployments and ABIs |
| `lib/lease.mjs` | The castle lease (holder, epoch, expiry) and its fence state |
| `lib/shift.mjs` | The holder's moves on Castle v2: renew with fo's seal, claim + dock + relink, ship and re-centre |
| `lib/book.mjs` | Reads a shipped program back: its fence epoch, and its band's centre against ENS `handoff-price` |
| `lib/attest.mjs`, `lib/fo-policy.mjs` | fo's EIP-712 seal and its sign-or-withhold rules |
| `lib/replay.mjs`, `lib/incidents.mjs` | fo's fill replay against the lease timeline, and its incident channel |
| `lib/listener.mjs` | One `handoff-realtime` listener per agent, reaping only this agent's orphan after a `kill -9` |
| `crew.json` | Public crew data: roles, addresses, capabilities, personas |
| `abi/` | The ICastleLease ABI (Castle's full ABI comes from `contracts/out-abi/`) |
| `scripts/` | `new-wallets.mjs`, `register-crew.mjs`, `balances.mjs`, `wrap-weth.mjs`, `up.sh`, `down.sh`, `local-castle.sh`, `rehearse.sh` |

## Rules the runtime keeps

- **Keys stay home.** EOA keys are `~/.handoff/agents/<id>/sepolia.key` and handoff signing keys are
  `~/.handoff/agents/<id>/config.json`, both mode 0600. The runtime refuses a key file readable by others.
  Nothing prints a key.
- **Liveness is `agent_heartbeat`, never messages**, which are charged and rate-limited. On-chain, the castle
  lease renew is the real heartbeat. fi acts on the lease, not on a missed heartbeat.
- **No hard-coded addresses.** Contracts come from `contracts/deployments/sepolia.json`.
- **Signing is code, not judgment.** Inbound messages are logged and routed to deterministic role handlers.
  No model decides what a funded key signs.
