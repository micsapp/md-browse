#!/usr/bin/env bash
set -euo pipefail

# dns-manage.sh — Manage Cloudflare DNS records via API
# Usage:
#   ./dns-manage.sh add <name> <value> [--type A|AAAA|CNAME|TXT] [--ttl 3600] [--proxy]
#   ./dns-manage.sh list [--name <filter>]
#   ./dns-manage.sh delete <name> [--type A|AAAA|CNAME|TXT]
#   ./dns-manage.sh update <name> <value> [--type A|AAAA|CNAME|TXT] [--ttl 3600] [--proxy]

DEFAULT_ZONE="micstec.com"
CF_ENV_FILE="$HOME/.cloudflare_env"
CF_API="https://api.cloudflare.com/client/v4"

# ── colours ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'
info()  { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${NC} %s\n" "$*"; }
error() { printf "${RED}✗${NC} %s\n" "$*" >&2; }

# ── load or prompt for credentials ─────────────────────────────────────────────
load_credentials() {
    if [ -f "$CF_ENV_FILE" ]; then
        source "$CF_ENV_FILE"
    fi

    if [ -z "${CF_API_TOKEN:-}" ]; then
        local TOKEN_URL="https://dash.cloudflare.com/profile/api-tokens/create"
        echo ""
        echo -e "  ${CYAN}${BOLD}Cloudflare API Token Setup${NC}"
        echo -e "  ─────────────────────────────────────"
        echo -e "  A one-time API token is needed for DNS management."
        echo ""
        echo -e "  ${BOLD}Steps:${NC}"
        echo -e "  1. Open the URL below in your browser"
        echo -e "  2. Use template: ${BOLD}Edit zone DNS${NC}"
        echo -e "  3. Zone Resources → Include → Specific zone → ${BOLD}${DEFAULT_ZONE}${NC}"
        echo -e "  4. Click ${BOLD}Continue to summary${NC} → ${BOLD}Create Token${NC}"
        echo -e "  5. Copy the token and paste it here"
        echo ""
        echo -e "  ${CYAN}${TOKEN_URL}${NC}"
        echo ""

        # Try to open browser automatically
        if command -v xdg-open &>/dev/null; then
            xdg-open "$TOKEN_URL" 2>/dev/null &
        elif command -v open &>/dev/null; then
            open "$TOKEN_URL" 2>/dev/null &
        fi

        read -rsp "  Paste API Token: " CF_API_TOKEN; echo
        if [ -z "$CF_API_TOKEN" ]; then
            error "API token cannot be empty"; exit 1
        fi

        # Verify token works
        echo ""
        info "Verifying token..."
        local verify
        verify=$(curl -sf -H "Authorization: Bearer $CF_API_TOKEN" \
            "${CF_API}/user/tokens/verify" 2>/dev/null) || {
            error "Token verification failed. Check your token."; exit 1
        }
        local status
        status=$(echo "$verify" | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',{}).get('status',''))" 2>/dev/null)
        if [ "$status" != "active" ]; then
            error "Token is not active (status: ${status})"; exit 1
        fi
        info "Token verified ✓"
    fi

    if [ -z "${CF_ZONE_ID:-}" ]; then
        # Auto-discover zone ID from the default zone
        info "Looking up zone ID for ${DEFAULT_ZONE}..."
        local resp
        resp=$(curl -sf -H "Authorization: Bearer $CF_API_TOKEN" \
            "${CF_API}/zones?name=${DEFAULT_ZONE}&status=active" 2>/dev/null) || {
            error "Failed to query Cloudflare API. Check your token."; exit 1
        }
        CF_ZONE_ID=$(echo "$resp" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['result'][0]['id'] if r['result'] else '')" 2>/dev/null)
        if [ -z "$CF_ZONE_ID" ]; then
            error "Zone '${DEFAULT_ZONE}' not found. Check token permissions."; exit 1
        fi
        info "Zone ID: ${CF_ZONE_ID}"
    fi

    # Save for reuse
    cat > "$CF_ENV_FILE" <<EOF
CF_API_TOKEN="${CF_API_TOKEN}"
CF_ZONE_ID="${CF_ZONE_ID}"
CF_ZONE_NAME="${DEFAULT_ZONE}"
EOF
    chmod 600 "$CF_ENV_FILE"
}

# ── API helper ─────────────────────────────────────────────────────────────────
cf_api() {
    local method="$1" endpoint="$2" data="${3:-}"
    local args=(-sf -X "$method" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")
    [ -n "$data" ] && args+=(-d "$data")
    curl "${args[@]}" "${CF_API}${endpoint}"
}

# ── resolve full record name ───────────────────────────────────────────────────
full_name() {
    local name="$1"
    if [[ "$name" == *"${DEFAULT_ZONE}" ]]; then
        echo "$name"
    elif [[ "$name" == "@" ]]; then
        echo "${DEFAULT_ZONE}"
    else
        echo "${name}.${DEFAULT_ZONE}"
    fi
}

# ── commands ───────────────────────────────────────────────────────────────────

cmd_list() {
    local filter_name=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name) filter_name="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    load_credentials

    local url="/zones/${CF_ZONE_ID}/dns_records?per_page=100"
    if [ -n "$filter_name" ]; then
        url+="&name=$(full_name "$filter_name")"
    fi

    local resp
    resp=$(cf_api GET "$url") || { error "API request failed"; exit 1; }

    echo ""
    printf "  ${BOLD}%-35s %-8s %-40s %-8s %s${NC}\n" "NAME" "TYPE" "VALUE" "TTL" "PROXY"
    echo "  $(printf '─%.0s' $(seq 1 110))"

    echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('result', []):
    name = r['name']
    rtype = r['type']
    content = r['content'][:38]
    ttl = 'Auto' if r['ttl'] == 1 else str(r['ttl'])
    proxy = '🟠 Yes' if r.get('proxied') else '⚪ No'
    print(f'  {name:<35} {rtype:<8} {content:<40} {ttl:<8} {proxy}')
count = len(data.get('result', []))
print(f'\n  Total: {count} records')
"
    echo ""
}

cmd_add() {
    local name="${1:-}" value="${2:-}"
    local rec_type="A" ttl=1 proxied=false
    shift 2 2>/dev/null || true

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --type)  rec_type="$2"; shift 2 ;;
            --ttl)   ttl="$2"; shift 2 ;;
            --proxy) proxied=true; shift ;;
            *) shift ;;
        esac
    done

    if [ -z "$name" ] || [ -z "$value" ]; then
        error "Usage: $0 add <name> <value> [--type A|AAAA|CNAME|TXT] [--ttl 3600] [--proxy]"
        exit 1
    fi

    load_credentials
    local fqdn; fqdn=$(full_name "$name")

    local payload
    payload=$(python3 -c "
import json
print(json.dumps({
    'type': '$rec_type',
    'name': '$fqdn',
    'content': '$value',
    'ttl': $ttl,
    'proxied': $proxied
}))
")

    info "Creating ${rec_type} record: ${fqdn} → ${value}"
    local resp
    resp=$(cf_api POST "/zones/${CF_ZONE_ID}/dns_records" "$payload") || {
        error "API request failed"; exit 1
    }

    local success
    success=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))")
    if [ "$success" = "True" ]; then
        info "DNS record created: ${fqdn} (${rec_type}) → ${value}"
    else
        local errors
        errors=$(echo "$resp" | python3 -c "import sys,json; [print(e.get('message','')) for e in json.load(sys.stdin).get('errors',[])]" 2>/dev/null)
        error "Failed to create record: $errors"
        exit 1
    fi
}

cmd_update() {
    local name="${1:-}" value="${2:-}"
    local rec_type="A" ttl=1 proxied=false
    shift 2 2>/dev/null || true

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --type)  rec_type="$2"; shift 2 ;;
            --ttl)   ttl="$2"; shift 2 ;;
            --proxy) proxied=true; shift ;;
            *) shift ;;
        esac
    done

    if [ -z "$name" ] || [ -z "$value" ]; then
        error "Usage: $0 update <name> <value> [--type A|AAAA|CNAME|TXT] [--ttl 3600] [--proxy]"
        exit 1
    fi

    load_credentials
    local fqdn; fqdn=$(full_name "$name")

    # Find existing record
    local search_resp
    search_resp=$(cf_api GET "/zones/${CF_ZONE_ID}/dns_records?name=${fqdn}&type=${rec_type}") || {
        error "API request failed"; exit 1
    }

    local record_id
    record_id=$(echo "$search_resp" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')" 2>/dev/null)
    if [ -z "$record_id" ]; then
        error "No existing ${rec_type} record found for ${fqdn}"
        exit 1
    fi

    local payload
    payload=$(python3 -c "
import json
print(json.dumps({
    'type': '$rec_type',
    'name': '$fqdn',
    'content': '$value',
    'ttl': $ttl,
    'proxied': $proxied
}))
")

    info "Updating ${rec_type} record: ${fqdn} → ${value}"
    local resp
    resp=$(cf_api PUT "/zones/${CF_ZONE_ID}/dns_records/${record_id}" "$payload") || {
        error "API request failed"; exit 1
    }

    local success
    success=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))")
    if [ "$success" = "True" ]; then
        info "DNS record updated: ${fqdn} (${rec_type}) → ${value}"
    else
        local errors
        errors=$(echo "$resp" | python3 -c "import sys,json; [print(e.get('message','')) for e in json.load(sys.stdin).get('errors',[])]" 2>/dev/null)
        error "Failed to update record: $errors"
        exit 1
    fi
}

cmd_delete() {
    local name="${1:-}" rec_type=""
    shift 1 2>/dev/null || true

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --type) rec_type="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    if [ -z "$name" ]; then
        error "Usage: $0 delete <name> [--type A|AAAA|CNAME|TXT]"
        exit 1
    fi

    load_credentials
    local fqdn; fqdn=$(full_name "$name")

    local url="/zones/${CF_ZONE_ID}/dns_records?name=${fqdn}"
    [ -n "$rec_type" ] && url+="&type=${rec_type}"

    local search_resp
    search_resp=$(cf_api GET "$url") || { error "API request failed"; exit 1; }

    local records
    records=$(echo "$search_resp" | python3 -c "
import sys, json
for r in json.load(sys.stdin).get('result', []):
    print(f\"{r['id']} {r['type']} {r['content']}\")
" 2>/dev/null)

    if [ -z "$records" ]; then
        warn "No records found for ${fqdn}"; return
    fi

    echo ""
    echo "  Records to delete:"
    echo "$records" | while read -r rid rtype rcontent; do
        printf "    ${RED}✗${NC} %s (%s) → %s\n" "$fqdn" "$rtype" "$rcontent"
    done
    echo ""
    printf "  ${RED}Confirm delete? [y/N]:${NC} "; read -rn1 yn; echo
    [[ "$yn" != "y" && "$yn" != "Y" ]] && { echo "  Cancelled."; return; }

    echo "$records" | while read -r rid rtype rcontent; do
        cf_api DELETE "/zones/${CF_ZONE_ID}/dns_records/${rid}" >/dev/null && \
            info "Deleted: ${fqdn} (${rtype}) → ${rcontent}" || \
            error "Failed to delete record ${rid}"
    done
}

# ── help ───────────────────────────────────────────────────────────────────────
show_help() {
    cat <<EOF
Usage: $(basename "$0") COMMAND [OPTIONS]

Manage Cloudflare DNS records for ${DEFAULT_ZONE}

Commands:
  list   [--name <filter>]                    List DNS records
  add    <name> <value> [options]             Create a DNS record
  update <name> <value> [options]             Update an existing record
  delete <name> [--type TYPE]                 Delete DNS record(s)

Options for add/update:
  --type TYPE     Record type: A, AAAA, CNAME, TXT (default: A)
  --ttl  SECONDS  TTL in seconds, 1 = Auto (default: Auto)
  --proxy         Enable Cloudflare proxy (orange cloud)

Examples:
  $(basename "$0") list
  $(basename "$0") list --name app
  $(basename "$0") add app 203.0.113.50                      # A record
  $(basename "$0") add app 203.0.113.50 --proxy              # A record, proxied
  $(basename "$0") add docs app.micstec.com --type CNAME     # CNAME
  $(basename "$0") add @ "v=spf1 include:_spf.google.com ~all" --type TXT
  $(basename "$0") update app 198.51.100.1
  $(basename "$0") delete old-app
  $(basename "$0") delete old-app --type CNAME

Credentials:
  On first run, prompts for a Cloudflare API token and saves to ~/.cloudflare_env
  Create a token at: https://dash.cloudflare.com/profile/api-tokens
  Required permission: Zone.DNS (Edit) for ${DEFAULT_ZONE}
EOF
}

# ── main ───────────────────────────────────────────────────────────────────────
case "${1:-}" in
    list)   shift; cmd_list "$@" ;;
    add)    shift; cmd_add "$@" ;;
    update) shift; cmd_update "$@" ;;
    delete) shift; cmd_delete "$@" ;;
    -h|--help|help) show_help ;;
    *) show_help; exit 1 ;;
esac
