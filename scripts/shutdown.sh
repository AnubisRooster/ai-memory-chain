#!/bin/bash
PROJECT_DIR="/Users/mikefink/Documents/ai-memory-chain"
LOG_DIR="$PROJECT_DIR/logs"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_DIR/startup.log"; }
log "=== AI Memory Chain shutdown ==="
if [ -f "$LOG_DIR/backend.pid" ]; then kill "$(cat "$LOG_DIR/backend.pid")" 2>/dev/null; rm "$LOG_DIR/backend.pid"; fi
if [ -f "$LOG_DIR/frontend.pid" ]; then kill "$(cat "$LOG_DIR/frontend.pid")" 2>/dev/null; rm "$LOG_DIR/frontend.pid"; fi
for PORT in 3001 3000; do PID=$(lsof -ti:$PORT 2>/dev/null); [ -n "$PID" ] && kill $PID 2>/dev/null; done
log "=== AI Memory Chain shutdown complete ==="
