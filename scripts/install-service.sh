#!/bin/bash
#
# Run this ONCE from Terminal.app (not from an IDE terminal):
#   bash ~/Documents/ai-memory-chain/scripts/install-service.sh
#
# It creates the startup script and macOS LaunchAgent so AI Memory Chain
# starts automatically every time you log in.
#

set -e

PROJECT_DIR="$HOME/Documents/ai-memory-chain"
PLIST="$HOME/Library/LaunchAgents/com.mikefink.ai-memory-chain.plist"
STARTUP="$PROJECT_DIR/scripts/startup.sh"
SHUTDOWN="$PROJECT_DIR/scripts/shutdown.sh"

echo "Installing AI Memory Chain as a login service..."
echo ""

# --- Create startup script ---
rm -f "$STARTUP"
cat > "$STARTUP" << 'ENDOFSTARTUP'
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
if [ -f "$LOG_DIR/backend.pid" ]; then kill "$(cat "$LOG_DIR/backend.pid")" 2>/dev/null; rm "$LOG_DIR/backend.pid"; fi
if [ -f "$LOG_DIR/frontend.pid" ]; then kill "$(cat "$LOG_DIR/frontend.pid")" 2>/dev/null; rm "$LOG_DIR/frontend.pid"; fi
for PORT in 3001 3000; do PID=$(lsof -ti:$PORT 2>/dev/null); [ -n "$PID" ] && kill $PID 2>/dev/null; done
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
        <string>/Users/mikefink/Documents/ai-memory-chain/scripts/startup.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/Users/mikefink/Documents/ai-memory-chain/logs/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/mikefink/Documents/ai-memory-chain/logs/launchd-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
ENDOFPLIST

# --- Load the service ---
mkdir -p "$PROJECT_DIR/logs"
launchctl unload "$PLIST" 2>/dev/null
launchctl load "$PLIST"

echo ""
echo "✅ AI Memory Chain installed as a login service."
echo ""
echo "   Service: com.mikefink.ai-memory-chain"
echo "   Plist:   $PLIST"
echo "   Startup: $STARTUP"
echo "   Logs:    $PROJECT_DIR/logs/"
echo ""
echo "   It will start automatically when you log in."
echo "   Docker Desktop must also be set to start at login"
echo "   (Docker Desktop → Settings → General → 'Start Docker Desktop when you sign in')"
echo ""
echo "   Manual commands:"
echo "     Start now:     launchctl start com.mikefink.ai-memory-chain"
echo "     Stop:          bash $SHUTDOWN"
echo "     View logs:     tail -f $PROJECT_DIR/logs/startup.log"
echo "     Uninstall:     launchctl unload $PLIST && rm $PLIST"
echo ""
