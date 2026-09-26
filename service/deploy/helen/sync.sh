#!/bin/sh
# Follow origin/main: deployments/crew/config changes are read live; a service/ code change restarts it.
set -e
export PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH
cd "$HOME/fee-fi-fo-fum"
before=$(git rev-parse HEAD)
git pull -q --ff-only
after=$(git rev-parse HEAD)
[ "$before" = "$after" ] && exit 0
if git diff --name-only "$before" "$after" | grep -q "^service/"; then
  (cd service && npm ci --silent)
  systemctl --user restart castle-service.service
  echo "castle-service restarted at $after"
fi
