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
