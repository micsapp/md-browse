#!/usr/bin/env bash
set -euo pipefail

# create_tunnel.sh
# Expose md-browse through a Cloudflare Tunnel.
# Usage:
#   ./create_tunnel.sh --hostname docs.example.com
#   ./create_tunnel.sh --hostname docs.example.com --install-service
#   ./create_tunnel.sh --quick                        # quick try-out URL, no domain needed

TUNNEL_NAME="md-browse"
LOCAL_SERVICE="http://localhost:80"
HOSTNAME=""
INSTALL_SERVICE=false
QUICK=false
# Use a project-local config so other tunnels are not affected
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/.cloudflared/config.yml"

# ─── colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { printf "${GREEN}[INFO]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --hostname HOST       Public hostname (e.g. docs.example.com)  [required unless --quick]
  --name NAME           Tunnel name (default: md-browse)
  --service URL         Local service URL (default: http://localhost:80)
  --install-service     Install tunnel as a persistent systemd service
  --quick               Start a temporary tunnel with a random trycloudflare.com URL (no login needed)
  -h, --help            Show this help

Examples:
  $0 --quick
  $0 --hostname docs.example.com
  $0 --hostname docs.example.com --install-service
EOF
}

# ─── arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hostname)   HOSTNAME="$2";      shift 2 ;;
    --name)       TUNNEL_NAME="$2";   shift 2 ;;
    --service)    LOCAL_SERVICE="$2"; shift 2 ;;
    --install-service) INSTALL_SERVICE=true; shift ;;
    --quick)      QUICK=true;         shift ;;
    -h|--help)    usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ "$QUICK" = false ] && [ -z "$HOSTNAME" ]; then
  error "Either --hostname or --quick is required."
  usage
  exit 1
fi

if [ -n "$HOSTNAME" ] && [[ "$HOSTNAME" == *"_"* ]]; then
  error "Hostname '${HOSTNAME}' contains an underscore (_) which is invalid in DNS."
  error "Use a dash instead, e.g.: ${HOSTNAME//_/-}"
  exit 1
fi

# ─── install cloudflared if missing ────────────────────────────────────────────
install_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    info "cloudflared is already installed: $(cloudflared --version 2>&1 | head -1)"
    return 0
  fi

  info "cloudflared not found. Installing..."

  if command -v apt-get >/dev/null 2>&1; then
    sudo mkdir -p /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
      | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
https://pkg.cloudflare.com/cloudflared $(. /etc/os-release && echo "$VERSION_CODENAME") main" \
      | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
    sudo apt-get update -qq && sudo apt-get install -y cloudflared
    info "cloudflared installed via apt."
    return 0
  fi

  if command -v brew >/dev/null 2>&1; then
    brew install cloudflared
    info "cloudflared installed via Homebrew."
    return 0
  fi

  # Fallback: download binary directly
  local arch
  arch=$(uname -m)
  case "$arch" in
    x86_64)  arch="amd64" ;;
    aarch64) arch="arm64" ;;
    armv7l)  arch="arm"   ;;
    *) error "Unsupported architecture: $arch. Install cloudflared manually: https://github.com/cloudflare/cloudflared/releases"; exit 1 ;;
  esac
  local url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}"
  info "Downloading cloudflared binary from $url ..."
  sudo curl -fsSL "$url" -o /usr/local/bin/cloudflared
  sudo chmod +x /usr/local/bin/cloudflared
  info "cloudflared installed to /usr/local/bin/cloudflared"
}

# ─── quick mode: trycloudflare.com (no login, no domain) ───────────────────────
run_quick() {
  info "Starting quick tunnel → $LOCAL_SERVICE"
  info "A public URL will appear below (*.trycloudflare.com). Press Ctrl+C to stop."
  echo ""
  exec cloudflared tunnel --url "$LOCAL_SERVICE"
}

# ─── ensure cloudflare login ───────────────────────────────────────────────────
ensure_auth() {
  mkdir -p "$HOME/.cloudflared"
  if ls "$HOME/.cloudflared/"*cert.pem >/dev/null 2>&1; then
    info "Cloudflare auth cert found."
    return 0
  fi
  info "No auth cert found. Starting: cloudflared tunnel login"
  info "A browser URL will be shown. Visit it, authorise, then return here."
  cloudflared tunnel login
  if ! ls "$HOME/.cloudflared/"*cert.pem >/dev/null 2>&1; then
    error "Auth cert not found after login. Did you complete the authorisation?"
    exit 1
  fi
}

# ─── create or reuse tunnel ────────────────────────────────────────────────────
ensure_tunnel() {
  if cloudflared tunnel list 2>/dev/null | grep -q "^[^ ]* *${TUNNEL_NAME} "; then
    info "Tunnel '${TUNNEL_NAME}' already exists."
  else
    info "Creating tunnel: ${TUNNEL_NAME}"
    cloudflared tunnel create "${TUNNEL_NAME}"
  fi

  # Resolve credentials file path
  TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | awk -v name="${TUNNEL_NAME}" '$2==name{print $1}')
  if [ -z "$TUNNEL_ID" ]; then
    error "Could not find tunnel ID for '${TUNNEL_NAME}'."
    exit 1
  fi
  CREDS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"
  info "Tunnel ID: ${TUNNEL_ID}"
}

# ─── write config ──────────────────────────────────────────────────────────────
write_config() {
  mkdir -p "$(dirname "$CONFIG_FILE")"
  if [ -f "$CONFIG_FILE" ]; then
    cp -a "$CONFIG_FILE" "${CONFIG_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
    info "Backed up existing config."
  fi
  cat >"$CONFIG_FILE" <<EOF
tunnel: ${TUNNEL_NAME}
credentials-file: ${CREDS_FILE}

ingress:
  - hostname: ${HOSTNAME}
    service: ${LOCAL_SERVICE}
  - service: http_status:404
EOF
  info "Config written: $CONFIG_FILE"
}

# ─── DNS route ─────────────────────────────────────────────────────────────────
setup_dns() {
  info "Setting up DNS route: ${HOSTNAME} → tunnel"
  cloudflared tunnel route dns "${TUNNEL_NAME}" "${HOSTNAME}" || \
    warn "DNS route may already exist (this is usually fine)."
}

# ─── detect WSL ────────────────────────────────────────────────────────────────
is_wsl() {
  grep -qiE "microsoft|wsl" /proc/version 2>/dev/null
}

# ─── persist: systemd (non-WSL) or nohup+PID (WSL) ────────────────────────────
install_service() {
  local pid_file="$SCRIPT_DIR/.cloudflared/tunnel.pid"
  local log_file="$SCRIPT_DIR/.cloudflared/tunnel.log"
  local start_script="$SCRIPT_DIR/tunnel-start.sh"
  local stop_script="$SCRIPT_DIR/tunnel-stop.sh"

  # Write start/stop helper scripts regardless of platform
  cat >"$start_script" <<EOF
#!/usr/bin/env bash
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="\$SCRIPT_DIR/.cloudflared/tunnel.pid"
LOG_FILE="\$SCRIPT_DIR/.cloudflared/tunnel.log"

if [ -f "\$PID_FILE" ] && kill -0 "\$(cat "\$PID_FILE")" 2>/dev/null; then
  echo "Tunnel already running (PID \$(cat "\$PID_FILE"))"
  exit 0
fi

nohup cloudflared tunnel --config "${CONFIG_FILE}" run "${TUNNEL_NAME}" \
  >"\$LOG_FILE" 2>&1 &
echo \$! >"\$PID_FILE"
echo "Tunnel started (PID \$(cat "\$PID_FILE")) — logs: \$LOG_FILE"
EOF
  chmod +x "$start_script"

  cat >"$stop_script" <<EOF
#!/usr/bin/env bash
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="\$SCRIPT_DIR/.cloudflared/tunnel.pid"

if [ ! -f "\$PID_FILE" ]; then
  echo "No PID file found. Tunnel may not be running."
  exit 0
fi
PID=\$(cat "\$PID_FILE")
if kill -0 "\$PID" 2>/dev/null; then
  kill "\$PID" && rm -f "\$PID_FILE"
  echo "Tunnel stopped (PID \$PID)"
else
  echo "Process \$PID not found. Removing stale PID file."
  rm -f "\$PID_FILE"
fi
EOF
  chmod +x "$stop_script"

  if ! is_wsl && command -v systemctl >/dev/null 2>&1 && systemctl --version >/dev/null 2>&1; then
    # ── systemd path ──
    local service_name="cloudflared-${TUNNEL_NAME}"
    local service_file="/etc/systemd/system/${service_name}.service"
    info "Installing dedicated systemd service: ${service_name}"
    sudo tee "$service_file" >/dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel - ${TUNNEL_NAME}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(whoami)
ExecStart=$(command -v cloudflared) tunnel --config ${CONFIG_FILE} run ${TUNNEL_NAME}
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable "${service_name}"
    sudo systemctl restart "${service_name}"
    info "Service '${service_name}' installed and started."
    info "Manage with: sudo systemctl {start|stop|status|restart} ${service_name}"

  else
    # ── WSL / no-systemd path: nohup + PID file ──
    if is_wsl; then
      info "WSL detected — using nohup (systemd not available)."
    else
      info "systemd not available — using nohup fallback."
    fi

    # Stop any existing instance
    if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      info "Stopping existing tunnel (PID $(cat "$pid_file"))..."
      kill "$(cat "$pid_file")" && rm -f "$pid_file"
      sleep 1
    fi

    nohup cloudflared tunnel --config "${CONFIG_FILE}" run "${TUNNEL_NAME}" \
      >"$log_file" 2>&1 &
    echo $! >"$pid_file"
    info "Tunnel started in background (PID $(cat "$pid_file"))"
    info "Logs: $log_file"
    echo ""
    warn "WSL note: this process will stop when your WSL session closes."
    warn "To auto-start on WSL login, add this to your ~/.bashrc or ~/.profile:"
    echo ""
    echo "    $start_script"
    echo ""
  fi

  info "Start script: $start_script"
  info "Stop script:  $stop_script"
}

# ─── main ──────────────────────────────────────────────────────────────────────
install_cloudflared

if [ "$QUICK" = true ]; then
  run_quick
fi

ensure_auth
ensure_tunnel
write_config
setup_dns

if [ "$INSTALL_SERVICE" = true ]; then
  install_service
  echo ""
  info "Your site is live at: https://${HOSTNAME}"
else
  echo ""
  info "Setup complete. Starting tunnel in foreground (Ctrl+C to stop)..."
  info "Your site will be available at: https://${HOSTNAME}"
  echo ""
  exec cloudflared tunnel --config "${CONFIG_FILE}" run "${TUNNEL_NAME}"
fi
