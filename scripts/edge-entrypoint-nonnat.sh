#!/bin/sh
set -e

DATA_DIR="/data"
NODE_DIR="$DATA_DIR/node1"
GENESIS_FILE="$DATA_DIR/genesis.json"

if [ ! -f "$GENESIS_FILE" ]; then
  echo "=== Generating node secrets ==="
  polygon-edge secrets init --insecure --data-dir "$NODE_DIR"

  echo "=== Reading node info ==="
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

  echo "=== Generating genesis ==="
  polygon-edge genesis \
    --consensus ibft \
    --ibft-validator-type ecdsa \
    --ibft-validator "$VALIDATOR" \
    --bootnode "/ip4/127.0.0.1/tcp/10001/p2p/$NODE_ID" \
    --premine "${VALIDATOR}:1000000000000000000000" \
    --block-gas-limit 10000000 \
    --chain-id 100 \
    --dir "$GENESIS_FILE"

  echo "=== Genesis created ==="
fi

echo "=== Starting Polygon Edge ==="
exec polygon-edge server \
  --data-dir "$NODE_DIR" \
  --chain "$GENESIS_FILE" \
  --grpc-address 0.0.0.0:10000 \
  --jsonrpc 0.0.0.0:8545 \
  --libp2p 0.0.0.0:1478 \
  --seal \
  --log-level INFO
