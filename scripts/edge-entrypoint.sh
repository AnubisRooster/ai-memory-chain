#!/bin/sh
set -e

#
# Polygon Edge Entrypoint — Dual-mode (Founder / Joiner)
#
# Mode is determined by the EDGE_MODE environment variable:
#
#   EDGE_MODE=founder  (default)  — generates genesis and starts as sole validator
#   EDGE_MODE=joiner              — uses provided genesis and joins as a new validator
#
# Joiner-mode env vars:
#   GENESIS_JSON        — base64-encoded genesis.json (or mounted at /data/genesis.json)
#   BOOTNODE            — bootnode multiaddr string
#   FOUNDER_API         — founder's API URL for auto-announce (e.g. http://192.168.68.66:3001)
#   NAT_IP              — public/LAN IP for NAT traversal
#

DATA_DIR="/data"
NODE_DIR="$DATA_DIR/node1"
GENESIS_FILE="$DATA_DIR/genesis.json"

EDGE_MODE="${EDGE_MODE:-founder}"
NAT_IP="${NAT_IP:-}"

echo "=== Polygon Edge starting in ${EDGE_MODE} mode ==="

# ── Common: Initialize node secrets if they don't exist ──────────────

init_secrets() {
  if [ ! -f "$NODE_DIR/consensus/validator.key" ]; then
    echo "=== Generating node secrets ==="
    polygon-edge secrets init --insecure --data-dir "$NODE_DIR"
  else
    echo "=== Using existing node secrets ==="
  fi

  # Extract node identity
  SECRETS_JSON=$(polygon-edge secrets output --data-dir "$NODE_DIR" --json 2>/dev/null || true)

  if [ -n "$SECRETS_JSON" ]; then
    NODE_ID=$(echo "$SECRETS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['node_id'])" 2>/dev/null || true)
    VALIDATOR=$(echo "$SECRETS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['address'])" 2>/dev/null || true)
    BLS_PUBKEY=$(echo "$SECRETS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['bls_pubkey'])" 2>/dev/null || true)
  fi

  if [ -z "$NODE_ID" ]; then
    SECRETS_TEXT=$(polygon-edge secrets output --data-dir "$NODE_DIR" 2>&1)
    NODE_ID=$(echo "$SECRETS_TEXT" | grep "Node ID" | awk '{print $NF}')
    VALIDATOR=$(echo "$SECRETS_TEXT" | grep "Public key (address)" | awk '{print $NF}')
    BLS_PUBKEY=$(echo "$SECRETS_TEXT" | grep "BLS Public key" | awk '{print $NF}')
  fi

  echo "Node ID: $NODE_ID"
  echo "Validator: $VALIDATOR"
  echo "BLS Public Key: $BLS_PUBKEY"

  # Write identity to a file so the join script can read it
  cat > "$DATA_DIR/node-identity.json" << IDEOF
{
  "nodeId": "$NODE_ID",
  "address": "$VALIDATOR",
  "blsPubkey": "$BLS_PUBKEY"
}
IDEOF
}

# ── Founder Mode ─────────────────────────────────────────────────────

founder_mode() {
  if [ ! -f "$GENESIS_FILE" ]; then
    echo "=== Generating genesis (founder) ==="
    polygon-edge genesis \
      --consensus ibft \
      --ibft-validator-type ecdsa \
      --ibft-validator "$VALIDATOR" \
      --bootnode "/ip4/127.0.0.1/tcp/1478/p2p/$NODE_ID" \
      --premine "${VALIDATOR}:1000000000000000000000" \
      --block-gas-limit 10000000 \
      --chain-id 100 \
      --dir "$GENESIS_FILE"
    echo "=== Genesis created ==="
  fi
}

# ── Joiner Mode ──────────────────────────────────────────────────────

joiner_mode() {
  # The genesis file must be provided — either mounted or base64-encoded
  if [ ! -f "$GENESIS_FILE" ]; then
    if [ -n "$GENESIS_JSON" ]; then
      echo "=== Decoding provided genesis.json ==="
      echo "$GENESIS_JSON" | base64 -d > "$GENESIS_FILE"
    else
      echo "ERROR: Joiner mode requires genesis.json at $GENESIS_FILE or GENESIS_JSON env var"
      exit 1
    fi
  fi

  # Announce to the founder's API for auto-approval
  if [ -n "$FOUNDER_API" ] && [ -n "$VALIDATOR" ] && [ -n "$NODE_ID" ]; then
    echo "=== Announcing to founder at $FOUNDER_API ==="
    local_ip="${NAT_IP:-$(hostname -i 2>/dev/null || echo '')}"

    # Retry announcement a few times (founder might not be ready yet)
    attempts=0
    while [ "$attempts" -lt 10 ]; do
      # Use wget (available in polygon-edge image) or curl as fallback
      if command -v wget >/dev/null 2>&1; then
        result=$(wget -qO- --timeout=5 --post-data \
          "{\"address\":\"$VALIDATOR\",\"nodeId\":\"$NODE_ID\",\"ip\":\"$local_ip\",\"port\":1478}" \
          --header="Content-Type: application/json" \
          "$FOUNDER_API/validator/announce" 2>/dev/null || true)
      elif command -v curl >/dev/null 2>&1; then
        result=$(curl -sf --max-time 5 -X POST \
          -H "Content-Type: application/json" \
          -d "{\"address\":\"$VALIDATOR\",\"nodeId\":\"$NODE_ID\",\"ip\":\"$local_ip\",\"port\":1478}" \
          "$FOUNDER_API/validator/announce" 2>/dev/null || true)
      else
        echo "WARNING: Neither wget nor curl available — cannot announce to founder"
        break
      fi

      if echo "$result" | grep -q '"success"'; then
        echo "=== Announced to founder — validator proposal submitted ==="
        echo "$result"
        break
      fi

      attempts=$((attempts + 1))
      echo "Announce attempt $attempts/10 — founder not ready, retrying in 5s..."
      sleep 5
    done
  fi
}

# ── Main ─────────────────────────────────────────────────────────────

init_secrets

case "$EDGE_MODE" in
  founder)
    founder_mode
    ;;
  joiner)
    joiner_mode
    ;;
  *)
    echo "ERROR: Unknown EDGE_MODE: $EDGE_MODE (expected 'founder' or 'joiner')"
    exit 1
    ;;
esac

# ── Build server flags ───────────────────────────────────────────────

SERVER_FLAGS="--data-dir $NODE_DIR \
  --chain $GENESIS_FILE \
  --grpc-address 0.0.0.0:10000 \
  --jsonrpc 0.0.0.0:8545 \
  --libp2p 0.0.0.0:1478 \
  --seal \
  --log-level INFO"

# Add NAT flag if an IP is provided
if [ -n "$NAT_IP" ]; then
  SERVER_FLAGS="$SERVER_FLAGS --nat $NAT_IP"
fi

# Add bootnode connection if provided (joiner mode)
if [ -n "$BOOTNODE" ]; then
  echo "=== Connecting to bootnode: $BOOTNODE ==="
  SERVER_FLAGS="$SERVER_FLAGS --bootnode $BOOTNODE"
fi

echo "=== Starting Polygon Edge ==="
exec polygon-edge server $SERVER_FLAGS
