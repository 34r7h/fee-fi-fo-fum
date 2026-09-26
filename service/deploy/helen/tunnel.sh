#!/bin/sh
# castle agent tunnel: public https://handoff.lol/t/castle/ -> the castle service on :8791.
# tunnel_agent.mjs finds castle's signing key in ~/.handoff/agents/castle/crypto-keys.json (0600, never in git).
set -e
export AGENT_ID=castle
export AGENT_NAME="castle"
export AGENT_DESCRIPTION="fee-fi-fo-fum castle service: MCP tools and the castle SSE stream, Ethereum Sepolia."
export LOCAL=http://localhost:8791
export NODE_OPTIONS=--dns-result-order=ipv4first
exec node "$HOME/.handoff/tunnel_agent.mjs"
