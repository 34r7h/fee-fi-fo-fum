#!/usr/bin/env bash
# Rehearsal castle: Castle v2 on an anvil fork of Sepolia, wired exactly as the live deploy will be: the live
# AquaSwapVMRouter and Aqua, WETH9 and Circle USDC, and handoff's live ENSv2 agent registry and resolver
# (feefifofum.eth's subregistry, where fee and fi already own their crew names). Only Castle and the fence are
# new. The registry admin is impersonated to grant Castle its root roles, the operator (anvil's first account)
# sets the crew and seeds the anchor price, and Castle is given a book. The crew then runs renewals, ships and
# failover without spending Sepolia ETH. Writes agents/.local/deployments.json and prints the env to use it:
#   ./scripts/local-castle.sh && eval "$(./scripts/local-castle.sh --env)" && ./scripts/up.sh
#   ./scripts/down.sh && ./scripts/local-castle.sh --stop
set -euo pipefail
AGENTS=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$AGENTS/.." && pwd)
PORT=${ANVIL_PORT:-8745}   # not 8545: other agents on this machine run their own anvils there
RPC=http://127.0.0.1:$PORT
OUT="$AGENTS/.local/deployments.json"
PIDF="$AGENTS/logs/anvil.pid"
ours() { [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; }
case "${1:-}" in
  --env)   # fo's incidents go to a rehearsal channel, never the live one
    echo "export SEPOLIA_RPC_URL=$RPC DEPLOYMENTS_PATH=$OUT INCIDENT_CHANNEL=${INCIDENT_CHANNEL:-fee-fi-fo-fum-rehearsal}"
    exit 0 ;;
  --stop)
    ours && kill "$(cat "$PIDF")" && echo "anvil stopped (pid $(cat "$PIDF"))"; rm -f "$PIDF"; exit 0 ;;
esac
mkdir -p "$AGENTS/logs" "$AGENTS/.local"
if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  ours || { echo "$RPC answers, but it is not this rehearsal's anvil (logs/anvil.pid); pick another ANVIL_PORT" >&2; exit 1; }
else
  nohup anvil --fork-url "${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}" --port "$PORT" --block-time 2 > "$AGENTS/logs/anvil.log" 2>&1 &
  echo $! > "$PIDF"
  for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done
fi
[ "$(cast chain-id --rpc-url "$RPC")" = 11155111 ] || { echo "anvil at $RPC is not a Sepolia fork" >&2; exit 1; }
# The lease runs on block time, and an anvil without --block-time never moves it between transactions.
B0=$(cast block-number --rpc-url "$RPC"); sleep 3
[ "$(cast block-number --rpc-url "$RPC")" -gt "$B0" ] || { echo "anvil at $RPC is not mining on a timer (--block-time)" >&2; exit 1; }

OPERATOR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266   # anvil's first account, unlocked on the fork: the castle's owner
DEP="$ROOT/contracts/deployments/sepolia.json"
ENS="$ROOT/contracts/deployments/ens-agents.sepolia.json"
ext() { jq -r ".external.$1" "$DEP"; }
crew() { jq -r ".agents.$1.address" "$AGENTS/crew.json"; }
ROUTER=$(jq -r '.contracts.aquaSwapVMRouter.address // .contracts.router' "$DEP")
REG=$(jq -r .agentRegistry "$ENS"); RES=$(jq -r .resolver "$ENS"); ADMIN=$(jq -r .registrar "$ENS")
PARENT=$(jq -r .parent "$ENS")                                   # feefifofum.eth
tx() { cast send "$@" --rpc-url "$RPC" --unlocked >/dev/null; }
dns() { node -e 'const b=[];for(const l of process.argv[1].split(".")){const e=Buffer.from(l);b.push(e.length,...e)}b.push(0);console.log("0x"+Buffer.from(b).toString("hex"))' "$1"; }

# The fence, then Castle v2 (its Config is one struct, so the creation code is sent with cast).
FENCE=$(cd "$ROOT/contracts" && forge create src/FeeFiFoFumExtruction.sol:FeeFiFoFumExtruction --rpc-url "$RPC" --unlocked --from "$OPERATOR" --broadcast --json 2>/dev/null | grep -o '"deployedTo": *"0x[0-9a-fA-F]*"' | grep -o '0x[0-9a-fA-F]*')
CFG="($(ext aqua),$ROUTER,$FENCE,$REG,$RES,$(ext weth),$(ext usdc),$(crew fo),$OPERATOR,castle,$(dns "castle.$PARENT"),${LEASE_PERIOD:-120},true,${WIND_DOWN_FEE_BPS:-50000000},${DECAY_PERIOD:-60})"
ARGS=$(cast abi-encode "constructor((address,address,address,address,address,address,address,address,address,string,bytes,uint64,bool,uint32,uint16))" "$CFG")
CODE=$(cd "$ROOT/contracts" && forge inspect src/Castle.sol:Castle bytecode)
CASTLE=$(cast send --rpc-url "$RPC" --unlocked --from "$OPERATOR" --json --create "${CODE}${ARGS#0x}" | jq -r '.contractAddress // .data.contractAddress')

# Castle's root roles on the live registry and resolver, granted by their admin (impersonated on the fork only).
cast rpc anvil_impersonateAccount "$ADMIN" --rpc-url "$RPC" >/dev/null
cast rpc anvil_setBalance "$ADMIN" 0xde0b6b3a7640000 --rpc-url "$RPC" >/dev/null
tx "$REG" "grantRootRoles(uint256,address)" $(( (1 << 0) | (1 << 16) )) "$CASTLE" --from "$ADMIN"    # REGISTRAR | RENEW
tx "$RES" "grantRootRoles(uint256,address)" $(( (1 << 24) | (1 << 28) )) "$CASTLE" --from "$ADMIN"   # SET_DATA | LINK
cast rpc anvil_stopImpersonatingAccount "$ADMIN" --rpc-url "$RPC" >/dev/null

# The operator's part: crew labels (fee and fi own those names in the live registry) and the genesis anchor.
tx "$CASTLE" "setCrew(address,string)" "$(crew fee)" fee --from "$OPERATOR"
tx "$CASTLE" "setCrew(address,string)" "$(crew fi)" fi --from "$OPERATOR"
ANCHOR=$(node -e 'console.log((BigInt(Math.round(Number(process.argv[1]) * 1e6)) * (1n << 96n) / 10n ** 18n).toString())' "${ANCHOR_USDC_PER_WETH:-2500}")
tx "$CASTLE" "setAnchorPrice(uint256)" "$ANCHOR" --from "$OPERATOR"

# The hoard: WETH wrapped by the operator, USDC written into Circle's balance slot (9), fork only.
WETH_AMT=$(cast to-wei "${CASTLE_WETH:-0.5}")
tx "$(ext weth)" "deposit()" --value "$WETH_AMT" --from "$OPERATOR"
tx "$(ext weth)" "transfer(address,uint256)" "$CASTLE" "$WETH_AMT" --from "$OPERATOR"
cast rpc anvil_setStorageAt "$(ext usdc)" "$(cast index address "$CASTLE" 9)" "$(cast to-uint256 "${CASTLE_USDC:-1250000000}")" --rpc-url "$RPC" >/dev/null
for id in fee fi fo fum; do cast rpc anvil_setBalance "$(crew $id)" 0xde0b6b3a7640000 --rpc-url "$RPC" >/dev/null; done   # 1 ETH each, fork only

jq --arg c "$CASTLE" --arg f "$FENCE" --arg r "$REG" --arg s "$RES" \
  '.contracts = (.contracts + {castle: $c, extruction: $f, agentRegistry: $r, agentResolver: $s}) | .note = "LOCAL anvil fork rehearsal, not Sepolia"' "$DEP" > "$OUT"
echo "castle $CASTLE (fence $FENCE; live registry $REG, resolver $RES, router $ROUTER; anchor $ANCHOR) on $RPC; wrote $OUT"
