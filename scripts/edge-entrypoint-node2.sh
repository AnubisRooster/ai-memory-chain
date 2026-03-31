#!/bin/sh
set -e

DATA_DIR="/data"
NODE_DIR="$DATA_DIR/node2"
GENESIS_FILE="$DATA_DIR/genesis.json"

echo "=== Starting Polygon Edge Node 2 ==="
exec polygon-edge server \
  --data-dir "$NODE_DIR" \
  --chain "$GENESIS_FILE" \
  --grpc-address 0.0.0.0:10000 \
  --jsonrpc 0.0.0.0:8545 \
  --libp2p 0.0.0.0:1479 \
  --nat 192.168.68.66 \
  --seal \
  --log-level INFO
