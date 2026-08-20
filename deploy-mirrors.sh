#!/usr/bin/env bash
set -euo pipefail

# deploy-mirrors.sh — deploy the current working tree to the primary and all
# mirrors, then verify the whole fleet (health, write routing, data sync).
#
# Run ON THE PRIMARY (minipc2) from the repo root, after merging to main.
# See docs/md-docs.md §4.1 and infra/README.md for the architecture.
#
# Usage:
#   ./deploy-mirrors.sh              # backend deps + restart + deploy + verify
#   ./deploy-mirrors.sh --build      # also rebuild the frontend first
#   ./deploy-mirrors.sh --verify     # run the fleet verification only
#
# Adding a mirror: append to the three MIRROR_* arrays below (and see the
# add-a-mirror checklist in docs/md-docs.md §6.1).

# ── fleet config ───────────────────────────────────────────────────────────────
MIRROR_SSH=("mli@54.165.17.203")                 # ssh target per mirror
MIRROR_URL=("https://md-docs2.micstec.com")      # direct URL per mirror
MIRROR_NPM=("/home/mli/.nvm/versions/node/v25.9.0/bin/npm")  # npm path per mirror

PRIMARY_URL="https://md-docs.micstec.com"
LB_URL="https://md.micstec.com"
APP_DIR="$HOME/md-browse"
NODE_BIN="$HOME/.nvm/versions/node/v25.6.1/bin"   # node/npm/pm2 on the primary (nvm)
PM2="$NODE_BIN/pm2"
export PATH="$NODE_BIN:$PATH"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { printf "${GREEN}[INFO]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
fail()  { printf "${RED}[FAIL]${NC}  %s\n" "$*" >&2; exit 1; }

BUILD_FRONTEND=false
VERIFY_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --build)  BUILD_FRONTEND=true ;;
        --verify) VERIFY_ONLY=true ;;
        -h|--help) grep '^#' "$0" | head -16; exit 0 ;;
        *) fail "unknown option: $arg" ;;
    esac
done

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }

wait_health() { # wait_health <url> <label>
    local url="$1" label="$2" code n
    for n in $(seq 1 10); do
        code=$(http_code "$url") || true
        [ "$code" = "200" ] && { info "$label healthy (200)"; return 0; }
        sleep 2
    done
    fail "$label unhealthy (last code: ${code:-none}) — $url"
}

cd "$APP_DIR"

# ── deploy ─────────────────────────────────────────────────────────────────────
if ! $VERIFY_ONLY; then
    info "deploying commit: $(git log --oneline -1 2>/dev/null || echo '(not a git checkout?)')"
    dirty=$(git status --porcelain 2>/dev/null | wc -l)
    [ "$dirty" -gt 0 ] && warn "working tree has $dirty uncommitted change(s) — deploying them anyway"

    if $BUILD_FRONTEND; then
        info "building frontend…"
        (cd frontend && npm run generate)
    fi

    info "primary: installing backend deps…"
    (cd backend && npm install --no-audit --no-fund >/dev/null)

    info "primary: restarting backend (pm2)…"
    "$PM2" restart md-browse-api --update-env >/dev/null
    wait_health "http://localhost:3001/api/health" "primary backend"

    for i in "${!MIRROR_SSH[@]}"; do
        m="${MIRROR_SSH[$i]}"; npm_bin="${MIRROR_NPM[$i]}"
        info "mirror $m: syncing code…"
        # --exclude data is load-bearing: backend/data on mirrors belongs to lsyncd
        rsync -az --delete --exclude data --exclude node_modules \
            -e "ssh ${SSH_OPTS[*]}" backend/ "$m:md-browse/backend/"
        rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
            frontend/.output/public/ "$m:md-browse/frontend/.output/public/"
        info "mirror $m: installing deps + restarting backend…"
        ssh "${SSH_OPTS[@]}" "$m" \
            "export PATH=\$(dirname '$npm_bin'):\$PATH && cd md-browse/backend && npm install --no-audit --no-fund >/dev/null && sudo systemctl restart md-browse"
    done
fi

# ── verify fleet ───────────────────────────────────────────────────────────────
info "verifying fleet…"
# Check both the frontend root (/) and the API. The root 200 confirms the static
# build (index.html) was generated and served; /api/health confirms the backend.
wait_health "$PRIMARY_URL/" "primary frontend ($PRIMARY_URL)"
wait_health "$PRIMARY_URL/api/health" "primary api    ($PRIMARY_URL)"
for i in "${!MIRROR_URL[@]}"; do
    wait_health "${MIRROR_URL[$i]}/" "mirror frontend (${MIRROR_URL[$i]})"
    wait_health "${MIRROR_URL[$i]}/api/health" "mirror api     (${MIRROR_URL[$i]})"
done
wait_health "$LB_URL/" "LB frontend ($LB_URL)"
wait_health "$LB_URL/api/health" "LB api      ($LB_URL)"

# write routing: a bad-credentials login must reach the primary backend (401)
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$LB_URL/api/auth/login" \
    -H 'Content-Type: application/json' -d '{"username":"__deploy_probe__","password":"x"}')
[ "$code" = "401" ] && info "write routing OK (probe reached primary, 401)" \
                    || fail "write routing broken: probe returned $code (expected 401)"

# data sync heartbeat: file created on primary must appear on every mirror
hb=".deploy-heartbeat"
date +%s > "backend/data/$hb"
sleep 6
for m in "${MIRROR_SSH[@]}"; do
    if ssh "${SSH_OPTS[@]}" "$m" "test -f md-browse/backend/data/$hb"; then
        info "data sync OK → $m"
    else
        rm -f "backend/data/$hb"
        fail "data sync NOT propagating to $m within 6s — check lsyncd-md.service"
    fi
done
rm -f "backend/data/$hb"

info "fleet deploy verified ✔  (remember: git push origin main)"
