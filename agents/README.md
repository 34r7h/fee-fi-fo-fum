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

Rehearse on an anvil fork without spending Sepolia ETH:
`anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com` in one shell, then `SEPOLIA_RPC_URL=http://127.0.0.1:8545 ./scripts/up.sh`.
A local primary RPC disables the fallbacks, so a rehearsal can't leak a transaction onto Sepolia.

## Layout

| Path | What |
|---|---|
| `run.mjs` | One crew member: heartbeat loop, realtime listener, role tick loop, JSON-line logs |
| `roles/<id>.mjs` | The role's logic: `tick(ctx)` on an interval and `onMessage(ctx, msg)` for inbound handoff messages |
| `lib/handoff.mjs` | Signed handoff client (Ed25519 over `handoff-signed-req`; no bearer key on the wire) |
| `lib/chain.mjs` | viem on Sepolia: fallback RPCs from env, the key-file account, deployments and ABIs |
| `lib/lease.mjs` | The castle lease (holder, epoch, expiry) and its fence state |
| `lib/listener.mjs` | One `handoff-realtime` listener per agent, reaping only this agent's orphan after a `kill -9` |
| `crew.json` | Public crew data: roles, addresses, capabilities, personas |
| `abi/` | Interface ABI stubs until `contracts/out-abi/` exists |
| `scripts/` | `new-wallets.mjs`, `register-crew.mjs`, `up.sh`, `down.sh` |

## Rules the runtime keeps

- **Keys stay home.** EOA keys are `~/.handoff/agents/<id>/sepolia.key` and handoff signing keys are
  `~/.handoff/agents/<id>/config.json`, both mode 0600. The runtime refuses a key file readable by others.
  Nothing prints a key.
- **Liveness is `agent_heartbeat`, never messages**, which are charged and rate-limited. On-chain, the castle
  lease renew is the real heartbeat. fi acts on the lease, not on a missed heartbeat.
- **No hard-coded addresses.** Contracts come from `contracts/deployments/sepolia.json`.
- **Signing is code, not judgment.** Inbound messages are logged and routed to deterministic role handlers.
  No model decides what a funded key signs.
