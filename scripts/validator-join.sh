#!/bin/bash
#
# validator-join.sh — Join the AI Memory Chain network as a new validator
#
# This script automates the full process of joining an existing network:
#
#   1. Auto-discovers the founder node on the LAN (or uses provided IP)
#   2. Fetches genesis.json and connection info from the founder
#   3. Initializes local Polygon Edge secrets
#   4. Starts the Polygon Edge node connected to the bootnode
#   5. Announces itself to the founder for auto-approval as a validator
#
# Usage:
#   ./scripts/validator-join.sh                     # auto-discover via LAN broadcast
#   ./scripts/validator-join.sh --founder-ip 192.168.68.66   # connect to known IP
#   ./scripts/validator-join.sh --help
#
# Prerequisites:
#   - Docker installed and running
#   - Port 8545, 10000, 1478 available
#   - Same LAN as the founder node (for auto-discovery)
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$PROJECT_DIR/scripts"
CONFIG_DIR="$PROJECT_DIR/config"
DATA_DIR="$PROJECT_DIR/data/polygon-edge"
LOG_DIR="$PROJECT_DIR/logs"

DOCKER="/usr/local/bin/docker"
if [ ! -x "$DOCKER" ]; then DOCKER="$HOME/.docker/bin/docker"; fi
if [ ! -x "$DOCKER" ]; then DOCKER="$(which docker 2>/dev/null)"; fi

mkdir -p "$LOG_DIR" "$DATA_DIR" "$CONFIG_DIR"

FOUNDER_IP=""
FOUNDER_API_PORT=3001
DISCOVERY_TIMEOUT=30

# ── CLI Parsing ──────────────────────────────────────────────────────

while [ $# -gt 0 ]; do
  case "$1" in
    --founder-ip)
      FOUNDER_IP="$2"
      shift 2
      ;;
    --api-port)
      FOUNDER_API_PORT="$2"
      shift 2
      ;;
    --timeout)
      DISCOVERY_TIMEOUT="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --founder-ip IP    Connect to a specific founder node IP"
      echo "  --api-port PORT    Founder API port (default: 3001)"
      echo "  --timeout SECS     LAN discovery timeout (default: 30)"
      echo "  --help             Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ── Helper Functions ─────────────────────────────────────────────────

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

get_lan_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    local ip
    ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
    if [ -n "$ip" ]; then echo "$ip"; return; fi
  fi
  if command -v hostname >/dev/null 2>&1; then
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "$ip" ]; then echo "$ip"; return; fi
  fi
  python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(('10.255.255.255', 1))
    print(s.getsockname()[0])
except: print('127.0.0.1')
finally: s.close()
" 2>/dev/null
}

# ── Step 1: Discover the Founder ─────────────────────────────────────

if [ -z "$FOUNDER_IP" ]; then
  log "Step 1: Discovering founder node on LAN..."

  discovery_result=$("$SCRIPTS_DIR/discovery.sh" --discover "$DISCOVERY_TIMEOUT" 2>/dev/null | tail -1)

  if [ -n "$discovery_result" ] && echo "$discovery_result" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    FOUNDER_IP=$(echo "$discovery_result" | python3 -c "import sys,json; print(json.load(sys.stdin)['ip'])" 2>/dev/null)
    FOUNDER_API_PORT=$(echo "$discovery_result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('api_port', 3001))" 2>/dev/null)
    log "  Found founder at $FOUNDER_IP (API port: $FOUNDER_API_PORT)"
  else
    echo ""
    echo "ERROR: Could not auto-discover a founder node on the LAN."
    echo ""
    echo "Make sure:"
    echo "  1. The founder node is running with the discovery daemon"
    echo "  2. You are on the same network/subnet"
    echo ""
    echo "Or specify the founder IP manually:"
    echo "  $0 --founder-ip 192.168.68.66"
    exit 1
  fi
else
  log "Step 1: Using provided founder IP: $FOUNDER_IP"
fi

FOUNDER_API="http://${FOUNDER_IP}:${FOUNDER_API_PORT}"

# ── Step 2: Fetch Join Info from Any Available Node ──────────────────

log "Step 2: Fetching network info from $FOUNDER_API..."

JOIN_INFO=$(curl -sf --max-time 10 "$FOUNDER_API/validator/join-info" 2>/dev/null)

if [ -z "$JOIN_INFO" ]; then
  log "  Primary node unreachable. Trying peer discovery..."

  # Try scanning common LAN IPs on the expected API port
  LOCAL_SUBNET=$(get_lan_ip | sed 's/\.[0-9]*$/./')
  for i in $(seq 1 254); do
    PEER_IP="${LOCAL_SUBNET}${i}"
    PEER_INFO=$(curl -sf --max-time 2 "http://${PEER_IP}:${FOUNDER_API_PORT}/validator/join-info" 2>/dev/null)
    if [ -n "$PEER_INFO" ]; then
      log "  Found active node at $PEER_IP"
      JOIN_INFO="$PEER_INFO"
      FOUNDER_IP="$PEER_IP"
      FOUNDER_API="http://${FOUNDER_IP}:${FOUNDER_API_PORT}"
      break
    fi
  done

  if [ -z "$JOIN_INFO" ]; then
    echo "ERROR: Could not reach any validator node."
    echo "Make sure at least one node's backend is running."
    exit 1
  fi
fi

# Extract connection details
BOOTNODE=$(echo "$JOIN_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bootnode',''))" 2>/dev/null)
CHAIN_ID=$(echo "$JOIN_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('chainId',100))" 2>/dev/null)
VALIDATOR_COUNT=$(echo "$JOIN_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('validatorCount',0))" 2>/dev/null)

log "  Bootnode: $BOOTNODE"
log "  Chain ID: $CHAIN_ID"
log "  Current validators: $VALIDATOR_COUNT"

# Save genesis.json from the founder
echo "$JOIN_INFO" | python3 -c "
import sys, json
info = json.load(sys.stdin)
genesis = info.get('genesis')
if genesis:
    with open('$DATA_DIR/genesis.json', 'w') as f:
        json.dump(genesis, f, indent=4)
    print('Genesis saved.')
else:
    print('WARNING: No genesis in join-info response')
" 2>/dev/null

if [ ! -f "$DATA_DIR/genesis.json" ]; then
  echo "ERROR: Failed to obtain genesis.json from founder"
  exit 1
fi

log "  Genesis saved to $DATA_DIR/genesis.json"

# ── Step 3: Start Polygon Edge in Joiner Mode ───────────────────────

log "Step 3: Starting Polygon Edge in joiner mode..."

LOCAL_IP=$(get_lan_ip)
log "  Local LAN IP: $LOCAL_IP"

# Stop any existing container
"$DOCKER" stop polygon-edge 2>/dev/null || true
"$DOCKER" rm polygon-edge 2>/dev/null || true

# Start with joiner environment
cd "$PROJECT_DIR"
EDGE_MODE=joiner \
NAT_IP="$LOCAL_IP" \
BOOTNODE="$BOOTNODE" \
FOUNDER_API="$FOUNDER_API" \
"$DOCKER" compose up -d polygon-edge

log "  Polygon Edge container started"

# ── Step 4: Wait for Node to Initialize ──────────────────────────────

log "Step 4: Waiting for Polygon Edge to become ready..."

attempts=0
while [ "$attempts" -lt 30 ]; do
  if curl -sf http://localhost:8545 > /dev/null 2>&1; then
    log "  Polygon Edge RPC is ready"
    break
  fi
  attempts=$((attempts + 1))
  sleep 2
done

if [ "$attempts" -ge 30 ]; then
  echo "WARNING: Polygon Edge did not become ready within 60s"
  echo "Check logs: docker logs polygon-edge"
fi

# ── Step 5: Read Node Identity and Announce ──────────────────────────

log "Step 5: Reading node identity and announcing to founder..."

# Wait for identity file to be created by the entrypoint
sleep 3

IDENTITY_FILE="$DATA_DIR/node-identity.json"
if [ -f "$IDENTITY_FILE" ]; then
  NODE_ADDRESS=$(python3 -c "import json; print(json.load(open('$IDENTITY_FILE'))['address'])" 2>/dev/null)
  NODE_ID=$(python3 -c "import json; print(json.load(open('$IDENTITY_FILE'))['nodeId'])" 2>/dev/null)
else
  echo "WARNING: Node identity file not found. The entrypoint may still be initializing."
  echo "You can manually announce later with:"
  echo "  curl -X POST $FOUNDER_API/validator/announce -H 'Content-Type: application/json' -d '{\"address\":\"YOUR_ADDRESS\",\"nodeId\":\"YOUR_NODE_ID\",\"ip\":\"$LOCAL_IP\",\"port\":1478}'"
  exit 0
fi

if [ -n "$NODE_ADDRESS" ] && [ -n "$NODE_ID" ]; then
  log "  Address: $NODE_ADDRESS"
  log "  Node ID: $NODE_ID"

  ANNOUNCE_BODY="{\"address\":\"$NODE_ADDRESS\",\"nodeId\":\"$NODE_ID\",\"ip\":\"$LOCAL_IP\",\"port\":1478,\"apiPort\":${FOUNDER_API_PORT}}"

  # Announce to the primary node (it will propagate to others)
  ANNOUNCE_RESULT=$(curl -sf --max-time 10 -X POST \
    -H "Content-Type: application/json" \
    -d "$ANNOUNCE_BODY" \
    "$FOUNDER_API/validator/announce" 2>/dev/null)

  if echo "$ANNOUNCE_RESULT" | grep -q '"success"'; then
    log "  Announced successfully — validator proposal submitted!"
    PEERS_PROPAGATED=$(echo "$ANNOUNCE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('peersPropagated',0))" 2>/dev/null)
    log "  Proposal propagated to $PEERS_PROPAGATED additional peers"
  else
    log "  Primary announce failed. Trying to announce to all known peers..."

    # Fetch peer list and announce to each independently
    PEER_LIST=$(curl -sf --max-time 5 "$FOUNDER_API/validator/peers" 2>/dev/null)
    if [ -n "$PEER_LIST" ]; then
      echo "$PEER_LIST" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for v in data.get('registeredValidators', []):
    if v.get('ip') and v.get('status') != 'removed':
        print(f\"http://{v['ip']}:{v.get('apiPort', 3001)}\")
for api in data.get('peerApis', []):
    print(api)
" 2>/dev/null | sort -u | while read -r PEER_URL; do
        RESULT=$(curl -sf --max-time 5 -X POST \
          -H "Content-Type: application/json" \
          -d "$ANNOUNCE_BODY" \
          "$PEER_URL/validator/announce" 2>/dev/null)
        if echo "$RESULT" | grep -q '"success"'; then
          log "  Announced to peer: $PEER_URL"
        fi
      done
    else
      echo "WARNING: Could not reach any peer for announcement."
      echo "  You can manually propose this validator on any running node:"
      echo "  curl -X POST <NODE_API>/validator/propose -H 'Content-Type: application/json' -d '{\"address\":\"$NODE_ADDRESS\"}'"
    fi
  fi
fi

# ── Step 6: Update Local Config ──────────────────────────────────────

log "Step 6: Updating local configuration..."

# Save peers config
cat > "$CONFIG_DIR/peers.json" << PEERSEOF
{
  "_doc": "Peers for AI Memory Chain network — this node is a joiner.",
  "ipfs_peers": [],
  "polygon_bootnodes": ["$BOOTNODE"],
  "local": {
    "ipfs_id": "",
    "polygon_bootnode": "/ip4/$LOCAL_IP/tcp/1478/p2p/$NODE_ID"
  },
  "founder": {
    "ip": "$FOUNDER_IP",
    "api": "$FOUNDER_API",
    "bootnode": "$BOOTNODE"
  }
}
PEERSEOF

log "  Config saved to $CONFIG_DIR/peers.json"

# ── Done ─────────────────────────────────────────────────────────────

echo ""
echo "=================================================================="
echo "  AI Memory Chain — Validator Node Joined!"
echo "=================================================================="
echo ""
echo "  Network:         Chain ID $CHAIN_ID"
echo "  Your address:    $NODE_ADDRESS"
echo "  Your Node ID:    $NODE_ID"
echo "  Founder:         $FOUNDER_IP"
echo "  RPC endpoint:    http://localhost:8545"
echo ""
echo "  Your node has been proposed as a validator."
echo "  It will become active at the next IBFT epoch boundary."
echo ""
echo "  To check status:"
echo "    curl http://localhost:3001/validator/status"
echo "    curl http://$FOUNDER_IP:3001/validator/list"
echo ""
echo "  To gracefully exit the validator set:"
echo "    ./scripts/validator-exit.sh"
echo ""
echo "=================================================================="
