#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.cloudflared/tunnel.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No PID file found. Tunnel may not be running."
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID" && rm -f "$PID_FILE"
  echo "Tunnel stopped (PID $PID)"
else
  echo "Process $PID not found. Removing stale PID file."
  rm -f "$PID_FILE"
fi
