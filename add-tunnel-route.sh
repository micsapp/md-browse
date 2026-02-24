#!/usr/bin/env bash
set -euo pipefail

# add-tunnel-route.sh — Add a new hostname→service route to the existing tunnel
# Usage:
#   ./add-tunnel-route.sh --hostname app.micstec.com --service http://localhost:8080
#   ./add-tunnel-route.sh --hostname app.micstec.com   # defaults to http://localhost:80

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/.cloudflared/config.yml"
PID_FILE="$SCRIPT_DIR/.cloudflared/tunnel.pid"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'
info()  { printf "${GREEN}[INFO]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }

HOSTNAME=""
SERVICE="http://localhost:80"

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Add a new hostname → service route to the Cloudflare tunnel.
Creates DNS record, updates config, and restarts the tunnel.

Options:
  --hostname HOST   Public hostname (e.g. app.micstec.com)  [required]
  --service  URL    Local service URL (default: http://localhost:80)
  --list            Show current routes
  --remove HOST     Remove a route
  -h, --help        Show this help

Examples:
  $(basename "$0") --hostname app.micstec.com --service http://localhost:3000
  $(basename "$0") --hostname wiki.micstec.com
  $(basename "$0") --list
  $(basename "$0") --remove app.micstec.com
EOF
}

# ── parse args ─────────────────────────────────────────────────────────────────
ACTION="add"
REMOVE_HOST=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --hostname) HOSTNAME="$2"; shift 2 ;;
        --service)  SERVICE="$2"; shift 2 ;;
        --list)     ACTION="list"; shift ;;
        --remove)   ACTION="remove"; REMOVE_HOST="$2"; shift 2 ;;
        -h|--help)  usage; exit 0 ;;
        *) error "Unknown option: $1"; usage; exit 1 ;;
    esac
done

# ── check config exists ───────────────────────────────────────────────────────
if [ ! -f "$CONFIG_FILE" ]; then
    error "Config not found: $CONFIG_FILE"
    error "Run create_tunnel.sh first to set up the tunnel."
    exit 1
fi

# ── get tunnel name from config ────────────────────────────────────────────────
TUNNEL_NAME=$(grep '^tunnel:' "$CONFIG_FILE" | awk '{print $2}')
if [ -z "$TUNNEL_NAME" ]; then
    error "Could not read tunnel name from $CONFIG_FILE"
    exit 1
fi

# ── list routes ────────────────────────────────────────────────────────────────
cmd_list() {
    echo ""
    info "Current routes (tunnel: ${TUNNEL_NAME}):"
    echo ""
    printf "  ${DIM}%-40s %s${NC}\n" "HOSTNAME" "SERVICE"
    echo "  $(printf '─%.0s' $(seq 1 70))"
    python3 -c "
import yaml, sys
with open('$CONFIG_FILE') as f:
    config = yaml.safe_load(f)
for rule in config.get('ingress', []):
    hostname = rule.get('hostname', '(catch-all)')
    service = rule.get('service', '')
    print(f'  {hostname:<40} {service}')
" 2>/dev/null || {
        # Fallback without PyYAML
        grep -E '^\s+- hostname:|^\s+service:' "$CONFIG_FILE" | paste - - | while read -r line; do
            host=$(echo "$line" | grep -oP 'hostname:\s*\K\S+' || echo "(catch-all)")
            svc=$(echo "$line" | grep -oP 'service:\s*\K\S+')
            printf "  %-40s %s\n" "$host" "$svc"
        done
        # Show catch-all
        local last_svc
        last_svc=$(grep -A0 '^\s*- service:' "$CONFIG_FILE" | tail -1 | awk '{print $NF}')
        printf "  %-40s %s\n" "(catch-all)" "$last_svc"
    }
    echo ""
}

# ── add route ──────────────────────────────────────────────────────────────────
cmd_add() {
    if [ -z "$HOSTNAME" ]; then
        error "--hostname is required"
        usage
        exit 1
    fi

    # Check if hostname already exists in config
    if grep -q "hostname: ${HOSTNAME}" "$CONFIG_FILE" 2>/dev/null; then
        warn "Hostname '${HOSTNAME}' already in config. Updating service..."
        # Replace the service line after the matching hostname
        python3 -c "
import sys
lines = open('$CONFIG_FILE').readlines()
out = []
skip_service = False
for line in lines:
    if 'hostname: $HOSTNAME' in line:
        out.append(line)
        skip_service = True
        continue
    if skip_service and 'service:' in line:
        out.append(line.split('service:')[0] + 'service: $SERVICE\n')
        skip_service = False
        continue
    out.append(line)
open('$CONFIG_FILE', 'w').writelines(out)
" 2>/dev/null
        info "Updated: ${HOSTNAME} → ${SERVICE}"
    else
        # Insert new ingress entry before the catch-all
        info "Adding route: ${HOSTNAME} → ${SERVICE}"
        python3 -c "
lines = open('$CONFIG_FILE').readlines()
out = []
for line in lines:
    # Insert before catch-all '  - service:' line
    if line.strip().startswith('- service:') and 'hostname' not in line:
        indent = line[:len(line) - len(line.lstrip())]
        out.append(f'{indent}- hostname: $HOSTNAME\n')
        out.append(f'{indent}  service: $SERVICE\n')
    out.append(line)
open('$CONFIG_FILE', 'w').writelines(out)
" 2>/dev/null
        info "Config updated"
    fi

    # Create DNS CNAME record via cloudflared
    info "Creating DNS record: ${HOSTNAME} → tunnel"
    cloudflared tunnel route dns -f "${TUNNEL_NAME}" "${HOSTNAME}" 2>&1 || \
        warn "DNS route may already exist (usually fine)"

    # Restart tunnel
    restart_tunnel

    echo ""
    info "Route added: https://${HOSTNAME} → ${SERVICE}"
    cmd_list
}

# ── remove route ───────────────────────────────────────────────────────────────
cmd_remove() {
    local host="${REMOVE_HOST}"
    if [ -z "$host" ]; then
        error "--remove requires a hostname"
        exit 1
    fi

    if ! grep -q "hostname: ${host}" "$CONFIG_FILE" 2>/dev/null; then
        error "Hostname '${host}' not found in config"
        exit 1
    fi

    info "Removing route: ${host}"

    # Remove the hostname + service lines
    python3 -c "
lines = open('$CONFIG_FILE').readlines()
out = []
skip_next = False
for line in lines:
    if 'hostname: $host' in line:
        skip_next = True
        continue
    if skip_next and 'service:' in line:
        skip_next = False
        continue
    out.append(line)
open('$CONFIG_FILE', 'w').writelines(out)
" 2>/dev/null

    info "Config updated"
    warn "DNS record for ${host} was NOT deleted (do it manually if needed)"

    # Restart tunnel
    restart_tunnel

    cmd_list
}

# ── restart tunnel ─────────────────────────────────────────────────────────────
restart_tunnel() {
    info "Restarting tunnel..."

    # Try tunnel-stop.sh / tunnel-start.sh
    if [ -x "$SCRIPT_DIR/tunnel-stop.sh" ] && [ -x "$SCRIPT_DIR/tunnel-start.sh" ]; then
        "$SCRIPT_DIR/tunnel-stop.sh" 2>/dev/null || true
        sleep 1
        "$SCRIPT_DIR/tunnel-start.sh"
        return
    fi

    # Fallback: PID file
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            sleep 1
        fi
        rm -f "$PID_FILE"
    fi

    local LOG_FILE="$SCRIPT_DIR/.cloudflared/tunnel.log"
    nohup cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" \
        >"$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    info "Tunnel restarted (PID $(cat "$PID_FILE"))"
}

# ── main ───────────────────────────────────────────────────────────────────────
case "$ACTION" in
    list)   cmd_list ;;
    add)    cmd_add ;;
    remove) cmd_remove ;;
esac
