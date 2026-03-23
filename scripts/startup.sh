#!/bin/bash
PROJECT_DIR="/Users/mikefink/Documents/ai-memory-chain"
LOG_DIR="$PROJECT_DIR/logs"
NODE="/opt/homebrew/bin/node"
DOCKER="/usr/local/bin/docker"
if [ ! -x "$DOCKER" ]; then DOCKER="$HOME/.docker/bin/docker"; fi
if [ ! -x "$DOCKER" ]; then DOCKER="$(which docker 2>/dev/null)"; fi
mkdir -p "$LOG_DIR"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_DIR/startup.log"; }

log "=== AI Memory Chain startup begin ==="

# Wait for Docker daemon (up to 2 minutes)
ATTEMPTS=0
while ! "$DOCKER" info > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 60 ]; then log "ERROR: Docker not ready after 2 min."; exit 1; fi
  log "Waiting for Docker... ($ATTEMPTS/60)"
  sleep 2
done
log "Docker daemon is ready."

# Start containers
cd "$PROJECT_DIR"
"$DOCKER" compose up -d >> "$LOG_DIR/docker.log" 2>&1
log "Docker containers started."

# Wait for Polygon Edge
ATTEMPTS=0
while ! curl -s http://localhost:8545 > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 30 ]; then log "WARNING: Polygon Edge not responding."; break; fi
  sleep 2
done
log "Polygon Edge is ready."

# Wait for IPFS
ATTEMPTS=0
while ! curl -s -X POST http://localhost:5001/api/v0/id > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 15 ]; then log "WARNING: IPFS not responding."; break; fi
  sleep 2
done
log "IPFS is ready."

# Kill any stale processes on our ports
for PORT in 3001 3000; do
  PID=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$PID" ]; then log "Killing stale process on port $PORT"; kill -9 $PID 2>/dev/null; sleep 1; fi
done

# Set environment
export PATH="/opt/homebrew/bin:$PATH"
export CONTRACT_ADDRESS=$(cat "$PROJECT_DIR/deployment.json" 2>/dev/null | grep '"address"' | sed 's/.*: *"\(.*\)".*/\1/')
export DEPLOYER_PRIVATE_KEY="0x$(cat "$PROJECT_DIR/data/polygon-edge/node1/consensus/validator.key" 2>/dev/null)"

# Start backend (production build)
cd "$PROJECT_DIR/backend"
"$NODE" dist/index.js >> "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
log "Backend started (PID $BACKEND_PID)"

# Start frontend (production build)
cd "$PROJECT_DIR/frontend"
"$NODE" node_modules/.bin/next start --port 3000 --hostname 0.0.0.0 >> "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
log "Frontend started (PID $FRONTEND_PID)"

echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"

log "=== AI Memory Chain startup complete ==="
log "  Backend:  http://localhost:3001  (PID $BACKEND_PID)"
log "  Frontend: http://localhost:3000  (PID $FRONTEND_PID)"

wait
