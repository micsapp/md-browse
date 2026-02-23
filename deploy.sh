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

setup_nginx() {
    log_info "Setting up nginx..."
    
    if [ ! -f "$NGINX_CONF" ]; then
        log_error "Nginx config not found at $NGINX_CONF"
        exit 1
    fi
    
    sudo mkdir -p /etc/nginx/sites-available
    sudo mkdir -p /etc/nginx/sites-enabled

    # Remove default nginx site to avoid server_name conflict
    if [ -L /etc/nginx/sites-enabled/default ]; then
        sudo rm /etc/nginx/sites-enabled/default
        log_info "Removed conflicting default nginx site"
    fi

    sudo cp "$NGINX_CONF" "$NGINX_SITES_AVAILABLE"
    
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

    # First check whether users already exist (HTTP 409 means they do)
    local probe
    probe=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "http://localhost:$BACKEND_PORT/api/setup" \
        -H "Content-Type: application/json" \
        -d '{"username":"__probe__","password":"__probe__"}')
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
    log_info "Frontend: http://localhost/"
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
