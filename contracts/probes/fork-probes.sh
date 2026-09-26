#!/usr/bin/env bash
# Fork probes for feefifofum ENSv2 lease semantics.
# Run against an anvil fork of Ethereum Sepolia (chain id 11155111).
# Results are fork evidence, not live Sepolia transactions.
set -u
RPC="${RPC:-http://127.0.0.1:8545}"
CAST="${CAST:-/Users/34r7h/.foundry/bin/cast}"

ETH_REGISTRAR=0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca
ETH_REGISTRY=0x657ea849311d3d5823348dded7c2aaafb3ede09e
RESOLVER_IMPL=0x14f09fd05d4585759e54844dc9b00147131cf243
# Fresh EOA. Anvil's default account has code on this Foundry build, and ERC1155 mint rejects it.
ACCT=0x1111111111111111111111111111111111111111
ZERO=0x0000000000000000000000000000000000000000
# PermissionedRegistry.ROLE_RENEW = 1 << 16. Granted so the probe account can call renew.
ROLE_RENEW=65536
# PermissionedResolverLib: ROLE_SET_DATA = 1 << 24, ROLE_LINK = 1 << 28.
ROLE_DATA_AND_LINK=285212672

say() { printf '%s\n' "$*"; }

"$CAST" rpc anvil_setBalance "$ETH_REGISTRAR" 0x56BC75E2D63100000 --rpc-url "$RPC" >/dev/null
"$CAST" rpc anvil_setBalance "$ACCT" 0x56BC75E2D63100000 --rpc-url "$RPC" >/dev/null
"$CAST" rpc anvil_impersonateAccount "$ETH_REGISTRAR" --rpc-url "$RPC" >/dev/null
"$CAST" rpc anvil_impersonateAccount "$ACCT" --rpc-url "$RPC" >/dev/null

TS=$("$CAST" block latest --field timestamp --rpc-url "$RPC")
# Pin the next block. Anvil otherwise stamps wall-clock time, which can already
# be past a +30s expiry read from the forked head.
"$CAST" rpc anvil_setNextBlockTimestamp $((TS + 5)) --rpc-url "$RPC" >/dev/null
SHORT=$((TS + 40))
LABEL=fffo-probe
LABEL_ID=$("$CAST" keccak "$LABEL")

say "FORK chain=$("$CAST" chain-id --rpc-url "$RPC") block=$("$CAST" block-number --rpc-url "$RPC") ts=$TS"
say "LIVE_IMMUTABLE MIN_REGISTER_DURATION=$("$CAST" call "$ETH_REGISTRAR" 'MIN_REGISTER_DURATION()(uint64)' --rpc-url "$RPC")"
say "LIVE_IMMUTABLE MIN_COMMITMENT_AGE=$("$CAST" call "$ETH_REGISTRAR" 'MIN_COMMITMENT_AGE()(uint64)' --rpc-url "$RPC")"

REG_TX=$("$CAST" send "$ETH_REGISTRY" \
  'register(string,address,address,address,uint256,uint64)' \
  "$LABEL" "$ACCT" "$ZERO" "$ZERO" "$ROLE_RENEW" "$SHORT" \
  --from "$ETH_REGISTRAR" --unlocked --rpc-url "$RPC")
say "PROBE_REGISTER_TX $REG_TX"

TOKEN1=$("$CAST" call "$ETH_REGISTRY" 'getTokenId(uint256)(uint256)' "$LABEL_ID" --rpc-url "$RPC")
EXP1=$("$CAST" call "$ETH_REGISTRY" 'getExpiry(uint256)(uint64)' "$LABEL_ID" --rpc-url "$RPC")
OWN1=$("$CAST" call "$ETH_REGISTRY" 'getOwner(uint256)(address)' "$LABEL_ID" --rpc-url "$RPC")
say "PROBE_B_BEFORE tokenId=$TOKEN1 expiry=$EXP1 owner=$OWN1"

# (a) renew to a timestamp still under 60 seconds from the original block.
RENEW_TO=$((TS + 50))
if RENEW_TX=$("$CAST" send "$ETH_REGISTRY" 'renew(uint256,uint64)' "$LABEL_ID" "$RENEW_TO" \
  --from "$ACCT" --unlocked --rpc-url "$RPC" 2>/tmp/fffo-renew.err); then
  EXP2=$("$CAST" call "$ETH_REGISTRY" 'getExpiry(uint256)(uint64)' "$LABEL_ID" --rpc-url "$RPC")
  say "PROBE_A_RENEW ok tx=$RENEW_TX requested=$RENEW_TO expiry_now=$EXP2"
else
  say "PROBE_A_RENEW revert $(tr '\n' ' ' </tmp/fffo-renew.err)"
fi

# Shortening must revert. This is CannotReduceExpiry, not a minimum-duration rule.
if "$CAST" send "$ETH_REGISTRY" 'renew(uint256,uint64)' "$LABEL_ID" "$TS" \
  --from "$ACCT" --unlocked --rpc-url "$RPC" >/tmp/fffo-short.out 2>/tmp/fffo-short.err; then
  say "PROBE_A_SHORTEN unexpected_ok"
else
  say "PROBE_A_SHORTEN revert $(tr '\n' ' ' </tmp/fffo-short.err)"
fi

# (b) expire, then re-register through the same registrar impersonation.
"$CAST" rpc evm_increaseTime 120 --rpc-url "$RPC" >/dev/null
"$CAST" rpc evm_mine --rpc-url "$RPC" >/dev/null
"$CAST" rpc anvil_impersonateAccount "$ETH_REGISTRAR" --rpc-url "$RPC" >/dev/null
OWN_EXPIRED=$("$CAST" call "$ETH_REGISTRY" 'getOwner(uint256)(address)' "$LABEL_ID" --rpc-url "$RPC")
say "PROBE_C_EXPIRED_OWNER $OWN_EXPIRED"
TS2=$("$CAST" block latest --field timestamp --rpc-url "$RPC")
NEXT=$((TS2 + 40))
REG2=$("$CAST" send "$ETH_REGISTRY" \
  'register(string,address,address,address,uint256,uint64)' \
  "$LABEL" "$ACCT" "$ZERO" "$ZERO" "$ROLE_RENEW" "$NEXT" \
  --from "$ETH_REGISTRAR" --unlocked --rpc-url "$RPC")
TOKEN2=$("$CAST" call "$ETH_REGISTRY" 'getTokenId(uint256)(uint256)' "$LABEL_ID" --rpc-url "$RPC")
say "PROBE_B_AFTER tx=$REG2 tokenId=$TOKEN2 changed=$([ "$TOKEN1" = "$TOKEN2" ] && echo no || echo yes)"

# (d) minimal proxy of the deployed PermissionedResolver implementation, then setData and linkToNode.
IMPL=${RESOLVER_IMPL#0x}
# EIP-1167 init code. The runtime alone reverts if it is executed as a constructor.
PROXY_CODE="0x3d602d80600a3d3981f3363d3d373d3d3d363d73${IMPL}5af43d82803e903d91602b57fd5bf3"
PROXY_TX=$("$CAST" send --from "$ACCT" --unlocked --rpc-url "$RPC" --create "$PROXY_CODE")
PROXY=$("$CAST" receipt "$PROXY_TX" contractAddress --rpc-url "$RPC")
say "PROBE_D_PROXY $PROXY"
INIT=$("$CAST" send "$PROXY" 'initialize((address,uint256)[],bytes[])' \
  "[($ACCT,$ROLE_DATA_AND_LINK)]" "[]" \
  --from "$ACCT" --unlocked --rpc-url "$RPC")
say "PROBE_D_INIT $INIT"

dns() { python3 -c '
import sys
name=sys.argv[1]
out=b""
for part in name.split("."):
    b=part.encode()
    out += bytes([len(b)])+b
out += b"\x00"
print("0x"+out.hex())
' "$1"; }

NAME_A=$(dns "alpha.eth")
NAME_B=$(dns "beta.eth")
NODE_A=$("$CAST" namehash "alpha.eth")
if SET_TX=$("$CAST" send "$PROXY" 'setData(bytes,string,bytes)' "$NAME_A" "handoff-price" 0x01 \
  --from "$ACCT" --unlocked --rpc-url "$RPC" 2>/tmp/fffo-set.err); then
  RID=$("$CAST" call "$PROXY" 'getRecordId(bytes32)(uint256)' "$NODE_A" --rpc-url "$RPC")
  say "PROBE_D_SETDATA ok tx=$SET_TX recordId=$RID"
else
  say "PROBE_D_SETDATA revert $(tr '\n' ' ' </tmp/fffo-set.err)"
  RID=0
fi

if [ "$RID" != "0" ]; then
  if LINK_TX=$("$CAST" send "$PROXY" 'linkToNode(bytes,bytes32)' "$NAME_B" "$NODE_A" \
    --from "$ACCT" --unlocked --rpc-url "$RPC" 2>/tmp/fffo-link.err); then
    NODE_B=$("$CAST" namehash "beta.eth")
    RID_B=$("$CAST" call "$PROXY" 'getRecordId(bytes32)(uint256)' "$NODE_B" --rpc-url "$RPC")
    say "PROBE_D_LINK ok tx=$LINK_TX beta_recordId=$RID_B"
  else
    say "PROBE_D_LINK revert $(tr '\n' ' ' </tmp/fffo-link.err)"
  fi
fi

# Direct reads use these selectors. They do not call UniversalResolverV2.
say "SELECTORS getOwner=$("$CAST" sig 'getOwner(uint256)') getExpiry=$("$CAST" sig 'getExpiry(uint256)') getTokenId=$("$CAST" sig 'getTokenId(uint256)') renew=$("$CAST" sig 'renew(uint256,uint64)') setData=$("$CAST" sig 'setData(bytes,string,bytes)') linkToNode=$("$CAST" sig 'linkToNode(bytes,bytes32)')"
