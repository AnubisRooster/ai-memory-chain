#!/bin/bash
#
# AI Memory Chain — clean shutdown
#

PROJECT_DIR="/Users/mikefink/Documents/ai-memory-chain"
LOG_DIR="$PROJECT_DIR/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_DIR/startup.log"
}

log "=== AI Memory Chain shutdown begin ==="

# Stop Node.js processes
if [ -f "$LOG_DIR/backend.pid" ]; then
  kill "$(cat "$LOG_DIR/backend.pid")" 2>/dev/null
  rm "$LOG_DIR/backend.pid"
  log "Backend stopped."
fi

if [ -f "$LOG_DIR/frontend.pid" ]; then
  kill "$(cat "$LOG_DIR/frontend.pid")" 2>/dev/null
  rm "$LOG_DIR/frontend.pid"
  log "Frontend stopped."
fi

# Also kill by port in case PIDs are stale
for PORT in 3001 3000; do
  PID=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$PID" ]; then
    kill $PID 2>/dev/null
  fi
done

log "=== AI Memory Chain shutdown complete ==="
