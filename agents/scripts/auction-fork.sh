#!/usr/bin/env bash
# p3-fum + p2-capabilities on an anvil fork of LIVE Sepolia state (cost rule: no live txs). The crew runs offline
# (CREW_OFFLINE=1) from an isolated copy of agents/ in FORK_WORK, anvil mines every 12s like Sepolia, and the castle
# service (service/) runs on :SVC_PORT against the fork, so its MCP tools see fork state.
#   fi re-claims the lapsed castle (a rotation: prevEpoch = the last live epoch) and ships -> fum opens the
#   shift-change CCA on the free WETH -> an outside agent (BIDDER, agy by default) bids through the MCP tool
#   auction_bid -> if it has not bid by endBlock-10, fo bids the graduation minimum through the same tool
#   (scripts/mcp-bid.mjs) -> fum settles (sweepCurrency, sweepUnsoldTokens, the clearing price written to ENS).
#   ./scripts/auction-fork.sh      env: ANVIL_PORT (18745), SVC_PORT (18790), FO_PORT (8713), FORK_URL, FORK_WORK;
#                                  NOTIFY_AGY=1 HANDOFF_FROM=<your agent id> sends agy the fork's MCP URL
set -uo pipefail
AGENTS=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$AGENTS/.." && pwd)
PORT=${ANVIL_PORT:-18745}
RPC=http://127.0.0.1:$PORT
SVC_PORT=${SVC_PORT:-18790}
MCP=http://127.0.0.1:$SVC_PORT/mcp
FORK_URL=${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}
BIDDER=${BIDDER:-0xDDf2980eFA32E9E15C9D0ece52F4BF32956EAE4c}   # agy.feefifofum.eth
T=${TMPDIR:-/tmp}; WORK=${FORK_WORK:-${T%/}/feefifofum-auction-fork}
W=$WORK/repo
export SEPOLIA_RPC_URL=$RPC CREW_OFFLINE=1 FO_PORT=${FO_PORT:-8713} INCIDENT_CHANNEL=fee-fi-fo-fum-rehearsal
[ "${NOTIFY_AGY:-0}" = 1 ] && [ -z "${HANDOFF_FROM:-}" ] && { echo "NOTIFY_AGY=1 needs HANDOFF_FROM=<your agent id> (handoff send --from)" >&2; exit 1; }

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
start() { local id=$1; shift; env "$@" nohup node run.mjs "$id" >> "logs/$id.log" 2>&1 & echo $! > "logs/$id.pid"; track $! "run.mjs $id"; }
head_block() { cast block-number --rpc-url "$RPC" | awk '{print $1}'; }

mkdir -p "$WORK"; stop_all > /dev/null; rm -f "$WORK/started"
for p in "$PORT" "$SVC_PORT" "$FO_PORT"; do [ -z "$(listener "$p")" ] || { echo "127.0.0.1:$p is taken by pid $(listener "$p"); set ANVIL_PORT / SVC_PORT / FO_PORT" >&2; exit 1; }; done
trap stop_all EXIT; trap 'exit 130' INT TERM

rm -rf "$W" "$WORK/svc-data"; mkdir -p "$W/contracts"
rsync -a --exclude logs --exclude node_modules --exclude .local --exclude .env "$AGENTS" "$W/"
cp -R "$ROOT/contracts/deployments" "$ROOT/contracts/out-abi" "$W/contracts/"
ln -s "$AGENTS/node_modules" "$W/agents/node_modules"
mkdir -p "$W/agents/logs"; cd "$W/agents" || exit 1

say "command: $0 | anvil --fork-url $FORK_URL --port $PORT --block-time 12 | castle service (service/src/server.mjs) on :$SVC_PORT with SEPOLIA_RPC_URL=$RPC"
nohup anvil --fork-url "$FORK_URL" --port "$PORT" --block-time 12 > "$WORK/anvil.log" 2>&1 &
track $! "anvil --fork-url $FORK_URL --port $PORT"; ANVIL=$!
for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done
listens "$ANVIL" "$PORT" || fail "this run's anvil is not the one listening on $PORT: $(head -2 "$WORK/anvil.log")"
(cd "$ROOT/service" && exec env SEPOLIA_RPC_URL="$RPC" SEPOLIA_RPC_URL_FALLBACK= PORT="$SVC_PORT" CASTLE_DATA_DIR="$WORK/svc-data" nohup node src/server.mjs > "$WORK/svc.log" 2>&1) &
track $! "src/server.mjs"; SVC=$!
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$SVC_PORT/health" >/dev/null && break; sleep 1; done
listens "$SVC" "$SVC_PORT" || fail "this run's castle service is not the one listening on $SVC_PORT: $(tail -2 "$WORK/svc.log")"
say "fork of live Sepolia at block $(head_block); service: $(curl -s "http://127.0.0.1:$SVC_PORT/health" | head -c 200)"
# fum keeps 0.001 ETH live after the sweep, less than a CCA open costs; on the fork only, give it gas money.
FUM=$(jq -r .agents.fum.address crew.json)
cast rpc anvil_setBalance "$FUM" 0xB1A2BC2EC50000 --rpc-url "$RPC" >/dev/null && say "fork only: fum balance set to $(cast balance "$FUM" --rpc-url "$RPC" --ether) ETH (anvil_setBalance)"

start fo FO_STALE_QUOTES_S=300
wait_for logs/fo.log '"event":"attester-listening"' 30 || fail "fo did not come up: $(tail -2 logs/fo.log | cut -c1-200)"
listens "$(cat logs/fo.pid)" "$FO_PORT" || fail "fo is not the one listening on $FO_PORT"
start fi SHIP_RANGE_BPS=100000000 SHIP_MAX_WETH=5000000000000000
wait_for logs/fi.log '"event":"claimed"' 90 || fail "fi did not claim"
say "fi claimed (rotation): $(grab logs/fi.log '"event":"claimed"' | jq -c '{tx, newEpoch: (.newEpoch|tostring|.[-4:]), previousEpoch: (.previousEpoch|tostring|.[-4:])}')"
start fum
wait_for logs/fi.log '"event":"shipped"' 90 || fail "fi did not ship"
say "fi shipped: $(grab logs/fi.log '"event":"shipped"' | grep -o '"docked":[0-9]*\|"centreVsEnsBps":[0-9-]*' | tr '\n' ' ')"
wait_for logs/fum.log '"event":"auction-opened"' 120 || fail "fum did not open: $(tail -2 logs/fum.log | cut -c1-200)"
O=$(grab logs/fum.log '"event":"auction-opened"'); AUCTION=$(echo "$O" | jq -r .auction); END=$(echo "$O" | jq -r .endBlock)
OPENED=$(cast receipt "$(echo "$O" | jq -r .tx)" blockNumber --rpc-url "$RPC")
say "fum opened: $(echo "$O" | jq -c '{tx, auction, lotWeth, floorUsdcPerWeth, endBlock}')"
say "auction_status over MCP: $(node "$AGENTS/scripts/mcp-call.mjs" "$MCP" auction_status 2>&1 | head -c 600)"
if [ "${NOTIFY_AGY:-0}" = 1 ]; then
  handoff send agy "$HANDOFF_FROM to agy: the FORK shift-change CCA is OPEN (anvil fork of live Sepolia, chainId 11155111, 12s blocks). Auction $AUCTION, endBlock $END (now $(head_block)). Castle MCP on the fork: $MCP (POST, Streamable HTTP; the same seven tools). Fork RPC for sending your signed txs: $RPC. Please call auction_bid({owner: '$BIDDER', amount: '3000000', label: 'agy', usdcPerWeth: '3400'}) and send the returned steps in order to the fork RPC before block $((END-10)); fo bids the minimum through the same tool if you haven't. Nothing touches live Sepolia." --from "$HANDOFF_FROM" 2>&1 | tail -1
fi
while guard; [ "$(head_block)" -lt $((END-10)) ]; do sleep 4; done
THEIRS=$(node --input-type=module -e "
import { createPublicClient, http, parseAbiItem } from 'viem';
const pc = createPublicClient({ transport: http('$RPC') });
const logs = await pc.getLogs({ address: '$AUCTION', event: parseAbiItem('event BidSubmitted(uint256 indexed id, address indexed owner, uint256 priceQ96, uint128 amount)'), args: { owner: '$BIDDER' }, fromBlock: ${OPENED}n, toBlock: 'latest' });
console.log(logs.length);" 2>/dev/null || echo 0)
say "at endBlock-10: bids by $BIDDER on the fork = $THEIRS"
if [ "$THEIRS" = 0 ]; then
  node "$AGENTS/scripts/mcp-bid.mjs" --mcp "$MCP" --as fo --label fo --amount min --usdc-per-weth 3400 > logs/mcp-bid.json 2>&1; say "fo via MCP auction_bid, exit $?: $(grep -o '"event":"[^"]*"' logs/mcp-bid.json | tr '\n' ' ')"
  say "   $(grep '"event":"bid' logs/mcp-bid.json | cut -c1-400)"
fi
wait_for logs/fum.log "\"event\":\"settled\",\"auction\":\"$AUCTION\"" 400 || fail "fum did not settle $AUCTION"
X=$(grab logs/fum.log "\"event\":\"settled\",\"auction\":\"$AUCTION\""); STX=$(echo "$X" | jq -r .tx)
say "fum settled: $(echo "$X" | jq -c '{tx, usdcPerWeth, raised, priceWritten, ensUsdcPerWeth, anchorIsClearing}')"
say "settle trace (cast run $STX):"
cast run "$STX" --rpc-url "$RPC" 2>&1 | grep -iE "settleAuction|sweepCurrency|sweepUnsoldTokens|checkpoint|isGraduated|clearingPrice|setData|PriceWritten|AuctionSettled|Swept|Transfer" | sed 's/^/    /' | cut -c1-200 | head -60
say "fi (holder on the fork) after the settle: $(tail -n 40 logs/fi.log | grep -E '"event":"(anchor-moved|shipped)"' | tail -2 | cut -c1-200 | tr '\n' ' ')"
stop_all
say "done; logs in $W/agents/logs"
