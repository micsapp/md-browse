#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.cloudflared/tunnel.pid"
LOG_FILE="$SCRIPT_DIR/.cloudflared/tunnel.log"
CONFIG_FILE="$SCRIPT_DIR/.cloudflared/config.yml"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Tunnel already running (PID $(cat "$PID_FILE"))"
  exit 0
fi

nohup cloudflared tunnel --config "$CONFIG_FILE" run md-browse >"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
echo "Tunnel started (PID $(cat "$PID_FILE")) — logs: $LOG_FILE"
