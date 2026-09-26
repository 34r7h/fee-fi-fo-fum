#!/usr/bin/env bash
# p3-fo on an anvil fork of LIVE Sepolia state (cost rule: no live txs): a withheld seal makes Castle.renew revert.
# The crew runs from an isolated copy of agents/ in FORK_WORK, anvil mines every 2s, fo seals on :FO_PORT with
# FO_STALE_QUOTES_S=60 and posts incidents to the handoff channel fee-fi-fo-fum-rehearsal.
#   1. fi re-claims the lapsed castle, ships once, and renews at 90s with fo's seal although its book is >60s old
#      (no re-ship timer, no hang: the book is current until the ENS anchor moves)
#   2. kill -9 fi; fee (standby, FEE_STAGE_HANG=1, heartbeat on) claims and never ships
#   3. fo calls it a hang (epoch >60s without a ship, heartbeat fresh), withholds and posts the incident
#   4. fee forges its own seal (FEE_FORCE_RENEW=1): Castle.renew reverts BadAttestation, mined
#   5. the lease runs out and fi (restarted) claims
# fi and fee send real agent_heartbeats (fo's hang test reads them) and hold the fee/fi inbox leases while the run
# lasts, so this refuses to run while the live crew does, and no crew may start until it ends.
#   ./scripts/withhold-fork.sh     env: ANVIL_PORT (18746), FO_PORT (8712), FORK_URL, FORK_WORK
set -uo pipefail
AGENTS=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$AGENTS/.." && pwd)
PORT=${ANVIL_PORT:-18746}   # not 8745: that is local-castle.sh's
RPC=http://127.0.0.1:$PORT
FORK_URL=${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}
T=${TMPDIR:-/tmp}; WORK=${FORK_WORK:-${T%/}/feefifofum-withhold-fork}
W=$WORK/repo
export SEPOLIA_RPC_URL=$RPC FO_PORT=${FO_PORT:-8712} INCIDENT_CHANNEL=fee-fi-fo-fum-rehearsal

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
lines() { wc -l < "$1" | tr -d ' '; }
start() { local id=$1; shift; env "$@" nohup node run.mjs "$id" >> "logs/$id.log" 2>&1 & echo $! > "logs/$id.pid"; track $! "run.mjs $id"; }
lease_state() { node --input-type=module -e "import { loadEnv } from './lib/env.mjs'; import { publicClient } from './lib/chain.mjs'; import { readLease } from './lib/lease.mjs'; loadEnv(); const l = await readLease(publicClient()); console.log(l.state, l.holder, l.secondsLeft);"; }

for id in fee fi fo fum; do
  f=$AGENTS/logs/$id.pid
  [ -f "$f" ] && mine "$(cat "$f")" "run.mjs $id" && { echo "the live crew's $id is running (pid $(cat "$f")): stop it first (scripts/down.sh)" >&2; exit 1; }
done
mkdir -p "$WORK"; stop_all > /dev/null; rm -f "$WORK/started"
for p in "$PORT" "$FO_PORT"; do [ -z "$(listener "$p")" ] || { echo "127.0.0.1:$p is taken by pid $(listener "$p"); set ANVIL_PORT / FO_PORT" >&2; exit 1; }; done
trap stop_all EXIT; trap 'exit 130' INT TERM

rm -rf "$W"; mkdir -p "$W/contracts"
rsync -a --exclude logs --exclude node_modules --exclude .local --exclude .env "$AGENTS" "$W/"
cp -R "$ROOT/contracts/deployments" "$ROOT/contracts/out-abi" "$W/contracts/"
ln -s "$AGENTS/node_modules" "$W/agents/node_modules"
mkdir -p "$W/agents/logs"; cd "$W/agents" || exit 1

say "command: $0 (anvil --fork-url $FORK_URL --port $PORT --block-time 2; crew in $W)"
nohup anvil --fork-url "$FORK_URL" --port "$PORT" --block-time 2 > "$WORK/anvil.log" 2>&1 &
track $! "anvil --fork-url $FORK_URL --port $PORT"; ANVIL=$!
for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done
listens "$ANVIL" "$PORT" || fail "this run's anvil is not the one listening on $PORT: $(head -2 "$WORK/anvil.log")"
say "fork of live Sepolia at block $(cast block-number --rpc-url "$RPC" | awk '{print $1}'); lease: $(lease_state)"

start fo CREW_OFFLINE=1 FO_STALE_QUOTES_S=60
wait_for logs/fo.log '"event":"attester-listening"' 30 || fail "fo did not come up: $(tail -2 logs/fo.log | cut -c1-200)"
listens "$(cat logs/fo.pid)" "$FO_PORT" || fail "fo is not the one listening on $FO_PORT"
start fi SHIP_RANGE_BPS=100000000
wait_for logs/fi.log '"event":"shipped"' 120 || fail "fi did not claim and ship"
say "1. fi claimed: $(grab logs/fi.log '"event":"claimed"' | jq -c '{tx, gapS}')"
say "   fi shipped: $(grab logs/fi.log '"event":"shipped"' | grep -o '"docked":[0-9]*\|"centreVsEnsBps":[0-9-]*' | tr '\n' ' ')"
wait_for logs/fi.log '"fn":"renew"' 130 || fail "fi did not renew"
say "   fi renewed with fo's seal: $(grab logs/fi.log '"fn":"renew"' | jq -r .hash)"
say "   fo on that seal: $(grep '"event":"attested"' logs/fo.log | tail -1 | jq -c '{requester, quotesAgeS, deviationBps}')"
say "   fi ships so far: $(grep -c '"event":"shipped"' logs/fi.log) (no re-ship timer); fo withheld so far: $(grep -c '"event":"withheld"' logs/fo.log)"

kill -9 "$(cat logs/fi.pid)"; rm -f logs/fi.pid; say "2. kill -9 fi"
start fee FEE_STANDBY=1 FEE_STAGE_HANG=1 FEE_FORCE_RENEW=1
wait_for logs/fee.log '"event":"claimed"' 200 || fail "fee did not claim"
say "   fee claimed (hangs: heartbeat on, no ships): $(grab logs/fee.log '"event":"claimed"' | jq -c '{tx, gapS}')"
wait_for logs/fo.log '"event":"incident-posted"' 150 || fail "fo posted no incident"
say "3. fo incident: $(grep -m1 '"event":"incident-posted"' logs/fo.log | jq -c '{kind, channel, envelope, delivered}')"
wait_for logs/fo.log '"event":"withheld","reason":"trader-hang"' 120 || fail "fo did not withhold"
say "   fo withheld: $(grep -m1 '"event":"withheld","reason":"trader-hang"' logs/fo.log | jq -c '{reason, requester, heartbeatAgeS, quotesAgeS, staleQuotesS}')"
wait_for logs/fee.log '"event":"forced-renew"' 60 || fail "fee did not force a renew"
say "4. fee's forged renew: $(grab logs/fee.log '"event":"forced-renew"' | jq -c '{withheld, mined, ok, reason, tx}')"
F=$(grab logs/fee.log '"event":"forced-renew"' | jq -r .tx)
say "   trace: $(cast run "$F" --rpc-url "$RPC" 2>&1 | grep -m1 -oE 'Revert\] [A-Za-z]+\([^)]*\)')"
FI=$(lines logs/fi.log)
start fi SHIP_RANGE_BPS=100000000
wait_for logs/fi.log '"event":"claimed"' 200 "$FI" || fail "fi did not take over"
say "5. fi took over: $(grab logs/fi.log '"event":"claimed"' "$FI" | jq -c '{tx, gapS}')"
say "lease: $(lease_state)"
stop_all
say "done; logs in $W/agents/logs"
