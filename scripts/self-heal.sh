#!/bin/bash
#
# Self-healing daemon for AI Memory Chain.
#
# Runs periodic checks to keep the node healthy and synced:
#
#   1. IPFS peer reconnection  — reconnects to known peers that have drifted
#   2. IPFS pin reconciliation — ensures every on-chain CID is pinned locally
#   3. Blockchain sync monitor — detects stalled block production
#   4. Docker health recovery  — restarts containers that fail health checks
#   5. Backend liveness        — restarts the backend if /health stops responding
#
# Compatible with macOS bash 3.2. No associative arrays.
#
# Usage:
#   scripts/self-heal.sh              # foreground
#   scripts/self-heal.sh --daemon     # background
#   scripts/self-heal.sh --stop       # stop
#   scripts/self-heal.sh --status     # check
#   scripts/self-heal.sh --run-once   # single pass then exit (for cron/testing)
#

PROJECT_DIR="/Users/mikefink/Documents/ai-memory-chain"
LOG_DIR="$PROJECT_DIR/logs"
PIDFILE="$LOG_DIR/self-heal.pid"
LOGFILE="$LOG_DIR/self-heal.log"
STATE_DIR="$LOG_DIR/.self-heal-state"
PEERS_FILE="$PROJECT_DIR/config/peers.json"

# Intervals (seconds)
POLL_INTERVAL=60
PEER_RECONNECT_INTERVAL=300     # 5 min
PIN_RECONCILE_INTERVAL=900      # 15 min
SYNC_CHECK_INTERVAL=120         # 2 min
DOCKER_CHECK_INTERVAL=180       # 3 min
BACKEND_CHECK_INTERVAL=60       # 1 min

MAX_LOG_BYTES=5242880  # 5 MB

DOCKER="/usr/local/bin/docker"
if [ ! -x "$DOCKER" ]; then DOCKER="$HOME/.docker/bin/docker"; fi
if [ ! -x "$DOCKER" ]; then DOCKER="$(which docker 2>/dev/null)"; fi

mkdir -p "$LOG_DIR" "$STATE_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOGFILE"
}

rotate_log() {
  local size
  size=$(stat -f%z "$LOGFILE" 2>/dev/null || echo 0)
  if [ -f "$LOGFILE" ] && [ "$size" -gt "$MAX_LOG_BYTES" ]; then
    mv "$LOGFILE" "${LOGFILE}.prev"
    log "Log rotated."
  fi
}

now_epoch() {
  date +%s
}

# Returns 0 if enough time has passed since last run of the named task
should_run() {
  local task="$1" interval="$2"
  local state_file="$STATE_DIR/$task"
  if [ ! -f "$state_file" ]; then
    echo "$(now_epoch)" > "$state_file"
    return 0
  fi
  local last
  last=$(cat "$state_file")
  local elapsed=$(( $(now_epoch) - last ))
  if [ "$elapsed" -ge "$interval" ]; then
    echo "$(now_epoch)" > "$state_file"
    return 0
  fi
  return 1
}

# ── CLI ───────────────────────────────────────────────────────────────

stop_daemon() {
  if [ -f "$PIDFILE" ]; then
    local pid
    pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      echo "Self-heal daemon stopped (was PID $pid)."
      log "Daemon stopped by --stop."
    else
      echo "Self-heal PID $pid is not running."
    fi
    rm -f "$PIDFILE"
  else
    echo "No self-heal PID file found."
  fi
  exit 0
}

show_status() {
  if [ -f "$PIDFILE" ]; then
    local pid
    pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Self-heal daemon is running (PID $pid)."
      echo ""
      echo "Task last-run times:"
      for f in "$STATE_DIR"/*; do
        [ -f "$f" ] || continue
        local task last ago
        task=$(basename "$f")
        last=$(cat "$f")
        ago=$(( $(now_epoch) - last ))
        echo "  $task: ${ago}s ago"
      done
    else
      echo "Self-heal PID file exists but process $pid is dead."
      rm -f "$PIDFILE"
    fi
  else
    echo "Self-heal daemon is not running."
  fi
  exit 0
}

RUN_ONCE=false

case "${1:-}" in
  --stop)     stop_daemon ;;
  --status)   show_status ;;
  --run-once) RUN_ONCE=true ;;
  --daemon)
    nohup "$0" >> "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    echo "Self-heal daemon started in background (PID $!)."
    exit 0
    ;;
esac

# ── Guard against duplicate ───────────────────────────────────────────

if [ -f "$PIDFILE" ]; then
  old_pid=$(cat "$PIDFILE")
  if [ "$old_pid" != "$$" ] && kill -0 "$old_pid" 2>/dev/null; then
    echo "Another self-heal daemon is already running (PID $old_pid)."
    exit 1
  fi
  rm -f "$PIDFILE"
fi

echo $$ > "$PIDFILE"
mkdir -p "$STATE_DIR"

cleanup() {
  rm -f "$PIDFILE"
  log "Self-heal daemon exiting."
  exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

log "Self-heal daemon started (PID $$)"

# ═══════════════════════════════════════════════════════════════════════
# Task implementations
# ═══════════════════════════════════════════════════════════════════════

# ── 1. IPFS Peer Reconnection ────────────────────────────────────────
#
# Reads known peers from config/peers.json and ensures we're connected.
# Format: { "ipfs_peers": [ "/ip4/.../p2p/QmXXX", ... ] }
#
task_ipfs_peer_reconnect() {
  if [ ! -f "$PEERS_FILE" ]; then
    return
  fi

  local peers
  peers=$(python3 -c "
import json, sys
try:
    cfg = json.load(open('$PEERS_FILE'))
    for p in cfg.get('ipfs_peers', []):
        print(p)
except: pass
" 2>/dev/null)

  if [ -z "$peers" ]; then
    return
  fi

  local connected reconnected failed
  connected=0
  reconnected=0
  failed=0

  for addr in $peers; do
    # Extract the peer ID (last component after /p2p/)
    peer_id=$(echo "$addr" | grep -o '/p2p/[^/]*$' | cut -c5-)
    if [ -z "$peer_id" ]; then
      continue
    fi

    # Check if already connected
    is_connected=$(curl -s -X POST "http://localhost:5001/api/v0/swarm/peers" 2>/dev/null \
      | python3 -c "
import sys, json
d = json.load(sys.stdin)
peers = d.get('Peers') or []
for p in peers:
    if p.get('Peer') == '$peer_id':
        print('yes')
        break
" 2>/dev/null)

    if [ "$is_connected" = "yes" ]; then
      connected=$((connected + 1))
    else
      # Attempt reconnect
      result=$(curl -s -X POST "http://localhost:5001/api/v0/swarm/connect?arg=$addr" 2>/dev/null)
      if echo "$result" | grep -q "success"; then
        reconnected=$((reconnected + 1))
        log "IPFS: Reconnected to $peer_id"
      else
        failed=$((failed + 1))
        log "IPFS: Failed to connect to $peer_id — $result"
      fi
    fi
  done

  if [ "$reconnected" -gt 0 ] || [ "$failed" -gt 0 ]; then
    log "IPFS peers: $connected connected, $reconnected reconnected, $failed failed"
  fi
}

# ── 2. IPFS Pin Reconciliation ───────────────────────────────────────
#
# Walks on-chain memories and pins any CIDs missing from the local node.
# Skips CIDs that failed previously (with cooldown).
#
task_ipfs_pin_reconcile() {
  # Get memory count from the backend
  local count
  count=$(curl -s --max-time 5 "http://localhost:3001/memory/list" 2>/dev/null \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)

  if [ -z "$count" ] || [ "$count" = "0" ]; then
    return
  fi

  # Get all locally pinned CIDs
  local pinned_cids
  pinned_cids=$(curl -s -X POST "http://localhost:5001/api/v0/pin/ls?type=recursive" 2>/dev/null \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k in d.get('Keys', {}):
    print(k)
" 2>/dev/null)

  local missing=0
  local pinned=0
  local errors=0

  # Check each memory's CID
  for i in $(seq 0 $((count - 1))); do
    local cid
    cid=$(curl -s --max-time 5 "http://localhost:3001/memory/$i" 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('ipfsCID',''))" 2>/dev/null)

    if [ -z "$cid" ]; then
      continue
    fi

    # Check if already pinned
    if echo "$pinned_cids" | grep -q "^${cid}$"; then
      continue
    fi

    # Check cooldown for failed pins (don't retry for 1 hour)
    local fail_file="$STATE_DIR/pin-fail-$cid"
    if [ -f "$fail_file" ]; then
      local fail_time
      fail_time=$(cat "$fail_file")
      local elapsed=$(( $(now_epoch) - fail_time ))
      if [ "$elapsed" -lt 3600 ]; then
        continue
      fi
      rm -f "$fail_file"
    fi

    missing=$((missing + 1))

    # Try to pin it (with a timeout so we don't hang forever)
    log "IPFS: Pinning missing CID $cid (memory #$i)..."
    local pin_result
    pin_result=$(curl -s --max-time 30 -X POST "http://localhost:5001/api/v0/pin/add?arg=$cid" 2>/dev/null)

    if echo "$pin_result" | grep -q "Pins"; then
      pinned=$((pinned + 1))
      log "IPFS: Successfully pinned $cid"
    else
      errors=$((errors + 1))
      echo "$(now_epoch)" > "$fail_file"
      log "IPFS: Failed to pin $cid — $pin_result"
    fi
  done

  if [ "$missing" -gt 0 ]; then
    log "IPFS pin reconciliation: $missing missing, $pinned pinned, $errors failed"
  fi
}

# ── 3. Blockchain Sync Monitor ───────────────────────────────────────
#
# Detects stalled block production and logs warnings.
#
task_blockchain_sync_check() {
  local current_block
  current_block=$(curl -s --max-time 5 -X POST \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://localhost:8545 2>/dev/null \
    | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))" 2>/dev/null)

  if [ -z "$current_block" ]; then
    log "CHAIN: Cannot reach Polygon Edge RPC — node may be down"
    return
  fi

  # Compare to last known block
  local last_block_file="$STATE_DIR/last-block"
  local last_block_time_file="$STATE_DIR/last-block-time"

  if [ -f "$last_block_file" ]; then
    local last_block
    last_block=$(cat "$last_block_file")
    local last_time
    last_time=$(cat "$last_block_time_file" 2>/dev/null || echo "$(now_epoch)")

    local block_diff=$((current_block - last_block))
    local time_diff=$(( $(now_epoch) - last_time ))

    if [ "$block_diff" -eq 0 ] && [ "$time_diff" -gt 300 ]; then
      log "CHAIN WARNING: Block production stalled at #$current_block for ${time_diff}s"

      # Check if the Polygon Edge container is healthy
      local container_status
      container_status=$("$DOCKER" inspect --format='{{.State.Health.Status}}' polygon-edge 2>/dev/null)
      if [ "$container_status" != "healthy" ]; then
        log "CHAIN: Polygon Edge container status: $container_status — restarting"
        "$DOCKER" restart polygon-edge >> "$LOGFILE" 2>&1
      fi
    elif [ "$block_diff" -gt 0 ]; then
      # Only update the "last block" when blocks actually advance
      echo "$current_block" > "$last_block_file"
      echo "$(now_epoch)" > "$last_block_time_file"
    fi
  else
    echo "$current_block" > "$last_block_file"
    echo "$(now_epoch)" > "$last_block_time_file"
  fi

  # Check peer count
  local peer_count
  peer_count=$(curl -s --max-time 5 -X POST \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' \
    http://localhost:8545 2>/dev/null \
    | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))" 2>/dev/null)

  if [ -n "$peer_count" ] && [ "$peer_count" = "0" ]; then
    # Single-validator mode is expected for now; log for awareness
    local peer_warn_file="$STATE_DIR/peer-warn-suppressed"
    if [ ! -f "$peer_warn_file" ]; then
      log "CHAIN: 0 blockchain peers connected (expected if single-validator)"
      echo "$(now_epoch)" > "$peer_warn_file"
    fi
  fi
}

# ── 4. Docker Health Recovery ─────────────────────────────────────────
#
# Checks Docker container health and restarts unhealthy ones.
#
task_docker_health() {
  if ! "$DOCKER" info > /dev/null 2>&1; then
    log "DOCKER: Docker daemon not responding"
    return
  fi

  for container in polygon-edge ipfs-node; do
    local status
    status=$("$DOCKER" inspect --format='{{.State.Status}}' "$container" 2>/dev/null)

    if [ -z "$status" ]; then
      log "DOCKER: Container $container not found — running docker compose up"
      cd "$PROJECT_DIR" && "$DOCKER" compose up -d >> "$LOGFILE" 2>&1
      return
    fi

    if [ "$status" != "running" ]; then
      log "DOCKER: Container $container is $status — restarting"
      "$DOCKER" restart "$container" >> "$LOGFILE" 2>&1
      continue
    fi

    # Check health status for running containers
    local health
    health=$("$DOCKER" inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)

    if [ "$health" = "unhealthy" ]; then
      log "DOCKER: Container $container is unhealthy — restarting"
      "$DOCKER" restart "$container" >> "$LOGFILE" 2>&1
    fi
  done
}

# ── 5. Backend Liveness ──────────────────────────────────────────────
#
# Checks if the backend API responds. After sustained failures, restarts it.
#
task_backend_liveness() {
  local response
  response=$(curl -s --max-time 5 "http://localhost:3001/health" 2>/dev/null)

  if echo "$response" | grep -q '"ok"'; then
    # Healthy — clear any failure counter
    rm -f "$STATE_DIR/backend-failures"
    return
  fi

  # Increment failure counter
  local fail_file="$STATE_DIR/backend-failures"
  local failures=0
  if [ -f "$fail_file" ]; then
    failures=$(cat "$fail_file")
  fi
  failures=$((failures + 1))
  echo "$failures" > "$fail_file"

  log "BACKEND: Health check failed (failure $failures/3)"

  if [ "$failures" -ge 3 ]; then
    log "BACKEND: 3 consecutive failures — restarting"
    rm -f "$fail_file"

    # Kill existing backend
    local pid_file="$LOG_DIR/backend.pid"
    if [ -f "$pid_file" ]; then
      local pid
      pid=$(cat "$pid_file")
      kill "$pid" 2>/dev/null
      sleep 2
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    fi

    # Also kill anything on port 3001
    local port_pid
    port_pid=$(lsof -ti:3001 2>/dev/null)
    if [ -n "$port_pid" ]; then
      kill -9 "$port_pid" 2>/dev/null
      sleep 1
    fi

    # Restart — need the env vars
    export PATH="/opt/homebrew/bin:$PATH"
    export CONTRACT_ADDRESS=$(cat "$PROJECT_DIR/deployment.json" 2>/dev/null | grep '"address"' | sed 's/.*: *"\(.*\)".*/\1/')
    export DEPLOYER_PRIVATE_KEY="0x$(cat "$PROJECT_DIR/data/polygon-edge/node1/consensus/validator.key" 2>/dev/null)"

    cd "$PROJECT_DIR/backend"
    /opt/homebrew/bin/node dist/index.js >> "$LOG_DIR/backend.log" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$pid_file"
    log "BACKEND: Restarted (new PID $new_pid)"
  fi
}

# ── 6. IPFS Content Integrity Spot Check ─────────────────────────────
#
# Picks a random on-chain memory and verifies its IPFS content
# matches the SHA-256 hash stored on-chain.
#
task_integrity_spot_check() {
  local count
  count=$(curl -s --max-time 5 "http://localhost:3001/memory/list" 2>/dev/null \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)

  if [ -z "$count" ] || [ "$count" = "0" ]; then
    return
  fi

  # Pick a random memory and verify via a single python script to avoid
  # shell escaping issues with JSON content
  local random_id=$(( RANDOM % count ))

  # Fetch the on-chain record for the CID and hash, then fetch the raw
  # IPFS content and compare the SHA-256 hash. Using raw bytes avoids
  # JSON key-ordering false positives from parse/stringify cycles.
  local result
  result=$(python3 -c "
import json, hashlib, sys, urllib.request

try:
    req = urllib.request.Request('http://localhost:3001/memory/$random_id')
    with urllib.request.urlopen(req, timeout=15) as resp:
        record = json.loads(resp.read())

    cid = record.get('ipfsCID', '')
    chain_hash = record.get('sha256Hash', '')

    if not cid or not chain_hash:
        print('skip')
        sys.exit(0)

    # Fetch raw bytes from IPFS gateway and hash them directly
    gw = urllib.request.Request('http://localhost:8080/ipfs/' + cid)
    with urllib.request.urlopen(gw, timeout=10) as gw_resp:
        raw_bytes = gw_resp.read()

    computed = '0x' + hashlib.sha256(raw_bytes).hexdigest()

    if computed != chain_hash:
        print(f'mismatch:{record[\"id\"]}:{chain_hash[:20]}:{computed[:20]}')
    else:
        print('ok')
except Exception as e:
    print(f'error:{e}')
" 2>/dev/null)

  case "$result" in
    mismatch:*)
      log "INTEGRITY: Hash mismatch for memory #$random_id — $result"
      ;;
    error:*)
      ;;
  esac
}

# ═══════════════════════════════════════════════════════════════════════
# Main loop
# ═══════════════════════════════════════════════════════════════════════

run_tasks() {
  if should_run "peer-reconnect" "$PEER_RECONNECT_INTERVAL"; then
    task_ipfs_peer_reconnect
  fi

  if should_run "pin-reconcile" "$PIN_RECONCILE_INTERVAL"; then
    task_ipfs_pin_reconcile
  fi

  if should_run "sync-check" "$SYNC_CHECK_INTERVAL"; then
    task_blockchain_sync_check
  fi

  if should_run "docker-health" "$DOCKER_CHECK_INTERVAL"; then
    task_docker_health
  fi

  if should_run "backend-liveness" "$BACKEND_CHECK_INTERVAL"; then
    task_backend_liveness
  fi

  if should_run "integrity-check" "$PIN_RECONCILE_INTERVAL"; then
    task_integrity_spot_check
  fi
}

if [ "$RUN_ONCE" = "true" ]; then
  log "Running single pass (--run-once)"
  # Force all tasks to run
  rm -rf "$STATE_DIR"
  mkdir -p "$STATE_DIR"
  run_tasks
  log "Single pass complete"
  rm -f "$PIDFILE"
  exit 0
fi

while true; do
  rotate_log
  run_tasks
  sleep "$POLL_INTERVAL"
done
