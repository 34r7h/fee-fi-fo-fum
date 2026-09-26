#!/usr/bin/env bash
# Starts the crew as separate processes (default: fee fi fo fum), so `kill -9 $(cat agents/logs/fee.pid)` takes
# down exactly one giant. Logs are agents/logs/<id>.log (JSON lines) and pids agents/logs/<id>.pid, both
# git-ignored.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
ids=("$@"); [ ${#ids[@]} -eq 0 ] && ids=(fee fi fo fum)
for id in "${ids[@]}"; do
  if [ -f "logs/$id.pid" ] && kill -0 "$(cat "logs/$id.pid")" 2>/dev/null; then
    echo "$id already running (pid $(cat "logs/$id.pid"))"; continue
  fi
  nohup node run.mjs "$id" >> "logs/$id.log" 2>&1 &
  echo $! > "logs/$id.pid"
  echo "$id started (pid $!)"
done
