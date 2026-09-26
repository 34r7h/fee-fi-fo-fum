#!/usr/bin/env bash
# Stops crew members started by up.sh (default: all four) with SIGTERM, which also stops each one's listener.
set -uo pipefail
cd "$(dirname "$0")/.."
ids=("$@"); [ ${#ids[@]} -eq 0 ] && ids=(fee fi fo fum)
for id in "${ids[@]}"; do
  if [ -f "logs/$id.pid" ] && kill -0 "$(cat "logs/$id.pid")" 2>/dev/null; then
    kill -TERM "$(cat "logs/$id.pid")" && echo "$id stopped (pid $(cat "logs/$id.pid"))"
  else
    echo "$id not running"
  fi
  rm -f "logs/$id.pid"
done
