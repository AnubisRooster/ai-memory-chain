#!/bin/bash
#
# validator-exit.sh — Gracefully exit the AI Memory Chain validator set
#
# This script:
#   1. Reads the local validator identity
#   2. Announces removal intent to all known peers
#   3. Votes to remove itself from the IBFT validator set
#   4. Waits for removal confirmation
#   5. Optionally stops the local Polygon Edge node
#
# Usage:
#   ./scripts/validator-exit.sh              # graceful exit
#   ./scripts/validator-exit.sh --force      # exit and stop node immediately
#   ./scripts/validator-exit.sh --keep-node  # exit validator set but keep node running
#   ./scripts/validator-exit.sh --help
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$PROJECT_DIR/data/polygon-edge"
CONFIG_DIR="$PROJECT_DIR/config"
LOG_DIR="$PROJECT_DIR/logs"

DOCKER="/usr/local/bin/docker"
if [ ! -x "$DOCKER" ]; then DOCKER="$HOME/.docker/bin/docker"; fi
if [ ! -x "$DOCKER" ]; then DOCKER="$(which docker 2>/dev/null)"; fi

FORCE=false
KEEP_NODE=false
BACKEND_URL="http://localhost:3001"

# ── CLI Parsing ──────────────────────────────────────────────────────

while [ $# -gt 0 ]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --keep-node)
      KEEP_NODE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --force       Exit and stop the node immediately"
      echo "  --keep-node   Remove from validator set but keep the node running (non-sealing)"
      echo "  --help        Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# ── Step 1: Read Local Identity ──────────────────────────────────────

log "Step 1: Reading local validator identity..."

IDENTITY_FILE="$DATA_DIR/node-identity.json"
if [ -f "$IDENTITY_FILE" ]; then
  NODE_ADDRESS=$(python3 -c "import json; print(json.load(open('$IDENTITY_FILE'))['address'])" 2>/dev/null)
  NODE_ID=$(python3 -c "import json; print(json.load(open('$IDENTITY_FILE'))['nodeId'])" 2>/dev/null)
else
  # Try reading from the validator key file
  NODE_ADDRESS=""
  NODE_ID=""
fi

if [ -z "$NODE_ADDRESS" ]; then
  echo "ERROR: Could not determine local validator address."
  echo "Make sure the Polygon Edge node has been initialized."
  exit 1
fi

log "  Address: $NODE_ADDRESS"

# ── Step 2: Check Current Validator Status ───────────────────────────

log "Step 2: Checking current validator status..."

VALIDATORS=$(curl -sf --max-time 5 "$BACKEND_URL/validator/list" 2>/dev/null)

if [ -z "$VALIDATORS" ]; then
  echo "WARNING: Could not reach local backend API. Checking RPC directly..."
  VALIDATORS=""
fi

VALIDATOR_COUNT=$(echo "$VALIDATORS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")

if [ "$VALIDATOR_COUNT" = "1" ]; then
  echo ""
  echo "ERROR: You are the ONLY validator in the network."
  echo "Removing yourself would halt the chain entirely."
  echo ""
  echo "To shut down the entire network instead, use:"
  echo "  ./scripts/shutdown.sh"
  exit 1
fi

log "  Current validator count: $VALIDATOR_COUNT"

# Check if we're actually a validator
IS_VALIDATOR=$(echo "$VALIDATORS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
validators = [v.lower() for v in data.get('validators', [])]
addr = '$NODE_ADDRESS'.lower()
print('yes' if addr in validators else 'no')
" 2>/dev/null || echo "unknown")

if [ "$IS_VALIDATOR" = "no" ]; then
  echo "NOTE: Address $NODE_ADDRESS is not currently in the validator set."
  echo "Nothing to remove."
  if [ "$FORCE" = "true" ]; then
    log "Force flag set — will stop node..."
  else
    exit 0
  fi
fi

# ── Step 3: Propose Self-Removal ─────────────────────────────────────

if [ "$IS_VALIDATOR" != "no" ]; then
  log "Step 3: Proposing self-removal from validator set..."

  # Vote to remove ourselves via the local RPC
  REMOVE_RESULT=$(curl -sf --max-time 10 -X POST \
    -H "Content-Type: application/json" \
    -d "{\"address\":\"$NODE_ADDRESS\"}" \
    "$BACKEND_URL/validator/remove" 2>/dev/null)

  if echo "$REMOVE_RESULT" | grep -q '"success"'; then
    log "  Self-removal vote submitted"
  else
    echo "WARNING: Could not submit removal vote via API."
    echo "Attempting direct RPC call..."

    # Direct IBFT RPC call
    curl -sf --max-time 10 -X POST \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"ibft_proposeCandidate\",\"params\":[\"$NODE_ADDRESS\",false],\"id\":1}" \
      http://localhost:8545 2>/dev/null

    log "  Direct RPC removal vote submitted"
  fi

  # Also ask the founder and other known peers to vote for our removal
  log "  Requesting removal votes from known peers..."

  PEERS_FILE="$CONFIG_DIR/peers.json"
  if [ -f "$PEERS_FILE" ]; then
    # Check for founder API
    FOUNDER_API=$(python3 -c "
import json
cfg = json.load(open('$PEERS_FILE'))
print(cfg.get('founder', {}).get('api', ''))
" 2>/dev/null)

    if [ -n "$FOUNDER_API" ]; then
      curl -sf --max-time 5 -X POST \
        -H "Content-Type: application/json" \
        -d "{\"address\":\"$NODE_ADDRESS\"}" \
        "$FOUNDER_API/validator/remove" 2>/dev/null && \
        log "  Founder voted for removal" || \
        log "  Could not reach founder for removal vote"
    fi
  fi
fi

# ── Step 4: Wait for Removal (or skip if --force) ────────────────────

if [ "$IS_VALIDATOR" != "no" ] && [ "$FORCE" = "false" ]; then
  log "Step 4: Waiting for removal to take effect..."
  log "  (This happens at the next epoch boundary. Use --force to skip waiting.)"

  attempts=0
  max_attempts=60  # ~2 minutes
  while [ "$attempts" -lt "$max_attempts" ]; do
    STILL_VALIDATOR=$(curl -sf --max-time 5 "$BACKEND_URL/validator/list" 2>/dev/null \
      | python3 -c "
import sys, json
data = json.load(sys.stdin)
validators = [v.lower() for v in data.get('validators', [])]
print('yes' if '$NODE_ADDRESS'.lower() in validators else 'no')
" 2>/dev/null || echo "unknown")

    if [ "$STILL_VALIDATOR" = "no" ]; then
      log "  Successfully removed from validator set!"
      break
    fi

    attempts=$((attempts + 1))
    if [ $((attempts % 10)) -eq 0 ]; then
      log "  Still in validator set... ($attempts/${max_attempts})"
    fi
    sleep 2
  done

  if [ "$attempts" -ge "$max_attempts" ]; then
    echo ""
    echo "NOTE: Removal vote was submitted but hasn't taken effect yet."
    echo "This is normal — IBFT validator changes happen at epoch boundaries."
    echo "Your node will be removed from the set at the next epoch."
    echo ""
  fi
fi

# ── Step 5: Optionally Stop the Node ─────────────────────────────────

if [ "$KEEP_NODE" = "true" ]; then
  log "Step 5: Keeping node running (--keep-node). It will sync but not seal blocks."
  echo ""
  echo "Node is still running but no longer sealing blocks."
  echo "To stop it: docker stop polygon-edge"
elif [ "$FORCE" = "true" ] || [ "$IS_VALIDATOR" = "no" ]; then
  log "Step 5: Stopping Polygon Edge node..."
  "$DOCKER" stop polygon-edge 2>/dev/null || true
  log "  Node stopped."

  # Also stop the discovery daemon if running
  "$PROJECT_DIR/scripts/discovery.sh" --stop 2>/dev/null || true

  echo ""
  echo "Polygon Edge node has been stopped."
  echo "To rejoin later: ./scripts/validator-join.sh"
else
  log "Step 5: Node remains running. It will stop sealing after epoch change."
  echo ""
  echo "Your removal vote has been submitted."
  echo "Once the change takes effect, you can stop the node with:"
  echo "  docker stop polygon-edge"
fi

echo ""
echo "=================================================================="
echo "  Validator Exit Complete"
echo "=================================================================="
echo "  Address:  $NODE_ADDRESS"
echo "  Action:   Removal proposed"
echo "=================================================================="
