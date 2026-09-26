#!/usr/bin/env bash
# The feefifofum demo (docs/SPEC.md "Demo") on an anvil fork of LIVE Sepolia, with the real crew and the real castle
# service (cost rule: no live tx). Every tx lands on the fork only: the contracts are deployed there by
# scripts/fork-deploy.mjs (impersonated deployer, owner and registrar), and the crew signs with its own keys against
# the fork RPC, which never falls back to a public one (lib/chain.mjs). The crew runs offline (CREW_OFFLINE=1): no
# agent_heartbeat and no listener, so the live agents' liveness and inboxes are untouched.
#   0. the contracts: on a fork taken after c-deploy (the default), the deployed ones, with the resolver's gateway
#      pointed at this run's service; on an older fork, deployed fresh (scripts/fork-deploy.mjs). The hoard is funded
#      as the treasury will fund it (5 USDC plus 5/mid WETH, fork cheats), and agy holds USDC
#   1. fum sets leverage 2x and the caps; fi ships harp and hen at 80% of the hoard each; fi ships greedy (0.5x more),
#      which reverts OverAllocated on-chain, and the service records the refusal from fi's report
#   2. agy (the Jack, impersonated) resolves quote.feefifofum.eth by CCIP-Read through UniversalResolverV2 and fills
#      the harp quote through the router
#   3. agy swaps USDC for WETH on the v4 pool (PoolSwapTest); the hook fills it just in time from hen; fee sees hen's
#      curve drift from the mid and fi re-centres hen
#   4. fo routes a UniswapX-format order (castle_route) to the better of harp and v4, and agy sends the calls
#   5. the step-2 quote, 31 s later, reverts QuoteExpired (recorded through castle_fill {tx_hash})
#   6. the service's gateway, MCP tools, /stream, /state and /health checked (service/test/gateway-fork.mjs)
#   7. (STRESS=1) stress, outside the demo: a harp fill sized so committed WETH passes balance x leverage while hen
#      alone would fit; fum docks harp (greedy is not live, so harp is the lowest priority) and stops
# The record (each step's JSON, the crew's logs, the stream) lands in RECORD if set.
# The Jack's fills are FILL (0.5 USDC) each, as in the live run.
#   ./scripts/crew-fork.sh    env: ANVIL_PORT (18841), SVC_PORT (18842), FO_PORT (18843), FORK_URL, FORK_WORK,
#                                  ARTIFACTS (contracts/out, for a fresh deploy), FILL (500000), STRESS (1),
#                                  RECORD (a directory for the run's record)
set -uo pipefail
AGENTS=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$AGENTS/.." && pwd)
PORT=${ANVIL_PORT:-18841}; RPC=http://127.0.0.1:$PORT
SVC_PORT=${SVC_PORT:-18842}; SVC=http://127.0.0.1:$SVC_PORT
FO_PORT=${FO_PORT:-18843}
FORK_URL=${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}
ARTIFACTS=${ARTIFACTS:-$ROOT/contracts/out}
T=${TMPDIR:-/tmp}; WORK=${FORK_WORK:-${T%/}/feefifofum-crew-fork}
RECORD=${RECORD:-}
FILL=${FILL:-500000}; STRESS=${STRESS:-1}
FI_KEY=${FI_KEY_PATH:-$HOME/.handoff/agents/fi/sepolia.key}
export SEPOLIA_RPC_URL=$RPC SEPOLIA_RPC_URL_FALLBACK= SEPOLIA_RPC_URL_FALLBACK_2= CREW_OFFLINE=1 FO_PORT HEARTBEAT_MS=10000
export DEPLOYMENTS_PATH=$WORK/deployments.json CASTLE_SERVICE_URL=$SVC

say() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$WORK/run.log"; }
# Only processes this run started are ever killed: each is recorded with a string its command line must still hold.
mine() { ps -p "$1" -o command= 2>/dev/null | grep -qF -- "$2"; }
track() { echo "$1 $2" >> "$WORK/started"; }
stop_all() {
  trap - EXIT
  [ -f "$WORK/started" ] || return 0
  local p tag left=0
  while read -r p tag; do mine "$p" "$tag" && kill "$p" 2>/dev/null; done < "$WORK/started"
  sleep 2
  while read -r p tag; do mine "$p" "$tag" && left=$((left + 1)); done < "$WORK/started"
  say "stopped: $left of this run's processes still up"
  rm -f "$WORK/started"
}
fail() { say "FAIL: $*"; exit 1; }
listener() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1; }
listens() { lsof -a -p "$1" -iTCP:"$2" -sTCP:LISTEN >/dev/null 2>&1; }
# The crew must never outlive this run's anvil: whatever takes the port next is someone else's chain.
guard() { [ -z "${ANVIL:-}" ] || kill -0 "$ANVIL" 2>/dev/null || fail "this run's anvil (pid $ANVIL) died; stopping the crew before it reaches whatever takes :$PORT next"; }
wait_for() { local f=$1 re=$2 secs=$3; for _ in $(seq 1 $((secs / 2))); do guard; grep -qE "$re" "$f" 2>/dev/null && return 0; sleep 2; done; return 1; }
grab() { grep -m1 -E "$2" "$1"; }
start() { local id=$1; shift; (cd "$AGENTS" && exec env "$@" nohup node run.mjs "$id" >> "$WORK/logs/$id.log" 2>&1) & track $! "run.mjs $id"; }
state() { curl -sf "$SVC/state"; }
jack() { local name=$1; shift; guard; (cd "$AGENTS" && node scripts/jack.mjs "$@" 2>&1) | tail -1 | tee "$WORK/steps/$name.json"; }

mkdir -p "$WORK"; stop_all > /dev/null
for p in "$PORT" "$SVC_PORT" "$FO_PORT"; do [ -z "$(listener "$p")" ] || { echo "127.0.0.1:$p is taken by pid $(listener "$p"); set ANVIL_PORT / SVC_PORT / FO_PORT" >&2; exit 1; }; done
[ -f "$FI_KEY" ] || { echo "no fi key at $FI_KEY: the service signs quotes with it" >&2; exit 1; }
rm -rf "$WORK/logs" "$WORK/steps" "$WORK/svc-data" "$WORK/run.log" "$WORK/deployments.json"; mkdir -p "$WORK/logs" "$WORK/steps"
trap stop_all EXIT; trap 'exit 130' INT TERM

say "command: $0 (anvil --fork-url $FORK_URL --port $PORT; service :$SVC_PORT; fo :$FO_PORT; work $WORK)"
nohup anvil --fork-url "$FORK_URL" --port "$PORT" > "$WORK/anvil.log" 2>&1 &
track $! "anvil --fork-url $FORK_URL --port $PORT"; ANVIL=$!
for _ in $(seq 1 60); do curl -sf -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' "$RPC" >/dev/null && break; sleep 0.5; done
listens "$ANVIL" "$PORT" || fail "this run's anvil is not the one listening on $PORT: $(head -2 "$WORK/anvil.log")"

# ---- 0. deploy onto the fork
(cd "$AGENTS" && node scripts/fork-deploy.mjs --rpc "$RPC" --gateway "$SVC" --out "$DEPLOYMENTS_PATH" --artifacts "$ARTIFACTS") > "$WORK/steps/0-deploy.json" 2> "$WORK/logs/fork-deploy.err" || fail "fork-deploy: $(tail -3 "$WORK/logs/fork-deploy.err")"
say "0. contracts on the fork: $(jq -c '{mode, forkBlock, chainlink, vault, resolver, hook, poolId, hoard, gas}' "$WORK/steps/0-deploy.json")"

(cd "$ROOT/service" && exec env SEPOLIA_RPC_URL="$RPC" SEPOLIA_RPC_URL_FALLBACK= PORT="$SVC_PORT" CASTLE_DEPLOYMENTS="$DEPLOYMENTS_PATH" \
  CASTLE_FI_KEY_PATH="$FI_KEY" CASTLE_DATA_DIR="$WORK/svc-data" CASTLE_POLL_SECONDS=2 CASTLE_PUBLIC_URL="$SVC" FO_URL="http://127.0.0.1:$FO_PORT" \
  nohup node src/server.mjs > "$WORK/logs/service.log" 2>&1) &
track $! "src/server.mjs"; SVCPID=$!
for _ in $(seq 1 30); do curl -sf "$SVC/health" >/dev/null && break; sleep 1; done
listens "$SVCPID" "$SVC_PORT" || fail "this run's castle service is not the one listening on $SVC_PORT: $(tail -2 "$WORK/logs/service.log")"
say "   castle service: $(curl -sf "$SVC/health" | jq -c '{ok, fi, vault}')"

# ---- 1. the crew: fum's limits, fi's two strategies, greedy refused
start fum; start fee; start fo; start fi FI_GREEDY=1
wait_for "$WORK/logs/fo.log" '"event":"listening"' 30 || fail "fo did not come up: $(tail -2 "$WORK/logs/fo.log" | cut -c1-200)"
wait_for "$WORK/logs/fum.log" '"event":"ledger"' 60 || fail "fum did not configure the vault: $(tail -2 "$WORK/logs/fum.log" | cut -c1-240)"
say "1. fum: $(grep '"fn":"set[A-Za-z]*"' "$WORK/logs/fum.log" | jq -c '{fn, tx: .hash, gasUsed}' | tr '\n' ' ')"
wait_for "$WORK/logs/fi.log" '"event":"shipped","strategy":"hen"' 90 || fail "fi did not ship hen: $(tail -2 "$WORK/logs/fi.log" | cut -c1-240)"
say "   fi shipped: $(grep '"event":"shipped"' "$WORK/logs/fi.log" | jq -c '{strategy, slot, tx, weth, usdc}' | tr '\n' ' ')"
wait_for "$WORK/logs/fi.log" '"event":"greedy-[a-z]*"' 60 || fail "fi did not try greedy"
say "   fi greedy (0.5x more, manual gas): $(grab "$WORK/logs/fi.log" '"event":"greedy-[a-z]*"' | jq -c '{event, tx, reason}')"
for _ in $(seq 1 15); do state | jq -e '.refusals | length > 0' >/dev/null && break; sleep 2; done
say "   the stream's refusal: $(state | jq -c '.refusals[-1] | {label, error, errorArgs, tx}')"

# ---- 2. the harp sings: CCIP-Read, then router.swap
for _ in $(seq 1 30); do state | jq -e '.price.mid' >/dev/null && break; sleep 2; done
say "2. harp quote by CCIP-Read, filled: $(jack 2-harp quote USDC WETH "$FILL" --save "$WORK/steps/q1.json" | jq -c '{quoteId, signer, amountIn, amountOut, validUntil, tx, status, received}')"

# ---- 3. the hen lays: v4 swap filled just in time
say "3. v4 swap, hook fills from hen: $(jack 3-v4 v4 USDC "$FILL" | jq -c '{tx, status, gasUsed, received, paid}')"
wait_for "$WORK/logs/fi.log" '"event":"recentre"' 60 && say "   fee saw hen drift, fi re-centred: $(grab "$WORK/logs/fi.log" '"event":"recentre"' | jq -c '{mid, henMid, driftBps}')"

# ---- 4. fo routes a UniswapX-format order
sleep 6
say "4. fo routes an order (castle_route): $(jack 4-route route USDC WETH "$FILL" | jq -c '{intent, route, compared, quotedOut, received}')"

# ---- 5. the step-2 quote after it expired
say "5. the same harp quote 31 s later: $(jack 5-stale stale "$WORK/steps/q1.json" | jq -c '{tx, status, revert, recorded: .recorded.recorded}')"

grep -q '"event":"docked"' "$WORK/logs/fum.log" && fail "fum docked during the demo path: $(grab "$WORK/logs/fum.log" '"event":"docked"')"
say "   fum docked nothing on the demo path: $(grep -c '"event":"ledger"' "$WORK/logs/fum.log") ledger checks, 0 docks"

# ---- 6. the service: gateway, tools, stream (while harp is live)
sleep 4
(cd "$ROOT/service" && node test/gateway-fork.mjs --service "$SVC" --rpc "$RPC" --deployments "$DEPLOYMENTS_PATH") > "$WORK/steps/6-service.json" 2>&1
say "6. service checks: $(jq -rs '[.[] | select(.check)] | "\(map(select(.ok)) | length) of \(length) pass: " + (map("\(.check) \(if .ok then "ok" else "FAIL" end)") | join(", "))' "$WORK/steps/6-service.json" 2>/dev/null || tail -3 "$WORK/steps/6-service.json")"

# ---- 7. stress: a fill sized to push committed WETH past balance x leverage; fum docks harp and stops
if [ "$STRESS" = 1 ]; then
  say "7. stress (not in the live run): $(jack 7-stress stress | jq -c '{wethOut, between, harpWeth, henWeth, vaultWeth, amountIn, tx, status}')"
  wait_for "$WORK/logs/fum.log" '"event":"docked"' 60 && say "   fum docked: $(grab "$WORK/logs/fum.log" '"event":"docked"' | jq -c '{strategy, slot, tx, reason}')" || say "   fum did not dock: $(tail -1 "$WORK/logs/fum.log" | cut -c1-240)"
  sleep 10
  say "   after: $(state | jq -c '[.strategies[] | {label, docked}]')"
fi

state > "$WORK/steps/state.json"
cp "$WORK"/svc-data/events-*.jsonl "$WORK/steps/stream.jsonl" 2>/dev/null
say "done: $(jq -c '{seq, hoard, strategies: [.strategies[] | {label, docked, fills}], quotes: (.quotes | length), fills: [.fills[] | {route, label, status}], refusals: (.refusals | length), intents: (.intents | length)}' "$WORK/steps/state.json")"

if [ -n "$RECORD" ]; then
  mkdir -p "$RECORD/logs"
  cp "$WORK/run.log" "$WORK/deployments.json" "$RECORD/"
  cp "$WORK"/steps/*.json "$WORK/steps/stream.jsonl" "$RECORD/" 2>/dev/null
  for id in fee fi fo fum service; do cp "$WORK/logs/$id.log" "$RECORD/logs/"; done
  say "record: $RECORD"
fi
