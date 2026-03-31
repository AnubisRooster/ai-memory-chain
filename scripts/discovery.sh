#!/bin/bash
#
# LAN Discovery Daemon for AI Memory Chain
#
# Enables automatic discovery of the founder (bootnode) by new validator nodes
# on the same local network using UDP broadcast.
#
# Modes:
#   --advertise    Founder mode: broadcasts presence on the LAN
#   --discover     Joiner mode: listens for the founder's broadcast
#   --daemon       Run advertise mode in background
#   --stop         Stop the daemon
#   --status       Check if running
#
# Protocol:
#   The founder periodically sends a UDP broadcast packet on port 19999
#   containing a JSON payload with connection details. New nodes listen
#   for this broadcast to auto-discover the network.
#
# Compatible with macOS bash 3.2 and Linux.
#

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
LOG_DIR="$PROJECT_DIR/logs"
PIDFILE="$LOG_DIR/discovery.pid"
LOGFILE="$LOG_DIR/discovery.log"

DISCOVERY_PORT=19999
BROADCAST_INTERVAL=5    # seconds between broadcasts
DISCOVER_TIMEOUT=30     # seconds to wait for a broadcast

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DISCOVERY] $1" >> "$LOGFILE"
}

# ── Get the local LAN IP ────────────────────────────────────────────

get_lan_ip() {
  # macOS
  if command -v ipconfig >/dev/null 2>&1; then
    local ip
    ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
    if [ -n "$ip" ]; then echo "$ip"; return; fi
  fi
  # Linux
  if command -v hostname >/dev/null 2>&1; then
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "$ip" ]; then echo "$ip"; return; fi
  fi
  # Fallback
  python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(('10.255.255.255', 1))
    print(s.getsockname()[0])
except: print('127.0.0.1')
finally: s.close()
" 2>/dev/null
}

# ── Get broadcast address ────────────────────────────────────────────

get_broadcast_addr() {
  local lan_ip="$1"
  # Simple: assume /24 subnet — replace last octet with 255
  echo "${lan_ip%.*}.255"
}

# ── Read bootnode info ───────────────────────────────────────────────

get_bootnode_multiaddr() {
  local peers_file="$PROJECT_DIR/config/peers.json"
  if [ -f "$peers_file" ]; then
    local bootnode
    bootnode=$(python3 -c "
import json
cfg = json.load(open('$peers_file'))
print(cfg.get('local', {}).get('polygon_bootnode', ''))
" 2>/dev/null)
    echo "$bootnode"
  fi
}

# ── CLI ──────────────────────────────────────────────────────────────

stop_daemon() {
  if [ -f "$PIDFILE" ]; then
    local pid
    pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      echo "Discovery daemon stopped (was PID $pid)."
      log "Daemon stopped."
    else
      echo "Discovery PID $pid is not running."
    fi
    rm -f "$PIDFILE"
  else
    echo "No discovery PID file found."
  fi
  exit 0
}

show_status() {
  if [ -f "$PIDFILE" ]; then
    local pid
    pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Discovery daemon is running (PID $pid)."
    else
      echo "Discovery PID file exists but process $pid is dead."
      rm -f "$PIDFILE"
    fi
  else
    echo "Discovery daemon is not running."
  fi
  exit 0
}

# ── Advertise (Founder Mode) ────────────────────────────────────────
#
# Broadcasts a JSON payload every BROADCAST_INTERVAL seconds so that
# new nodes on the LAN can find us automatically.
#

advertise_loop() {
  local lan_ip
  lan_ip=$(get_lan_ip)
  local broadcast_addr
  broadcast_addr=$(get_broadcast_addr "$lan_ip")
  local bootnode
  bootnode=$(get_bootnode_multiaddr)

  # Rewrite bootnode to use LAN IP
  if [ -n "$bootnode" ] && [ -n "$lan_ip" ]; then
    bootnode=$(echo "$bootnode" | sed "s|/ip4/127\\.0\\.0\\.1|/ip4/$lan_ip|")
  fi

  log "Advertising on $broadcast_addr:$DISCOVERY_PORT (LAN IP: $lan_ip)"
  echo "Discovery: advertising as founder on $broadcast_addr:$DISCOVERY_PORT"

  while true; do
    # Build the broadcast payload
    local payload
    payload=$(python3 -c "
import json
print(json.dumps({
    'service': 'ai-memory-chain',
    'role': 'founder',
    'ip': '$lan_ip',
    'rpc_port': 8545,
    'grpc_port': 10000,
    'libp2p_port': 1478,
    'api_port': 3001,
    'bootnode': '$bootnode',
    'chain_id': 100
}))
" 2>/dev/null)

    if [ -n "$payload" ]; then
      # Send UDP broadcast
      python3 -c "
import socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
sock.sendto(b'$payload', ('$broadcast_addr', $DISCOVERY_PORT))
sock.close()
" 2>/dev/null
    fi

    sleep "$BROADCAST_INTERVAL"
  done
}

# ── Discover (Joiner Mode) ──────────────────────────────────────────
#
# Listens for the founder's broadcast and outputs the connection info.
# Exits after receiving the first valid broadcast.
#

discover_once() {
  local timeout="${1:-$DISCOVER_TIMEOUT}"
  echo "Listening for AI Memory Chain founder on UDP port $DISCOVERY_PORT (timeout: ${timeout}s)..."

  local result
  result=$(python3 -c "
import socket, json, sys, time

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

# Allow receiving broadcasts
try:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
except:
    pass

sock.bind(('', $DISCOVERY_PORT))
sock.settimeout($timeout)

try:
    data, addr = sock.recvfrom(4096)
    payload = json.loads(data.decode('utf-8'))
    if payload.get('service') == 'ai-memory-chain':
        # Output as JSON for the join script to parse
        print(json.dumps(payload))
    else:
        print('')
except socket.timeout:
    print('')
except Exception as e:
    print('', file=sys.stderr)
finally:
    sock.close()
" 2>/dev/null)

  if [ -z "$result" ]; then
    echo "No founder found on the LAN within ${timeout}s."
    return 1
  fi

  echo "$result"
  return 0
}

# ── Main ─────────────────────────────────────────────────────────────

case "${1:-}" in
  --stop)
    stop_daemon
    ;;
  --status)
    show_status
    ;;
  --daemon)
    nohup "$0" --advertise >> "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    echo "Discovery daemon started in background (PID $!)."
    exit 0
    ;;
  --advertise)
    # Guard against duplicate
    if [ -f "$PIDFILE" ]; then
      old_pid=$(cat "$PIDFILE")
      if [ "$old_pid" != "$$" ] && kill -0 "$old_pid" 2>/dev/null; then
        echo "Another discovery daemon is already running (PID $old_pid)."
        exit 1
      fi
      rm -f "$PIDFILE"
    fi
    echo $$ > "$PIDFILE"
    trap 'rm -f "$PIDFILE"; exit 0' SIGTERM SIGINT SIGHUP
    log "Advertise mode started (PID $$)"
    advertise_loop
    ;;
  --discover)
    discover_once "${2:-$DISCOVER_TIMEOUT}"
    ;;
  *)
    echo "Usage: $0 {--advertise|--discover [timeout]|--daemon|--stop|--status}"
    echo ""
    echo "  --advertise    Founder: broadcast presence on LAN"
    echo "  --discover     Joiner: listen for founder broadcast"
    echo "  --daemon       Run advertise mode in background"
    echo "  --stop         Stop the background daemon"
    echo "  --status       Check if daemon is running"
    exit 1
    ;;
esac
