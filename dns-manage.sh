#!/usr/bin/env bash
set -euo pipefail

# dns-manage.sh — Interactive TUI for Cloudflare DNS management
# Supports multiple zones. Requires: curl, python3

CF_ENV_FILE="$HOME/.cloudflare_env"
CF_API="https://api.cloudflare.com/client/v4"
CF_API_TOKEN=""
CURRENT_ZONE_ID=""
CURRENT_ZONE_NAME=""

# ── colours ────────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; C='\033[0;36m'
M='\033[0;35m'; W='\033[1;37m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

clear_screen() { printf '\033[2J\033[H'; }
hr() { printf "${DIM}"; printf '─%.0s' $(seq 1 "${COLUMNS:-70}"); printf "${NC}\n"; }
header() {
    clear_screen
    printf "${B}${BOLD}╔══════════════════════════════════════╗${NC}\n"
    printf "${B}${BOLD}║  🌐 DNS Manager ─ %-18s║${NC}\n" "$1"
    printf "${B}${BOLD}╚══════════════════════════════════════╝${NC}\n"
    if [ -n "$CURRENT_ZONE_NAME" ]; then
        printf "${DIM}  zone: ${CURRENT_ZONE_NAME}${NC}\n"
    fi
    hr
}
info()  { printf "  ${G}✓${NC} %s\n" "$*"; }
warn()  { printf "  ${Y}⚠${NC} %s\n" "$*"; }
error() { printf "  ${R}✗${NC} %s\n" "$*"; }
menu_item() { printf "  ${C}${BOLD}%s${NC}) %s\n" "$1" "$2"; }
pause() { printf "\n${DIM}  Press Enter to continue…${NC}"; read -r; }

# ── API helper ─────────────────────────────────────────────────────────────────
cf_api() {
    local method="$1" endpoint="$2" data="${3:-}"
    local args=(-sf -X "$method" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")
    [ -n "$data" ] && args+=(-d "$data")
    curl "${args[@]}" "${CF_API}${endpoint}" 2>/dev/null
}

# ── credentials ────────────────────────────────────────────────────────────────
setup_token() {
    if [ -f "$CF_ENV_FILE" ]; then
        source "$CF_ENV_FILE"
    fi

    if [ -n "${CF_API_TOKEN:-}" ]; then
        return 0
    fi

    clear_screen
    local TOKEN_URL="https://dash.cloudflare.com/profile/api-tokens/create"
    echo ""
    echo -e "  ${C}${BOLD}Cloudflare API Token Setup${NC}"
    hr
    echo -e "  A one-time API token is needed for DNS management."
    echo ""
    echo -e "  ${BOLD}Steps:${NC}"
    echo -e "  1. Open the URL below in your browser"
    echo -e "  2. Use template: ${BOLD}Edit zone DNS${NC}"
    echo -e "  3. Zone Resources → Include → ${BOLD}All zones${NC}"
    echo -e "  4. Click ${BOLD}Continue to summary${NC} → ${BOLD}Create Token${NC}"
    echo -e "  5. Copy the token and paste it here"
    echo ""
    echo -e "  ${C}${TOKEN_URL}${NC}"
    echo ""

    if command -v xdg-open &>/dev/null; then
        xdg-open "$TOKEN_URL" 2>/dev/null &
    elif command -v open &>/dev/null; then
        open "$TOKEN_URL" 2>/dev/null &
    fi

    read -rsp "  Paste API Token: " CF_API_TOKEN; echo
    if [ -z "$CF_API_TOKEN" ]; then
        error "Token cannot be empty"; exit 1
    fi

    echo ""
    printf "  ${DIM}Verifying token…${NC}"
    local verify
    verify=$(curl -sf -H "Authorization: Bearer $CF_API_TOKEN" \
        "${CF_API}/user/tokens/verify" 2>/dev/null) || {
        echo ""; error "Token verification failed"; exit 1
    }
    local status
    status=$(echo "$verify" | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',{}).get('status',''))" 2>/dev/null)
    if [ "$status" != "active" ]; then
        echo ""; error "Token is not active (status: ${status})"; exit 1
    fi
    echo -e " ${G}✓${NC}"

    # Save (no zone-specific info yet)
    cat > "$CF_ENV_FILE" <<EOF
CF_API_TOKEN="${CF_API_TOKEN}"
EOF
    chmod 600 "$CF_ENV_FILE"
    info "Token saved to ${CF_ENV_FILE}"
    sleep 1
}

# ── zone picker ────────────────────────────────────────────────────────────────
pick_zone() {
    header "Select Zone"
    printf "  ${DIM}Fetching zones…${NC}\n"

    local resp
    resp=$(cf_api GET "/zones?per_page=50&status=active") || {
        error "Failed to fetch zones"
        printf "  ${Y}Reset token and try again? [y/N]:${NC} "; read -rn1 yn; echo
        if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
            rm -f "$CF_ENV_FILE"
            CF_API_TOKEN=""
            setup_token
            pick_zone
            return
        fi
        exit 1
    }

    local zones
    zones=$(echo "$resp" | python3 -c "
import sys, json
for r in json.load(sys.stdin).get('result', []):
    print(f\"{r['id']}|{r['name']}\")
" 2>/dev/null)

    if [ -z "$zones" ]; then
        error "No zones found. Check token permissions."
        echo ""
        printf "  ${Y}Reset token and try again? [y/N]:${NC} "; read -rn1 yn; echo
        if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
            rm -f "$CF_ENV_FILE"
            CF_API_TOKEN=""
            setup_token
            pick_zone
            return
        fi
        exit 1
    fi

    local count
    count=$(echo "$zones" | wc -l)

    if [ "$count" -eq 1 ]; then
        CURRENT_ZONE_ID=$(echo "$zones" | cut -d'|' -f1)
        CURRENT_ZONE_NAME=$(echo "$zones" | cut -d'|' -f2)
        info "Auto-selected zone: ${CURRENT_ZONE_NAME}"
        sleep 1
        return
    fi

    header "Select Zone"
    echo ""
    local i=1
    echo "$zones" | while IFS='|' read -r zid zname; do
        menu_item "$i" "$zname"
        i=$((i+1))
    done

    echo ""
    printf "  ${W}Zone #: ${NC}"; read -r znum
    local selected
    selected=$(echo "$zones" | sed -n "${znum}p")
    if [ -z "$selected" ]; then
        error "Invalid selection"; pause; pick_zone; return
    fi
    CURRENT_ZONE_ID=$(echo "$selected" | cut -d'|' -f1)
    CURRENT_ZONE_NAME=$(echo "$selected" | cut -d'|' -f2)
    info "Selected: ${CURRENT_ZONE_NAME}"
    sleep 1
}

# ── full name helper ───────────────────────────────────────────────────────────
full_name() {
    local name="$1"
    if [[ "$name" == *"${CURRENT_ZONE_NAME}" ]]; then
        echo "$name"
    elif [[ "$name" == "@" ]]; then
        echo "${CURRENT_ZONE_NAME}"
    else
        echo "${name}.${CURRENT_ZONE_NAME}"
    fi
}

# ── list records ───────────────────────────────────────────────────────────────
tui_list() {
    header "DNS Records"
    printf "  ${DIM}Fetching records…${NC}\n"

    local resp
    resp=$(cf_api GET "/zones/${CURRENT_ZONE_ID}/dns_records?per_page=100") || {
        error "API request failed"; pause; return
    }

    header "DNS Records"
    echo ""
    printf "  ${BOLD}%-4s %-30s %-7s %-35s %-6s %s${NC}\n" "#" "NAME" "TYPE" "VALUE" "TTL" "PROXY"
    hr

    echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for i, r in enumerate(data.get('result', []), 1):
    name = r['name'][:28]
    rtype = r['type']
    content = r['content'][:33]
    ttl = 'Auto' if r['ttl'] == 1 else str(r['ttl'])
    proxy = '🟠' if r.get('proxied') else '⚪'
    print(f'  {i:>3}) {name:<30} {rtype:<7} {content:<35} {ttl:<6} {proxy}')
count = len(data.get('result', []))
print(f'\n  Total: {count} records')
"
    pause
}

# ── add record ─────────────────────────────────────────────────────────────────
tui_add() {
    header "Add Record"
    echo ""
    printf "  ${W}Record name${NC} (e.g. app, www, @): "; read -r name
    [ -z "$name" ] && return

    echo ""
    echo "  Record type:"
    menu_item 1 "A (IPv4)"
    menu_item 2 "AAAA (IPv6)"
    menu_item 3 "CNAME"
    menu_item 4 "TXT"
    menu_item 5 "MX"
    printf "\n  ${W}Type [1]: ${NC}"; read -rn1 tnum; echo
    local rec_type
    case "${tnum:-1}" in
        1|"") rec_type="A" ;;
        2) rec_type="AAAA" ;;
        3) rec_type="CNAME" ;;
        4) rec_type="TXT" ;;
        5) rec_type="MX" ;;
        *) rec_type="A" ;;
    esac

    echo ""
    printf "  ${W}Value${NC} (IP, hostname, or text): "; read -r value
    [ -z "$value" ] && { error "Value required"; pause; return; }

    local priority=""
    if [ "$rec_type" = "MX" ]; then
        printf "  ${W}Priority${NC} [10]: "; read -r priority
        priority="${priority:-10}"
    fi

    echo ""
    printf "  ${W}Proxy through Cloudflare? [y/N]:${NC} "; read -rn1 do_proxy; echo
    local proxied="false"
    [[ "$do_proxy" == "y" || "$do_proxy" == "Y" ]] && proxied="true"

    printf "  ${W}TTL${NC} (1=Auto) [1]: "; read -r ttl_in
    local ttl="${ttl_in:-1}"

    local fqdn; fqdn=$(full_name "$name")

    local payload
    if [ "$rec_type" = "MX" ]; then
        payload=$(python3 -c "import json; print(json.dumps({'type':'$rec_type','name':'$fqdn','content':'$value','ttl':$ttl,'proxied':$proxied,'priority':$priority}))")
    else
        payload=$(python3 -c "import json; print(json.dumps({'type':'$rec_type','name':'$fqdn','content':'$value','ttl':$ttl,'proxied':$proxied}))")
    fi

    echo ""
    printf "  ${DIM}Creating ${rec_type} record: ${fqdn} → ${value}…${NC}\n"
    local resp
    resp=$(cf_api POST "/zones/${CURRENT_ZONE_ID}/dns_records" "$payload") || {
        error "API request failed"; pause; return
    }

    local success
    success=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
    if [ "$success" = "True" ]; then
        info "Created: ${fqdn} (${rec_type}) → ${value}"
    else
        local errmsg
        errmsg=$(echo "$resp" | python3 -c "import sys,json; [print(e.get('message','')) for e in json.load(sys.stdin).get('errors',[])]" 2>/dev/null)
        error "Failed: $errmsg"
    fi
    pause
}

# ── edit record ────────────────────────────────────────────────────────────────
tui_edit() {
    header "Edit Record"
    printf "  ${DIM}Fetching records…${NC}\n"

    local resp
    resp=$(cf_api GET "/zones/${CURRENT_ZONE_ID}/dns_records?per_page=100") || {
        error "API request failed"; pause; return
    }

    header "Edit Record"
    echo ""
    echo "$resp" | python3 -c "
import sys, json
for i, r in enumerate(json.load(sys.stdin).get('result', []), 1):
    proxy = '🟠' if r.get('proxied') else '⚪'
    print(f'  {i:>3}) {r[\"name\"][:30]:<30} {r[\"type\"]:<7} {r[\"content\"][:35]:<35} {proxy}')
"
    hr

    printf "\n  ${W}Record # to edit: ${NC}"; read -r rnum
    [ -z "$rnum" ] && return

    local record_data
    record_data=$(echo "$resp" | python3 -c "
import sys, json
r = json.load(sys.stdin)['result'][int('$rnum')-1]
print(f\"{r['id']}|{r['type']}|{r['name']}|{r['content']}|{r['ttl']}|{r.get('proxied',False)}|{r.get('priority','')}\")
" 2>/dev/null)

    if [ -z "$record_data" ]; then
        error "Invalid selection"; pause; return
    fi

    local rid rtype rname rcontent rttl rproxied rpriority
    IFS='|' read -r rid rtype rname rcontent rttl rproxied rpriority <<< "$record_data"

    echo ""
    echo -e "  ${BOLD}Current:${NC} ${rname} (${rtype}) → ${rcontent}"
    echo ""
    printf "  ${W}New value${NC} [${rcontent}]: "; read -r new_value
    new_value="${new_value:-$rcontent}"

    printf "  ${W}Proxy? [${rproxied}]:${NC} "; read -rn1 new_proxy; echo
    local proxied="$rproxied"
    [[ "$new_proxy" == "y" || "$new_proxy" == "Y" ]] && proxied="True"
    [[ "$new_proxy" == "n" || "$new_proxy" == "N" ]] && proxied="False"

    printf "  ${W}TTL${NC} [${rttl}]: "; read -r new_ttl
    new_ttl="${new_ttl:-$rttl}"

    local proxied_json="false"
    [[ "$proxied" == "True" ]] && proxied_json="true"

    local payload
    if [ -n "$rpriority" ] && [ "$rpriority" != "None" ]; then
        payload=$(python3 -c "import json; print(json.dumps({'type':'$rtype','name':'$rname','content':'$new_value','ttl':$new_ttl,'proxied':$proxied_json,'priority':${rpriority}}))")
    else
        payload=$(python3 -c "import json; print(json.dumps({'type':'$rtype','name':'$rname','content':'$new_value','ttl':$new_ttl,'proxied':$proxied_json}))")
    fi

    printf "\n  ${DIM}Updating…${NC}\n"
    local uresp
    uresp=$(cf_api PUT "/zones/${CURRENT_ZONE_ID}/dns_records/${rid}" "$payload") || {
        error "API request failed"; pause; return
    }

    local success
    success=$(echo "$uresp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
    if [ "$success" = "True" ]; then
        info "Updated: ${rname} (${rtype}) → ${new_value}"
    else
        local errmsg
        errmsg=$(echo "$uresp" | python3 -c "import sys,json; [print(e.get('message','')) for e in json.load(sys.stdin).get('errors',[])]" 2>/dev/null)
        error "Failed: $errmsg"
    fi
    pause
}

# ── delete record ──────────────────────────────────────────────────────────────
tui_delete() {
    header "Delete Record"
    printf "  ${DIM}Fetching records…${NC}\n"

    local resp
    resp=$(cf_api GET "/zones/${CURRENT_ZONE_ID}/dns_records?per_page=100") || {
        error "API request failed"; pause; return
    }

    header "Delete Record"
    echo ""
    echo "$resp" | python3 -c "
import sys, json
for i, r in enumerate(json.load(sys.stdin).get('result', []), 1):
    print(f'  {i:>3}) {r[\"name\"][:30]:<30} {r[\"type\"]:<7} {r[\"content\"][:40]}')
"
    hr

    printf "\n  ${W}Record # to delete: ${NC}"; read -r rnum
    [ -z "$rnum" ] && return

    local record_info
    record_info=$(echo "$resp" | python3 -c "
import sys, json
r = json.load(sys.stdin)['result'][int('$rnum')-1]
print(f\"{r['id']}|{r['name']}|{r['type']}|{r['content']}\")
" 2>/dev/null)

    if [ -z "$record_info" ]; then
        error "Invalid selection"; pause; return
    fi

    local rid rname rtype rcontent
    IFS='|' read -r rid rname rtype rcontent <<< "$record_info"

    echo ""
    echo -e "  ${R}Delete: ${rname} (${rtype}) → ${rcontent}${NC}"
    printf "  ${R}Confirm? [y/N]:${NC} "; read -rn1 yn; echo
    [[ "$yn" != "y" && "$yn" != "Y" ]] && { echo "  Cancelled."; pause; return; }

    cf_api DELETE "/zones/${CURRENT_ZONE_ID}/dns_records/${rid}" >/dev/null && \
        info "Deleted: ${rname} (${rtype})" || \
        error "Delete failed"
    pause
}

# ── search records ─────────────────────────────────────────────────────────────
tui_search() {
    header "Search Records"
    echo ""
    printf "  ${W}Search name (partial):${NC} "; read -r query
    [ -z "$query" ] && return

    local fqdn; fqdn=$(full_name "$query")
    printf "\n  ${DIM}Searching…${NC}\n"

    local resp
    resp=$(cf_api GET "/zones/${CURRENT_ZONE_ID}/dns_records?name=${fqdn}&per_page=100") || {
        error "API request failed"; pause; return
    }

    local count
    count=$(echo "$resp" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('result',[])))" 2>/dev/null)

    # If exact match returned nothing, try contains search
    if [ "$count" = "0" ]; then
        resp=$(cf_api GET "/zones/${CURRENT_ZONE_ID}/dns_records?per_page=100") || {
            error "API request failed"; pause; return
        }
        # Filter client-side
        resp=$(echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
filtered = [r for r in data.get('result',[]) if '$query'.lower() in r['name'].lower() or '$query'.lower() in r['content'].lower()]
data['result'] = filtered
json.dump(data, sys.stdout)
" 2>/dev/null)
    fi

    header "Search: $query"
    echo ""
    echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for i, r in enumerate(data.get('result', []), 1):
    proxy = '🟠' if r.get('proxied') else '⚪'
    print(f'  {i:>3}) {r[\"name\"][:30]:<30} {r[\"type\"]:<7} {r[\"content\"][:35]:<35} {proxy}')
count = len(data.get('result', []))
print(f'\n  Found: {count} records')
"
    pause
}

# ── switch zone ────────────────────────────────────────────────────────────────
tui_switch_zone() {
    CURRENT_ZONE_ID=""
    CURRENT_ZONE_NAME=""
    pick_zone
}

# ── reset token ────────────────────────────────────────────────────────────────
tui_reset_token() {
    header "Reset Token"
    printf "  ${Y}Remove saved token and re-authenticate? [y/N]:${NC} "; read -rn1 yn; echo
    [[ "$yn" != "y" && "$yn" != "Y" ]] && return
    rm -f "$CF_ENV_FILE"
    CF_API_TOKEN=""
    info "Token removed. Will prompt on next action."
    pause
}

# ── main menu ──────────────────────────────────────────────────────────────────
main_menu() {
    while true; do
        header "Main Menu"
        echo ""
        menu_item 1 "List all records"
        menu_item 2 "Add record"
        menu_item 3 "Edit record"
        menu_item 4 "Delete record"
        menu_item 5 "Search records"
        hr
        menu_item z "Switch zone (current: ${CURRENT_ZONE_NAME})"
        menu_item t "Reset API token"
        menu_item q "Quit"
        printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
        case "${choice}" in
            1) tui_list ;;
            2) tui_add ;;
            3) tui_edit ;;
            4) tui_delete ;;
            5) tui_search ;;
            z|Z) tui_switch_zone ;;
            t|T) tui_reset_token ;;
            q|Q) echo ""; info "Bye!"; exit 0 ;;
        esac
    done
}

# ── CLI passthrough (optional: dns-manage.sh list, add, etc.) ──────────────────
case "${1:-}" in
    -h|--help|help)
        cat <<'EOF'
Usage: dns-manage.sh              # Interactive TUI mode
       dns-manage.sh --help       # Show this help

Interactive TUI for managing Cloudflare DNS records.
Supports multiple zones. Requires: curl, python3.

On first run, prompts for a Cloudflare API token (saved to ~/.cloudflare_env).
Create one at: https://dash.cloudflare.com/profile/api-tokens
Permission needed: Zone.DNS (Edit) — select "All zones" for multi-zone support.
EOF
        exit 0 ;;
    *)
        setup_token
        pick_zone
        main_menu
        ;;
esac
