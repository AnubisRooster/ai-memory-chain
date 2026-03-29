#!/bin/bash
#
# Install AI Memory Chain as a macOS login service.
#
# IMPORTANT: Run from Terminal.app (not from Cursor or other IDE terminals).
# IDE terminals tag files with com.apple.provenance, which prevents launchd
# from executing them. If you must run from an IDE, the script will detect
# and strip provenance automatically where possible.
#
#   bash ~/Documents/ai-memory-chain/scripts/install-service.sh
#

set -e

PROJECT_DIR="$HOME/Documents/ai-memory-chain"
PLIST="$HOME/Library/LaunchAgents/com.mikefink.ai-memory-chain.plist"
STARTUP="$PROJECT_DIR/scripts/startup.sh"
SHUTDOWN="$PROJECT_DIR/scripts/shutdown.sh"

strip_provenance() {
  for f in "$@"; do
    [ -f "$f" ] || continue
    if xattr -l "$f" 2>/dev/null | grep -q "com.apple.provenance"; then
      xattr -d com.apple.provenance "$f" 2>/dev/null || true
      xattr -cr "$f" 2>/dev/null || true
    fi
  done
}

echo "Installing AI Memory Chain as a login service..."
echo ""

# --- Create startup script ---
rm -f "$STARTUP"
cat > "$STARTUP" << 'ENDOFSTARTUP'
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


# ── Start CPU watchdog ────────────────────────────────────────────────
WATCHDOG="$PROJECT_DIR/scripts/watchdog.sh"
if [ -x "$WATCHDOG" ]; then
  "$WATCHDOG" --stop 2>/dev/null
  "$WATCHDOG" --daemon
  log "CPU watchdog started."
fi

# ── Start self-heal daemon ───────────────────────────────────────────
SELF_HEAL="$PROJECT_DIR/scripts/self-heal.sh"
if [ -x "$SELF_HEAL" ]; then
  "$SELF_HEAL" --stop 2>/dev/null
  "$SELF_HEAL" --daemon
  log "Self-heal daemon started."
fi

log "=== AI Memory Chain startup complete ==="
log "  Backend:  http://localhost:3001  (PID $BACKEND_PID)"
log "  Frontend: http://localhost:3000  (PID $FRONTEND_PID)"

wait
ENDOFSTARTUP
chmod +x "$STARTUP"

# --- Create shutdown script ---
rm -f "$SHUTDOWN"
cat > "$SHUTDOWN" << 'ENDOFSHUTDOWN'
#!/bin/bash
PROJECT_DIR="/Users/mikefink/Documents/ai-memory-chain"
LOG_DIR="$PROJECT_DIR/logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_DIR/startup.log"; }

log "=== AI Memory Chain shutdown ==="

# Stop daemons first
SELF_HEAL="$PROJECT_DIR/scripts/self-heal.sh"
[ -x "$SELF_HEAL" ] && "$SELF_HEAL" --stop 2>/dev/null

WATCHDOG="$PROJECT_DIR/scripts/watchdog.sh"
[ -x "$WATCHDOG" ] && "$WATCHDOG" --stop 2>/dev/null

# Graceful stop via PID files
for svc in backend frontend; do
  pidfile="$LOG_DIR/${svc}.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      log "Stopping $svc (PID $pid)..."
      kill "$pid" 2>/dev/null
    fi
    rm -f "$pidfile"
  fi
done

# Grace period for clean exit
sleep 3

# Force-kill anything still on our ports
for PORT in 3001 3000; do
  PID=$(lsof -ti:"$PORT" 2>/dev/null)
  if [ -n "$PID" ]; then
    log "Force-killing leftover process on port $PORT (pid $PID)"
    kill -9 "$PID" 2>/dev/null
  fi
done

log "=== AI Memory Chain shutdown complete ==="
ENDOFSHUTDOWN
chmod +x "$SHUTDOWN"

# --- Create LaunchAgent plist ---
rm -f "$PLIST"
cat > "$PLIST" << 'ENDOFPLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mikefink.ai-memory-chain</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>. /Users/mikefink/Documents/ai-memory-chain/scripts/startup.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>30</integer>
    <key>StandardOutPath</key>
    <string>/Users/mikefink/Documents/ai-memory-chain/logs/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/mikefink/Documents/ai-memory-chain/logs/launchd-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>/Users/mikefink</string>
    </dict>
</dict>
</plist>
ENDOFPLIST

# --- Strip provenance if present (IDE-written files) ---
strip_provenance "$STARTUP" "$SHUTDOWN" "$PLIST"

# --- Load the service ---
mkdir -p "$PROJECT_DIR/logs"
launchctl bootout "gui/$(id -u)/com.mikefink.ai-memory-chain" 2>/dev/null
launchctl unload "$PLIST" 2>/dev/null
sleep 1
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"

# Verify it loaded
if launchctl print "gui/$(id -u)/com.mikefink.ai-memory-chain" > /dev/null 2>&1; then
  echo ""
  echo "AI Memory Chain installed as a login service."
else
  echo ""
  echo "WARNING: LaunchAgent failed to load."
  echo "If you ran this from an IDE, try again from Terminal.app:"
  echo "  bash $PROJECT_DIR/scripts/install-service.sh"
  echo ""
  exit 1
fi
echo ""
echo "   Service: com.mikefink.ai-memory-chain"
echo "   Plist:   $PLIST"
echo "   Startup: $STARTUP"
echo "   Logs:    $PROJECT_DIR/logs/"
echo ""
echo "   It will start automatically when you log in."
echo "   Docker Desktop must also be set to start at login"
echo "   (Docker Desktop > Settings > General > 'Start Docker Desktop when you sign in')"
echo ""
echo "   Manual commands:"
echo "     Start now:     launchctl kickstart -k gui/$(id -u)/com.mikefink.ai-memory-chain"
echo "     Stop:          bash $SHUTDOWN"
echo "     View logs:     tail -f $PROJECT_DIR/logs/startup.log"
echo "     Uninstall:     launchctl bootout gui/$(id -u)/com.mikefink.ai-memory-chain"
echo ""
