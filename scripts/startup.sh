#!/bin/bash
PROJECT_DIR="/Users/mikefink/Documents/ai-memory-chain"
LOG_DIR="$PROJECT_DIR/logs"
NPX="/opt/homebrew/bin/npx"
NODE="/opt/homebrew/bin/node"
DOCKER="/usr/local/bin/docker"
if [ ! -x "$DOCKER" ]; then DOCKER="$HOME/.docker/bin/docker"; fi
if [ ! -x "$DOCKER" ]; then DOCKER="$(which docker 2>/dev/null)"; fi
mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_DIR/startup.log"; }

rotate_log() {
  local f="$1" max_bytes="${2:-5242880}" # 5 MB default
  if [ -f "$f" ] && [ "$(stat -f%z "$f" 2>/dev/null || echo 0)" -gt "$max_bytes" ]; then
    mv "$f" "${f}.prev"
    log "Rotated $(basename "$f") (exceeded $((max_bytes/1024))K)"
  fi
}

wait_for_url() {
  local url="$1" label="$2" max="$3" method="${4:-GET}"
  local attempt=0
  while true; do
    if [ "$method" = "POST" ]; then
      curl -sf -X POST "$url" > /dev/null 2>&1 && return 0
    else
      curl -sf "$url" > /dev/null 2>&1 && return 0
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max" ]; then
      log "WARNING: $label not responding after $((max * 2))s."
      return 1
    fi
    sleep 2
  done
}

cleanup() {
  log "Caught signal — shutting down children..."
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  sleep 2
  [ -n "$BACKEND_PID" ]  && kill -0 "$BACKEND_PID"  2>/dev/null && kill -9 "$BACKEND_PID"  2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null && kill -9 "$FRONTEND_PID" 2>/dev/null
  rm -f "$LOG_DIR/backend.pid" "$LOG_DIR/frontend.pid"
  log "Children stopped."
  exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

log "=== AI Memory Chain startup begin ==="

# Rotate logs that have grown large
for f in "$LOG_DIR"/backend.log "$LOG_DIR"/frontend.log "$LOG_DIR"/docker.log "$LOG_DIR"/startup.log; do
  rotate_log "$f"
done

# ── Docker ────────────────────────────────────────────────────────────
ATTEMPTS=0
while ! "$DOCKER" info > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 60 ]; then log "ERROR: Docker not ready after 2 min."; exit 1; fi
  [ $((ATTEMPTS % 10)) -eq 0 ] && log "Waiting for Docker... ($ATTEMPTS/60)"
  sleep 2
done
log "Docker daemon is ready."

cd "$PROJECT_DIR"
"$DOCKER" compose up -d >> "$LOG_DIR/docker.log" 2>&1
log "Docker containers started."

# ── Infrastructure health gates ───────────────────────────────────────
wait_for_url "http://localhost:8545" "Polygon Edge" 30
log "Polygon Edge is ready."

wait_for_url "http://localhost:5001/api/v0/id" "IPFS" 15 POST
log "IPFS is ready."

# ── Kill stale processes on our ports ─────────────────────────────────
for PORT in 3001 3000; do
  PID=$(lsof -ti:"$PORT" 2>/dev/null)
  if [ -n "$PID" ]; then
    log "Killing stale process on port $PORT (pid $PID)"
    kill "$PID" 2>/dev/null; sleep 1
    kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null
  fi
done

# ── Environment ───────────────────────────────────────────────────────
export PATH="/opt/homebrew/bin:$PATH"
export CONTRACT_ADDRESS=$(cat "$PROJECT_DIR/deployment.json" 2>/dev/null | grep '"address"' | sed 's/.*: *"\(.*\)".*/\1/')
export DEPLOYER_PRIVATE_KEY="0x$(cat "$PROJECT_DIR/data/polygon-edge/node1/consensus/validator.key" 2>/dev/null)"

if [ -z "$CONTRACT_ADDRESS" ]; then
  log "WARNING: CONTRACT_ADDRESS is empty — deployment.json may be missing."
fi

# ── Rebuild backend if source is newer than dist ──────────────────────
BACKEND_SRC="$PROJECT_DIR/backend/src"
BACKEND_DIST="$PROJECT_DIR/backend/dist/index.js"
if [ ! -f "$BACKEND_DIST" ] || [ -n "$(find "$BACKEND_SRC" -name '*.ts' -newer "$BACKEND_DIST" 2>/dev/null | head -1)" ]; then
  log "Backend source newer than dist — rebuilding..."
  cd "$PROJECT_DIR/backend"
  "$NPX" tsc >> "$LOG_DIR/backend.log" 2>&1
  if [ $? -eq 0 ]; then
    log "Backend rebuild succeeded."
  else
    log "ERROR: Backend rebuild failed — starting with stale dist."
  fi
fi

# ── Rebuild frontend if .next/BUILD_ID is missing ─────────────────────
if [ ! -f "$PROJECT_DIR/frontend/.next/BUILD_ID" ]; then
  log "Frontend BUILD_ID missing — rebuilding..."
  cd "$PROJECT_DIR/frontend"
  "$NPX" next build >> "$LOG_DIR/frontend.log" 2>&1
  if [ $? -eq 0 ]; then
    log "Frontend rebuild succeeded."
  else
    log "ERROR: Frontend rebuild failed."
    exit 1
  fi
fi

# ── Start backend ─────────────────────────────────────────────────────
cd "$PROJECT_DIR/backend"
"$NODE" dist/index.js >> "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
log "Backend started (PID $BACKEND_PID)"

sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  log "ERROR: Backend process exited immediately — check backend.log"
  exit 1
fi

ATTEMPTS=0
while ! curl -sf http://localhost:3001/health > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 10 ]; then log "WARNING: Backend /health not responding after 20s."; break; fi
  sleep 2
done
log "Backend health check passed."

# ── Start frontend (use npx — .bin/next is a shell script, not a JS module) ──
cd "$PROJECT_DIR/frontend"
"$NPX" next start --port 3000 --hostname 0.0.0.0 >> "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"
log "Frontend started (PID $FRONTEND_PID)"

sleep 3
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  log "ERROR: Frontend process exited immediately — check frontend.log"
  exit 1
fi

ATTEMPTS=0
while ! curl -sf -o /dev/null http://localhost:3000 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 10 ]; then log "WARNING: Frontend not responding after 20s."; break; fi
  sleep 2
done
log "Frontend health check passed."

log "=== AI Memory Chain startup complete ==="
log "  Backend:  http://localhost:3001  (PID $BACKEND_PID)"
log "  Frontend: http://localhost:3000  (PID $FRONTEND_PID)"

wait
