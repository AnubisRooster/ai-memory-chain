#!/bin/bash
#
# CPU watchdog for AI Memory Chain node processes.
#
# Scans for project-related node processes exceeding sustained CPU
# thresholds. After STRIKE_LIMIT consecutive violations the offending
# process tree is killed and the event is logged.
#
# Detection identifies project processes two ways:
#   1. Command line contains the project path (ts-node-dev, npm, etc.)
#   2. Process cwd is inside the project directory (relative-path launches)
#
# Compatible with macOS bash 3.2 (no associative arrays).
#
# Usage:
#   scripts/watchdog.sh              # run in foreground
#   scripts/watchdog.sh --daemon     # fork to background
#   scripts/watchdog.sh --stop       # stop a running watchdog
#   scripts/watchdog.sh --status     # check if running
#

PROJECT_DIR="/Users/mikefink/Documents/ai-memory-chain"
LOG_DIR="$PROJECT_DIR/logs"
PIDFILE="$LOG_DIR/watchdog.pid"
LOGFILE="$LOG_DIR/watchdog.log"
STRIKE_DIR="$LOG_DIR/.watchdog-strikes"

CPU_THRESHOLD=85        # percent per-core
STRIKE_LIMIT=4          # consecutive checks before kill (~2 min at 30s interval)
POLL_INTERVAL=30        # seconds between scans
MAX_LOG_BYTES=2097152   # 2 MB before rotation

mkdir -p "$LOG_DIR"

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

# ── Strike tracking (file-per-PID, bash 3.2 safe) ────────────────────

init_strikes() {
  rm -rf "$STRIKE_DIR"
  mkdir -p "$STRIKE_DIR"
}

get_strike() {
  if [ -f "$STRIKE_DIR/$1" ]; then cat "$STRIKE_DIR/$1"; else echo 0; fi
}

set_strike() {
  echo "$2" > "$STRIKE_DIR/$1"
}

clear_strike() {
  rm -f "$STRIKE_DIR/$1"
}

prune_dead_strikes() {
  for f in "$STRIKE_DIR"/*; do
    [ -f "$f" ] || continue
    local pid
    pid=$(basename "$f")
    kill -0 "$pid" 2>/dev/null || rm -f "$f"
  done
}

# ── Process identification ────────────────────────────────────────────

is_project_process() {
  local pid="$1" cmd="$2"

  # Match 1: command line contains project path (ts-node-dev, npm scripts, etc.)
  case "$cmd" in
    *ai-memory-chain*) return 0 ;;
  esac

  # Match 2: process working directory is inside the project tree
  local cwd
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep "^n" | head -1 | cut -c2-)
  case "$cwd" in
    "$PROJECT_DIR"*) return 0 ;;
  esac

  return 1
}

# ── CLI commands ──────────────────────────────────────────────────────

stop_watchdog() {
  if [ -f "$PIDFILE" ]; then
    local pid
    pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      echo "Watchdog stopped (was PID $pid)."
      log "Watchdog stopped by --stop."
    else
      echo "Watchdog PID $pid is not running."
    fi
    rm -f "$PIDFILE"
  else
    echo "No watchdog PID file found."
  fi
  exit 0
}

show_status() {
  if [ -f "$PIDFILE" ]; then
    local pid
    pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Watchdog is running (PID $pid)."
    else
      echo "Watchdog PID file exists but process $pid is dead."
      rm -f "$PIDFILE"
    fi
  else
    echo "Watchdog is not running."
  fi
  exit 0
}

case "${1:-}" in
  --stop)   stop_watchdog ;;
  --status) show_status ;;
  --daemon)
    nohup "$0" >> "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    echo "Watchdog started in background (PID $!)."
    exit 0
    ;;
esac

# ── Foreground watchdog loop ──────────────────────────────────────────

if [ -f "$PIDFILE" ]; then
  old_pid=$(cat "$PIDFILE")
  if [ "$old_pid" != "$$" ] && kill -0 "$old_pid" 2>/dev/null; then
    echo "Another watchdog is already running (PID $old_pid). Stop it first."
    exit 1
  fi
  rm -f "$PIDFILE"
fi

echo $$ > "$PIDFILE"
init_strikes

cleanup() {
  rm -f "$PIDFILE"
  rm -rf "$STRIKE_DIR"
  log "Watchdog exiting."
  exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

log "Watchdog started (PID $$) — threshold ${CPU_THRESHOLD}% × ${STRIKE_LIMIT} checks, poll every ${POLL_INTERVAL}s"

while true; do
  rotate_log

  # Collect high-CPU node PIDs that belong to this project.
  # -axww ensures full command output (no truncation).
  TMPFILE=$(mktemp /tmp/watchdog.XXXXXX)

  ps -axww -o pid,%cpu,command 2>/dev/null \
    | grep "[n]ode " \
    | grep -v "Code Helper" \
    | grep -v "Cursor Helper" \
    | while IFS= read -r line; do

    pid=$(echo "$line" | awk '{print $1}')
    cpu_raw=$(echo "$line" | awk '{print $2}')
    cpu=${cpu_raw%%.*}
    cmd=$(echo "$line" | awk '{$1=$2=""; print $0}' | sed 's/^ *//')

    [ "$pid" = "$$" ] && continue
    [ -z "$cpu" ] && continue
    [ "${cpu:-0}" -lt "$CPU_THRESHOLD" ] && continue

    if is_project_process "$pid" "$cmd"; then
      echo "$pid" >> "$TMPFILE"
    fi
  done

  hot_pids=""
  if [ -s "$TMPFILE" ]; then
    hot_pids=$(cat "$TMPFILE")
  fi
  rm -f "$TMPFILE"

  prune_dead_strikes

  for pid in $hot_pids; do
    prev=$(get_strike "$pid")
    count=$((prev + 1))
    set_strike "$pid" "$count"

    if [ "$count" -eq 1 ]; then
      cmd_snip=$(ps -p "$pid" -ww -o command= 2>/dev/null | head -c 160)
      log "WARN: PID $pid at high CPU (strike $count/$STRIKE_LIMIT) — $cmd_snip"
    fi

    if [ "$count" -ge "$STRIKE_LIMIT" ]; then
      detail=$(ps -p "$pid" -ww -o pid=,ppid=,%cpu=,%mem=,etime= 2>/dev/null)
      cmd_snip=$(ps -p "$pid" -ww -o command= 2>/dev/null | head -c 200)
      log "KILL: PID $pid exceeded ${CPU_THRESHOLD}% CPU for $((count * POLL_INTERVAL))s"
      log "  Detail: $detail"
      log "  Command: $cmd_snip"

      # Kill the process group so child workers die too
      pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
      if [ -n "$pgid" ] && [ "$pgid" != "$$" ] && [ "$pgid" != "1" ]; then
        kill -- -"$pgid" 2>/dev/null
        sleep 2
        kill -0 "$pid" 2>/dev/null && kill -9 -- -"$pgid" 2>/dev/null
        log "  Killed process group $pgid."
      else
        kill "$pid" 2>/dev/null
        sleep 2
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
        log "  Killed PID $pid directly."
      fi

      clear_strike "$pid"
    fi
  done

  sleep "$POLL_INTERVAL"
done
