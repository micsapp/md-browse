#!/bin/bash
set -e

PROJECT_DIR="/home/mli/md-browse"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
NGINX_CONF="$PROJECT_DIR/nginx/md-browse.conf"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available/md-browse"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled/md-browse"
BACKEND_PORT="${BACKEND_PORT:-3001}"
PM2_APP_NAME="md-browse-api"
HOSTNAME_OPT=""
DEFAULT_SSL_CERT="/etc/ssl/cloudflare/tigu.cert"
DEFAULT_SSL_KEY="/etc/ssl/cloudflare/tigu.key"
SSL_ENABLED=false
SSL_CERT=""
SSL_KEY=""

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --hostname) HOSTNAME_OPT="$2"; shift 2 ;;
        --hostname=*) HOSTNAME_OPT="${1#*=}"; shift ;;
        --help|-h) cat <<'USAGE'
Usage: deploy.sh [OPTIONS] COMMAND

Commands:
  deploy      Full deployment (install, build, backend, nginx, health check)
  install     Install backend & frontend npm dependencies
  build       Build frontend (nuxt generate)
  backend     Deploy/restart backend via PM2
  nginx       Setup nginx config and reload
  status      Show PM2 process list and URLs
  logs        Tail PM2 logs
  restart     Restart backend and reload nginx
  stop        Stop backend

Options:
  --hostname DOMAIN   Set nginx server_name (default: _ catch-all)
  --help, -h          Show this help message

Examples:
  ./deploy.sh deploy                          # full deploy, catch-all hostname
  ./deploy.sh --hostname docs.example.com deploy   # deploy with custom hostname
  ./deploy.sh --hostname docs.example.com nginx    # update nginx only
  ./deploy.sh status
  ./deploy.sh logs
USAGE
            exit 0 ;;
        *) break ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

install_deps() {
    log_info "Installing backend dependencies..."
    cd "$BACKEND_DIR"
    npm install --production
    
    log_info "Installing frontend dependencies..."
    cd "$FRONTEND_DIR"
    npm install
}

build_frontend() {
    log_info "Building frontend..."
    cd "$FRONTEND_DIR"
    npm run generate
    log_info "Frontend built at $FRONTEND_DIR/.output/public"
}

deploy_backend() {
    log_info "Deploying backend with PM2..."
    cd "$BACKEND_DIR"
    
    if ! command -v pm2 &> /dev/null; then
        log_warn "PM2 not found, installing globally..."
        npm install -g pm2
    fi
    
    if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
        log_info "Updating existing PM2 process..."
        pm2 delete "$PM2_APP_NAME" || true
    fi
    
    PORT="$BACKEND_PORT" NODE_ENV=production pm2 start server.js \
        --name "$PM2_APP_NAME"
    
    pm2 save
    
    if command -v systemctl &> /dev/null; then
        pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null || true
    fi
    
    log_info "Backend deployed with PM2"
}

resolve_ssl() {
    # Check if existing deployed nginx config already has SSL certs configured
    if [ -f "$NGINX_SITES_AVAILABLE" ]; then
        local existing_cert existing_key
        existing_cert=$(grep -Po '^\s*ssl_certificate\s+\K[^;]+' "$NGINX_SITES_AVAILABLE" 2>/dev/null | head -1)
        existing_key=$(grep -Po '^\s*ssl_certificate_key\s+\K[^;]+' "$NGINX_SITES_AVAILABLE" 2>/dev/null | head -1)
        if [ -n "$existing_cert" ] && [ -n "$existing_key" ] && [ -f "$existing_cert" ] && [ -f "$existing_key" ]; then
            SSL_ENABLED=true
            SSL_CERT="$existing_cert"
            SSL_KEY="$existing_key"
            log_info "Preserving existing SSL certificates from deployed nginx config"
            log_info "  cert: $SSL_CERT"
            log_info "  key:  $SSL_KEY"
            return
        fi
    fi

    if [ -f "$DEFAULT_SSL_CERT" ] && [ -f "$DEFAULT_SSL_KEY" ]; then
        SSL_ENABLED=true
        SSL_CERT="$DEFAULT_SSL_CERT"
        SSL_KEY="$DEFAULT_SSL_KEY"
        log_info "SSL certificates found at default path"
        return
    fi

    log_warn "Default SSL certificate not found at $DEFAULT_SSL_CERT"
    log_info "You have 60 seconds to provide an SSL certificate path, or HTTPS will be skipped."

    local cert_path key_path

    read -t 60 -rp "Enter SSL certificate file path (or press Enter to skip HTTPS): " cert_path
    if [ $? -ne 0 ] || [ -z "$cert_path" ]; then
        echo ""
        log_warn "No SSL certificate provided — deploying with HTTP only (port 80)"
        return
    fi

    if [ ! -f "$cert_path" ]; then
        log_error "Certificate file not found: $cert_path"
        log_warn "Deploying with HTTP only (port 80)"
        return
    fi

    read -t 60 -rp "Enter SSL certificate key file path: " key_path
    if [ $? -ne 0 ] || [ -z "$key_path" ]; then
        echo ""
        log_warn "No SSL key provided — deploying with HTTP only (port 80)"
        return
    fi

    if [ ! -f "$key_path" ]; then
        log_error "Key file not found: $key_path"
        log_warn "Deploying with HTTP only (port 80)"
        return
    fi

    SSL_ENABLED=true
    SSL_CERT="$cert_path"
    SSL_KEY="$key_path"
    log_info "Using SSL certificate: $SSL_CERT"
    log_info "Using SSL key: $SSL_KEY"
}

setup_nginx() {
    log_info "Setting up nginx..."
    
    if [ ! -f "$NGINX_CONF" ]; then
        log_error "Nginx config not found at $NGINX_CONF"
        exit 1
    fi

    resolve_ssl
    
    sudo mkdir -p /etc/nginx/sites-available
    sudo mkdir -p /etc/nginx/sites-enabled

    # Remove default nginx site to avoid server_name conflict
    if [ -L /etc/nginx/sites-enabled/default ]; then
        sudo rm /etc/nginx/sites-enabled/default
        log_info "Removed conflicting default nginx site"
    fi

    sudo cp "$NGINX_CONF" "$NGINX_SITES_AVAILABLE"

    # Apply hostname if provided
    if [ -n "$HOSTNAME_OPT" ]; then
        sudo sed -i "s/server_name _;/server_name ${HOSTNAME_OPT};/" "$NGINX_SITES_AVAILABLE"
        sudo sed -i "s/listen 80 default_server;/listen 80;/" "$NGINX_SITES_AVAILABLE"
        sudo sed -i "s/listen 443 ssl default_server;/listen 443 ssl;/" "$NGINX_SITES_AVAILABLE"
        log_info "Nginx server_name set to: $HOSTNAME_OPT"
    fi

    # Apply SSL configuration
    if [ "$SSL_ENABLED" = true ]; then
        sudo sed -i "s|ssl_certificate     .*|ssl_certificate     ${SSL_CERT};|" "$NGINX_SITES_AVAILABLE"
        sudo sed -i "s|ssl_certificate_key .*|ssl_certificate_key ${SSL_KEY};|" "$NGINX_SITES_AVAILABLE"
        log_info "SSL enabled with certificate: $SSL_CERT"
    else
        # Remove SSL config for HTTP-only deployment
        sudo sed -i '/listen 443/d' "$NGINX_SITES_AVAILABLE"
        sudo sed -i '/ssl_/d' "$NGINX_SITES_AVAILABLE"
        log_info "SSL disabled — serving HTTP only on port 80"
    fi
    
    if [ -L "$NGINX_SITES_ENABLED" ] || [ -f "$NGINX_SITES_ENABLED" ]; then
        sudo rm "$NGINX_SITES_ENABLED"
    fi
    sudo ln -s "$NGINX_SITES_AVAILABLE" "$NGINX_SITES_ENABLED"
    
    if sudo nginx -t; then
        log_info "Nginx config is valid"
    else
        log_error "Nginx config is invalid!"
        exit 1
    fi
    
    sudo systemctl reload nginx || sudo service nginx reload
    log_info "Nginx reloaded"

    # Ensure nginx (www-data) can traverse the home directory to serve static files
    chmod o+x "$HOME"
}

setup_default_admin() {
    log_info "Checking if admin setup is needed..."

    # First check whether users already exist (POST with no password → 400 if empty, 409 if users exist)
    local probe
    probe=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "http://localhost:$BACKEND_PORT/api/setup" \
        -H "Content-Type: application/json" \
        -d '{"username":"__probe__"}')
    if [ "$probe" = "409" ]; then
        log_info "Admin setup skipped: users already exist"
        return 0
    fi

    # No users yet – prompt for admin credentials
    local admin_user admin_pass admin_pass_confirm
    read -rp "Enter admin username [admin]: " admin_user
    admin_user="${admin_user:-admin}"

    while true; do
        read -rsp "Enter admin password: " admin_pass
        echo
        if [ -z "$admin_pass" ]; then
            log_warn "Password cannot be empty. Try again."
            continue
        fi
        read -rsp "Confirm admin password: " admin_pass_confirm
        echo
        if [ "$admin_pass" != "$admin_pass_confirm" ]; then
            log_warn "Passwords do not match. Try again."
        else
            break
        fi
    done

    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "http://localhost:$BACKEND_PORT/api/setup" \
        -H "Content-Type: application/json" \
        -d "$(printf '{"username":"%s","password":"%s"}' "$admin_user" "$admin_pass")")
    if [ "$response" = "201" ]; then
        log_info "Admin user '$admin_user' created successfully"
    else
        log_warn "Admin setup returned HTTP $response (non-fatal)"
    fi
}

health_check() {
    log_info "Running health checks..."

    sleep 2

    if curl -sf "http://localhost:$BACKEND_PORT/api/health" > /dev/null; then
        log_info "Backend health check: OK"
    else
        log_error "Backend health check: FAILED"
        return 1
    fi

    setup_default_admin

    if curl -sf "http://localhost/" > /dev/null 2>&1; then
        log_info "Frontend health check: OK"
    else
        log_warn "Frontend health check: Could not verify (nginx may need domain config)"
    fi
}

show_status() {
    echo ""
    log_info "=== Deployment Status ==="
    echo ""
    pm2 list
    echo ""
    log_info "Backend API: http://localhost:$BACKEND_PORT/api"
    if [ -n "$HOSTNAME_OPT" ]; then
        log_info "Frontend: http://$HOSTNAME_OPT/"
    else
        log_info "Frontend: http://localhost/"
    fi
    echo ""
}

case "${1:-deploy}" in
    install)
        install_deps
        ;;
    build)
        build_frontend
        ;;
    backend)
        deploy_backend
        ;;
    nginx)
        setup_nginx
        ;;
    status)
        show_status
        ;;
    logs)
        pm2 logs "$PM2_APP_NAME"
        ;;
    restart)
        pm2 restart "$PM2_APP_NAME"
        sudo systemctl reload nginx || sudo service nginx reload
        log_info "Services restarted"
        ;;
    stop)
        pm2 stop "$PM2_APP_NAME"
        log_info "Backend stopped"
        ;;
    deploy|*)
        check_command node
        check_command npm
        
        install_deps
        build_frontend
        deploy_backend
        setup_nginx
        health_check
        show_status
        
        log_info "Deployment complete!"
        ;;
esac
