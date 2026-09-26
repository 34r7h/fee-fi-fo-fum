#!/usr/bin/env bash
# The Castle v3 demo on an anvil fork of LIVE Sepolia state (cost rule: no live txs), against the deployed v3 castle
# (deployments contracts.castle). The crew runs offline (CREW_OFFLINE=1) from an isolated copy of agents/ in FORK_WORK,
# anvil mines every 2s, and only fork state is touched: crew gas, the castle's hoard and the taker's USDC are set with
# anvil cheats.
#   1. genesis: fee (FEE_GENESIS=1) claims the unclaimed v3 castle, ships its book, and keeps a heartbeat co-signed by fo
#   2. fills: a live fill that brings the heartbeat, and a wind-down fill that leaves it out (worse price, USDC in only)
#   3. kill -9 fee: its heartbeat expires, fi challenge()s the silent holder, nobody respond()s, and fi claims EARLY
#      (a new epoch), ships (docking fee's book) and heartbeats; fee's old book reverts FeeFiFoFum(); fi's book fills
#   4. respond: fee comes back as standby and challenges fi, and fi answers with respond() inside the 60s window
#   5. fum: fi's early claim is a rotation, so fum opens the shift-change CCA; fo bids the graduation minimum, fum settles
# With SVC=1 the castle service (service/) runs on :SVC_PORT against the fork and the heartbeat travels through it.
#   ./scripts/v3-fork.sh     env: ANVIL_PORT (18821), FO_PORT (8721), SVC_PORT (18822), SVC (0), FORK_URL, FORK_WORK
set -uo pipefail
AGENTS=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$AGENTS/.." && pwd)
PORT=${ANVIL_PORT:-18821}
RPC=http://127.0.0.1:$PORT
SVC=${SVC:-0}; SVC_PORT=${SVC_PORT:-18822}
FORK_URL=${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}
T=${TMPDIR:-/tmp}; WORK=${FORK_WORK:-${T%/}/feefifofum-v3-fork}
W=$WORK/repo
export SEPOLIA_RPC_URL=$RPC CREW_OFFLINE=1 CASTLE_VERSION=3 FO_PORT=${FO_PORT:-8721} INCIDENT_CHANNEL=fee-fi-fo-fum-rehearsal
# Demo pacing: a beat every ~20s that lives 60s, and a challenge 15s after the last one expired.
export HEARTBEAT_TTL_S=${HEARTBEAT_TTL_S:-60} HEARTBEAT_REFRESH_S=${HEARTBEAT_REFRESH_S:-40} CHALLENGE_SILENT_S=${CHALLENGE_SILENT_S:-15}
export SHIP_RANGE_BPS=${SHIP_RANGE_BPS:-100000000} SHIP_MAX_WETH=${SHIP_MAX_WETH:-10000000000000000} SHIP_MAX_USDC=${SHIP_MAX_USDC:-20000000}
if [ "$SVC" = 1 ]; then export CASTLE_SERVICE_URL=http://127.0.0.1:$SVC_PORT; else export CASTLE_SERVICE_URL=off; fi

say() { echo "[$(date -u +%H:%M:%S)] $*"; }
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
}
fail() { say "FAIL: $*"; exit 1; }
listener() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1; }
listens() { lsof -a -p "$1" -iTCP:"$2" -sTCP:LISTEN >/dev/null 2>&1; }
# The crew must never outlive this run's anvil: whatever takes the port next is someone else's chain.
guard() { [ -z "${ANVIL:-}" ] || kill -0 "$ANVIL" 2>/dev/null || fail "this run's anvil (pid $ANVIL) died; the crew stops before it reaches whatever takes :$PORT next"; }
wait_for() { local f=$1 re=$2 secs=$3 from=${4:-0}; for _ in $(seq 1 $((secs/2))); do guard; tail -n +$((from+1)) "$f" 2>/dev/null | grep -qE "$re" && return 0; sleep 2; done; return 1; }
grab() { tail -n +$((${3:-0}+1)) "$1" | grep -m1 -E "$2"; }
lines() { wc -l < "$1" 2>/dev/null | tr -d ' ' || echo 0; }
start() { local id=$1; shift; env "$@" nohup node run.mjs "$id" >> "logs/$id.log" 2>&1 & echo $! > "logs/$id.pid"; track $! "run.mjs $id"; }
crew() { jq -r ".agents.$1.address" crew.json; }
lease_state() { node --input-type=module -e "import { loadEnv } from './lib/env.mjs'; import { publicClient } from './lib/chain.mjs'; import { readLease } from './lib/lease.mjs'; loadEnv(); const l = await readLease(publicClient()); console.log(JSON.stringify({ state: l.state, holder: l.holder, epoch: String(l.epoch), secondsLeft: l.secondsLeft, challenge: l.challenge }));"; }
jack() { node scripts/jack.mjs --as fo "$@" 2>&1 | tail -1; }
usdc_to() { cast rpc anvil_setStorageAt "$USDC" "$(cast index address "$1" 9)" "$(cast to-uint256 "$2")" --rpc-url "$RPC" >/dev/null; }

mkdir -p "$WORK"; stop_all > /dev/null; rm -f "$WORK/started"
for p in "$PORT" "$FO_PORT" $([ "$SVC" = 1 ] && echo "$SVC_PORT"); do [ -z "$(listener "$p")" ] || { echo "127.0.0.1:$p is taken by pid $(listener "$p"); set ANVIL_PORT / FO_PORT / SVC_PORT" >&2; exit 1; }; done
trap stop_all EXIT; trap 'exit 130' INT TERM

rm -rf "$W"; mkdir -p "$W/contracts"
rsync -a --exclude logs --exclude node_modules --exclude .local --exclude .env "$AGENTS" "$W/"
cp -R "$ROOT/contracts/deployments" "$ROOT/contracts/out-abi" "$W/contracts/"
ln -s "$AGENTS/node_modules" "$W/agents/node_modules"
mkdir -p "$W/agents/logs"; cd "$W/agents" || exit 1

say "command: $0 (anvil --fork-url $FORK_URL --port $PORT --block-time 2; crew in $W; heartbeat via ${CASTLE_SERVICE_URL})"
nohup anvil --fork-url "$FORK_URL" --port "$PORT" --block-time 2 > "$WORK/anvil.log" 2>&1 &
track $! "anvil --fork-url $FORK_URL --port $PORT"; ANVIL=$!
for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done
listens "$ANVIL" "$PORT" || fail "this run's anvil is not the one listening on $PORT: $(head -2 "$WORK/anvil.log")"
CASTLE=$(jq -r '.contracts.castle.address // .contracts.castle' ../contracts/deployments/sepolia.json)
WETH=$(jq -r .external.weth ../contracts/deployments/sepolia.json); USDC=$(jq -r .external.usdc ../contracts/deployments/sepolia.json)
say "fork of live Sepolia at block $(cast block-number --rpc-url "$RPC"); v3 castle $CASTLE; lease: $(lease_state)"

# Fork only: gas for the crew, a hoard for the castle (0.05 WETH, 100 USDC) and 20 USDC for the taker (fo).
for id in fee fi fo fum; do cast rpc anvil_setBalance "$(crew $id)" 0xde0b6b3a7640000 --rpc-url "$RPC" >/dev/null; done
FUNDER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cast send "$WETH" "deposit()" --value 50000000000000000 --from "$FUNDER" --unlocked --rpc-url "$RPC" >/dev/null
cast send "$WETH" "transfer(address,uint256)" "$CASTLE" 50000000000000000 --from "$FUNDER" --unlocked --rpc-url "$RPC" >/dev/null
usdc_to "$CASTLE" 100000000; usdc_to "$(crew fo)" 20000000
say "fork only: castle holds $(cast call "$WETH" "balanceOf(address)(uint256)" "$CASTLE" --rpc-url "$RPC" | awk '{print $1}') wei WETH and $(cast call "$USDC" "balanceOf(address)(uint256)" "$CASTLE" --rpc-url "$RPC" | awk '{print $1}') USDC units; anchor $(cast call "$CASTLE" "anchorPriceQ96()(uint256)" --rpc-url "$RPC" | awk '{print $1}')"

if [ "$SVC" = 1 ]; then
  (cd "$ROOT/service" && exec env SEPOLIA_RPC_URL="$RPC" SEPOLIA_RPC_URL_FALLBACK= PORT="$SVC_PORT" CASTLE_VERSION=3 CASTLE_DATA_DIR="$WORK/svc-data" nohup node src/server.mjs > "$WORK/svc.log" 2>&1) &
  track $! "src/server.mjs"; SVCPID=$!
  for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$SVC_PORT/health" >/dev/null && break; sleep 1; done
  listens "$SVCPID" "$SVC_PORT" || fail "this run's castle service is not the one listening on $SVC_PORT: $(tail -2 "$WORK/svc.log")"
  say "castle service on :$SVC_PORT (CASTLE_VERSION=3)"
fi

# ---- 1. genesis
start fo
wait_for logs/fo.log '"event":"attester-listening"' 30 || fail "fo did not come up: $(tail -2 logs/fo.log | cut -c1-200)"
listens "$(cat logs/fo.pid)" "$FO_PORT" || fail "fo is not the one listening on $FO_PORT"
start fee FEE_GENESIS=1
wait_for logs/fee.log '"event":"genesis-claim"' 60 || fail "fee did not claim genesis"
say "1. fee genesis claim: $(grab logs/fee.log '"event":"genesis-claim"' | jq -c '{ok, tx, reason}')"
wait_for logs/fee.log '"event":"shipped"' 60 || fail "fee did not ship"
say "   fee shipped: $(grab logs/fee.log '"event":"shipped"' | jq -c '{tx, docked, centreVsEnsBps, fenceEpochOk}')"
wait_for logs/fee.log '"event":"heartbeat"' 60 || fail "fee has no co-signed heartbeat: $(grep -m1 heartbeat-withheld logs/fee.log | cut -c1-240)"
say "   fee heartbeat (co-signed by fo): $(grab logs/fee.log '"event":"heartbeat"' | jq -c '{epoch, validUntil, ttlS, published}'); lease: $(lease_state)"
start fi
FEE_BOOK=$(grab logs/fee.log '"event":"shipped"' | jq -r '.strategyHash // .strategy // empty')

# ---- 2. fills, with and without the heartbeat
say "2. live fill (brings the heartbeat): $(jack --in USDC --amount 1000000 | jq -c "{status, heartbeat, amountOut, reason, tx, gasUsed}")"
say "   wind-down fill (no heartbeat, USDC in): $(jack --in USDC --amount 1000000 --heartbeat none | jq -c "{status, heartbeat, amountOut, reason, tx, gasUsed}")"

# ---- 3. kill -9 fee: silence, challenge, early claim
kill -9 "$(cat logs/fee.pid)"; rm -f logs/fee.pid; KILLED=$(date -u +%H:%M:%S); say "3. kill -9 fee (the holder) at $KILLED"
wait_for logs/fi.log '"event":"challenge-sent"' 240 || fail "fi did not challenge the silent holder: $(tail -2 logs/fi.log | cut -c1-240)"
say "   fi challenged: $(grab logs/fi.log '"event":"challenge-sent"' | jq -c '{tx, lastValidUntil, silentForS, deadline, source}')"
say "   fill on fee's book with its expired heartbeat (wind-down): $(jack --in USDC --amount 1000000 | jq -c '{status, heartbeat, amountOut, reason, tx}')"
wait_for logs/fi.log '"event":"claimed"' 120 || fail "fi did not claim after the unanswered challenge"
say "   fi claimed EARLY: $(grab logs/fi.log '"event":"claimed"' | jq -c '{tx, early, gapS, newEpoch, previousEpoch}')"
start fum FUM_LOT_WETH=${FUM_LOT_WETH:-5000000000000000}
say "   fee's old book after the claim (--force, mined): $(jack --in USDC --amount 1000000 --strategy "${FEE_BOOK:-previous}" --heartbeat none --force | jq -c '{status, reason, tx}')"
wait_for logs/fi.log '"event":"shipped"' 90 || fail "fi did not ship"
say "   fi shipped: $(grab logs/fi.log '"event":"shipped"' | jq -c '{tx, docked, centreVsEnsBps, fenceEpochOk}')"
wait_for logs/fi.log '"event":"heartbeat"' 60 || fail "fi has no co-signed heartbeat"
say "   fi heartbeat: $(grab logs/fi.log '"event":"heartbeat"' | jq -c '{epoch, validUntil, published}')"
say "   live fill on fi's book: $(jack --in USDC --amount 1000000 | jq -c '{status, heartbeat, amountOut, reason, tx}')"

# ---- 4. a live holder answers a challenge
FEE0=$(lines logs/fee.log)
start fee FEE_STANDBY=1
sleep 4
say "4. fee (standby) challenges fi: $(node scripts/challenge.mjs --as fee 2>&1 | tail -1 | jq -c '{event, tx, reason, deadline}')"
wait_for logs/fi.log '"event":"responded"' 70 || fail "fi did not respond"
say "   fi responded: $(grab logs/fi.log '"event":"responded"' | jq -c '{tx, deadline}'); lease: $(lease_state)"

# ---- 5. fum's shift-change CCA on v3
if wait_for logs/fum.log '"event":"auction-opened"' 120; then
  O=$(grab logs/fum.log '"event":"auction-opened"'); say "5. fum opened: $(echo "$O" | jq -c '{tx, auction, lotWeth, floorUsdcPerWeth, endBlock}')"
  say "   fo bids the minimum: $(node scripts/bid.mjs --as fo --label fo --amount min 2>&1 | tail -1 | cut -c1-300)"
  wait_for logs/fum.log '"event":"settled"' 200 || fail "fum did not settle"
  say "   fum settled: $(grab logs/fum.log '"event":"settled"' | jq -c '{tx, usdcPerWeth, raised, priceWritten, anchorIsClearing}')"
else
  say "5. fum opened no auction: $(grep -E '"event":"(no-rotation|rotation-not-fresh|awaiting-new-book|no-free-weth|tx-skipped)"' logs/fum.log | tail -1 | cut -c1-240)"
fi
say "lease: $(lease_state)"
say "fo co-signed $(grep -c '"event":"cosigned"' logs/fo.log) heartbeats and withheld $(grep -c '"event":"heartbeat-withheld"' logs/fo.log) times"
stop_all
say "done; logs in $W/agents/logs"
