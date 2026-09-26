#!/usr/bin/env bash
# The failover demo, rehearsed end to end on a fresh anvil-fork castle (scripts/local-castle.sh), so the live
# run on Sepolia (p3-failover-e2e) spends ETH only once. Prints each step's evidence from the crew's logs.
#
#   ./scripts/rehearse.sh failover   genesis claim, fee ships a book centred on the ENS anchor, renewals with fo's
#                                    seal, kill -9 fee, fi claims a new epoch within one lease period (docking fee's
#                                    book) and ships its own, then fee restarts stale and its renew reverts on-chain
#   ./scripts/rehearse.sh withhold   fee hangs (heartbeat on, no ships), so fo withholds (trader-hang) and posts an
#                                    incident; fee forges its own seal and Castle rejects it (BadAttestation); fi
#                                    takes over
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=${1:-failover}
LEASE=${LEASE_PERIOD:-120}

# wait_for <log> <extended regex> <seconds>: print the first new matching line, or fail the rehearsal.
wait_for() {
  local log=$1 re=$2 t=$3 from=${4:-0} line
  for _ in $(seq 1 "$t"); do
    line=$(tail -n +"$((from + 1))" "$log" 2>/dev/null | grep -m1 -E "$re" || true)
    if [ -n "$line" ]; then echo "$line" | cut -c1-300; return 0; fi
    sleep 1
  done
  echo "FAIL: no /$re/ in $log within ${t}s" >&2; exit 1
}
lines() { wc -l < "$1" 2>/dev/null | tr -d ' ' || echo 0; }

./scripts/down.sh >/dev/null
mkdir -p logs/rehearsals
stamp=$(date -u +%Y%m%dT%H%M%SZ)
for id in fee fi fo fum; do [ -f "logs/$id.log" ] && mv "logs/$id.log" "logs/rehearsals/$id.$stamp.log"; done
# A fresh fork every time: castle.feefifofum.eth is one label in the live registry, so a castle from an earlier
# run would still hold it.
./scripts/local-castle.sh --stop >/dev/null
./scripts/local-castle.sh
if [ "$MODE" = withhold ]; then export FEE_STAGE_HANG=1 FEE_FORCE_RENEW=1 FO_STALE_QUOTES_S=${FO_STALE_QUOTES_S:-60}; fi
eval "$(./scripts/local-castle.sh --env)"
./scripts/up.sh >/dev/null

echo "== genesis: fee claims the castle"
wait_for logs/fee.log '"event":"genesis-claim","ok":true' 60

if [ "$MODE" = failover ]; then
  echo "== fee ships; the program's centre must equal the ENS anchor (centreVsEnsBps 0) and its fence the live epoch"
  wait_for logs/fee.log '"event":"shipped".*"centreVsEnsBps":0,"fenceEpochOk":true' 60
  echo "== fee renews with fo's seal (two in a row)"
  wait_for logs/fee.log '"event":"tx","fn":"renew"' $((LEASE + 30))
  n=$(lines logs/fee.log)
  wait_for logs/fee.log '"event":"tx","fn":"renew"' $((LEASE + 30)) "$n"
  echo "== kill -9 fee"
  kill -9 "$(cat logs/fee.pid)"; rm -f logs/fee.pid
  echo "== fi claims after expiry (gapS = seconds between expiry and the claim; must be < $LEASE)"
  wait_for logs/fi.log '"event":"claimed".*"docked":[1-9]' $((LEASE + 60))
  echo "== fi ships its own book in the new epoch"
  wait_for logs/fi.log '"event":"shipped".*"centreVsEnsBps":0,"fenceEpochOk":true' 60
  echo "== fee restarts from stale state; its renew is sent unsimulated and reverts on-chain"
  FEE_STALE=1 ./scripts/up.sh fee >/dev/null
  wait_for logs/fee.log '"event":"stale-renew"' 90
  wait_for logs/fee.log '"event":"tx-reverted","fn":"renew"' 5
  ./scripts/down.sh fee >/dev/null; ./scripts/up.sh fee >/dev/null   # back to an honest standby
else
  echo "== fo withholds: no ships in the live epoch, heartbeat fresh (trader-hang)"
  wait_for logs/fo.log '"event":"withheld".*trader-hang' $((LEASE + 90))
  wait_for logs/fo.log '"event":"incident-posted"' 30
  echo "== fee forges its own seal; Castle takes only fo's (BadAttestation)"
  wait_for logs/fee.log '"event":"forced-renew"' 60
  echo "== the lease runs out and fi claims"
  wait_for logs/fi.log '"event":"claimed"' $((LEASE + 60))
fi
echo "REHEARSAL $MODE PASSED ($(date -u +%H:%M:%SZ)); logs of this run: agents/logs/{fee,fi,fo}.log"
