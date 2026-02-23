#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# md-browse Simple TUI — pure bash, no dependencies, keyboard-driven
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

API_URL="${MD_BROWSE_URL:-http://localhost:3001}"
TOKEN=""
USERNAME=""
ROLE=""

# ── Colors & helpers ─────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; C='\033[0;36m'
M='\033[0;35m'; W='\033[1;37m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

clear_screen() { printf '\033[2J\033[H'; }
hr() { printf "${DIM}"; printf '─%.0s' $(seq 1 "${COLUMNS:-70}"); printf "${NC}\n"; }
header() {
    clear_screen
    printf "${B}${BOLD}╔══════════════════════════════════════╗${NC}\n"
    printf "${B}${BOLD}║  🔖 md-browse  ─  $1$(printf '%*s' $((19 - ${#1})) '')║${NC}\n"
    printf "${B}${BOLD}╚══════════════════════════════════════╝${NC}\n"
    printf "${DIM}  user: ${USERNAME} (${ROLE})  │  ${API_URL}${NC}\n"
    hr
}
info()  { printf "${G}✓${NC} %s\n" "$1"; }
warn()  { printf "${Y}⚠${NC} %s\n" "$1"; }
error() { printf "${R}✗${NC} %s\n" "$1"; }
menu_item() { printf "  ${C}${BOLD}%s${NC}) %s\n" "$1" "$2"; }
pause() { printf "\n${DIM}Press Enter to continue…${NC}"; read -r; }

# ── API helpers ──────────────────────────────────────────────────────────────
api_get() {
    curl -sf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "${API_URL}$1" 2>/dev/null
}

api_post() {
    curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2" "${API_URL}$1" 2>/dev/null
}

api_put() {
    curl -sf -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2" "${API_URL}$1" 2>/dev/null
}

api_delete() {
    curl -sf -X DELETE -H "Authorization: Bearer $TOKEN" -o /dev/null -w "%{http_code}" "${API_URL}$1" 2>/dev/null
}

api_upload() {
    curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
        ${3:+-F "folder_id=$3"} ${4:+-F "category=$4"} ${5:+-F "tags=$5"} \
        -F "file=@$1" "${API_URL}/api/v1/documents/upload" 2>/dev/null
}

# JSON field extractor (no jq dependency)
jf() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }
jlist() { python3 -c "
import sys,json
d=json.load(sys.stdin)
$1
" 2>/dev/null; }

# ═════════════════════════════════════════════════════════════════════════════
#  LOGIN
# ═════════════════════════════════════════════════════════════════════════════
do_login() {
    clear_screen
    printf "${B}${BOLD}╔══════════════════════════════════════╗${NC}\n"
    printf "${B}${BOLD}║     🔖 md-browse  ─  Login          ║${NC}\n"
    printf "${B}${BOLD}╚══════════════════════════════════════╝${NC}\n\n"

    printf "  Server URL [${API_URL}]: "; read -r url
    [ -n "$url" ] && API_URL="${url%/}"

    printf "  Username: "; read -r user
    printf "  Password: "; read -rs pass; echo

    local resp
    resp=$(curl -sf -X POST -H "Content-Type: application/json" \
        -d "{\"username\":\"$user\",\"password\":\"$pass\"}" \
        "${API_URL}/api/auth/login" 2>/dev/null) || { error "Login failed"; sleep 2; do_login; return; }

    TOKEN=$(echo "$resp" | jf "['token']")
    USERNAME=$(echo "$resp" | jf "['username']")
    ROLE=$(echo "$resp" | jf "['role']")
    info "Logged in as ${USERNAME} (${ROLE})"
    sleep 1
}

# ═════════════════════════════════════════════════════════════════════════════
#  MAIN MENU
# ═════════════════════════════════════════════════════════════════════════════
main_menu() {
    while true; do
        header "Main Menu"
        menu_item 1 "Documents"
        menu_item 2 "Search"
        menu_item 3 "Upload Document"
        menu_item 4 "Folders"
        menu_item 5 "Users"
        menu_item 6 "Settings"
        menu_item 7 "Audit Logs"
        menu_item 8 "Agent Tokens"
        hr
        menu_item q "Quit"
        printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
        case "$choice" in
            1) documents_menu ;;
            2) search_menu ;;
            3) upload_menu ;;
            4) folders_menu ;;
            5) users_menu ;;
            6) settings_menu ;;
            7) audit_menu ;;
            8) agent_tokens_menu ;;
            q|Q) clear_screen; exit 0 ;;
        esac
    done
}

# ═════════════════════════════════════════════════════════════════════════════
#  DOCUMENTS
# ═════════════════════════════════════════════════════════════════════════════
documents_menu() {
    while true; do
        header "Documents"
        local data
        data=$(api_get "/api/v1/documents?page_size=100&sort_by=updated_at&sort_order=desc")
        local count
        count=$(echo "$data" | jf "['pagination']['total']")
        printf "  ${W}Total: ${count} documents${NC}\n\n"

        echo "$data" | jlist "
for i,d in enumerate(d['data']):
    tags = ', '.join(d.get('tags',[]))[:20]
    folder = d.get('folder_id','') or 'root'
    print(f\"  {i+1:>3}) {d['title'][:35]:<36} {d.get('category',''):<14} {tags:<20} {d.get('updated_at','')[:10]}\")
"
        hr
        menu_item v "View document"
        menu_item e "Edit document"
        menu_item d "Delete document"
        menu_item h "Version history"
        menu_item b "Back"
        printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
        case "$choice" in
            v) doc_view "$data" ;;
            e) doc_edit "$data" ;;
            d) doc_delete "$data" ;;
            h) doc_versions "$data" ;;
            b|B) return ;;
        esac
    done
}

_pick_doc_id() {
    local data="$1"
    printf "  Document #: " >&2; read -r num
    echo "$data" | jf "['data'][${num}-1]['id']" 2>/dev/null
}

_show_content() {
    local doc="$1" mode="${2:-text}"
    local tmp; tmp=$(mktemp /tmp/md-browse-XXXXXX.md)
    echo "$doc" | python3 -c "import sys,json; print(json.load(sys.stdin).get('content_md',''))" > "$tmp" 2>/dev/null
    if [[ "$mode" == "glow" ]] && command -v glow &>/dev/null; then
        glow -p "$tmp"
    else
        ${PAGER:-less} "$tmp"
    fi
    rm -f "$tmp"
}

doc_view() {
    local data="$1"
    local id; id=$(_pick_doc_id "$data") || { error "Invalid"; pause; return; }
    [ -z "$id" ] && { error "Invalid number"; pause; return; }
    header "Document"
    local doc; doc=$(api_get "/api/v1/documents/$id")
    echo "$doc" | jlist "
doc = d
print(f\"  Title:      {doc['title']}\")
print(f\"  Category:   {doc.get('category','')}\")
print(f\"  Tags:       {', '.join(doc.get('tags',[]))}\")
print(f\"  Version:    {doc.get('latest_version','')}\")
print(f\"  Visibility: {doc.get('visibility','')}\")
print(f\"  Created by: {doc.get('created_by','')}\")
print(f\"  Created:    {doc.get('created_at','')[:19]}\")
print(f\"  Updated:    {doc.get('updated_at','')[:19]}\")
print(f\"  Checksum:   {doc.get('checksum','')[:16]}\")
print()
"
    hr
    printf "  ${C}g${NC}) Rendered (glow)  ${C}t${NC}) Raw text  ${C}Enter${NC}) Skip\n"
    printf "  ${W}Show content:${NC} "; read -rn1 show; echo
    if [[ "$show" == "g" || "$show" == "G" ]]; then
        _show_content "$doc" glow
    elif [[ "$show" == "t" || "$show" == "T" ]]; then
        _show_content "$doc" text
    fi
    pause
}

doc_edit() {
    local data="$1"
    local id; id=$(_pick_doc_id "$data") || { error "Invalid"; pause; return; }
    [ -z "$id" ] && { error "Invalid number"; pause; return; }
    local doc; doc=$(api_get "/api/v1/documents/$id")

    printf "\n  ${W}What to edit?${NC}\n"
    menu_item 1 "Title"
    menu_item 2 "Tags"
    menu_item 3 "Category"
    menu_item 4 "Content (opens \$EDITOR)"
    menu_item 5 "Visibility"
    printf "  ${W}Choose: ${NC}"; read -rn1 echoice; echo

    case "$echoice" in
        1)
            printf "  New title: "; read -r new_title
            local result; result=$(api_put "/api/v1/documents/$id" "{\"title\":\"$new_title\",\"change_note\":\"title updated\"}")
            [ -n "$result" ] && info "Title updated" || error "Update failed"
            ;;
        2)
            printf "  New tags (comma-separated): "; read -r new_tags
            local tags_json; tags_json=$(python3 -c "import json; print(json.dumps([t.strip() for t in '$new_tags'.split(',') if t.strip()]))")
            local result; result=$(api_put "/api/v1/documents/$id" "{\"tags\":$tags_json,\"change_note\":\"tags updated\"}")
            [ -n "$result" ] && info "Tags updated" || error "Update failed"
            ;;
        3)
            printf "  New category: "; read -r new_cat
            local result; result=$(api_put "/api/v1/documents/$id" "{\"category\":\"$new_cat\",\"change_note\":\"category updated\"}")
            [ -n "$result" ] && info "Category updated" || error "Update failed"
            ;;
        4)
            local tmp; tmp=$(mktemp /tmp/mdbrowse_XXXXXX.md)
            echo "$doc" | python3 -c "import sys,json; print(json.load(sys.stdin).get('content_md',''))" > "$tmp"
            ${EDITOR:-nano} "$tmp"
            local content; content=$(python3 -c "import sys,json; print(json.dumps(open('$tmp').read()))")
            printf "  Change note: "; read -r note
            local result; result=$(api_put "/api/v1/documents/$id" "{\"content_md\":$content,\"change_note\":\"${note:-edited via TUI}\"}")
            rm -f "$tmp"
            [ -n "$result" ] && info "Content updated" || error "Update failed"
            ;;
        5)
            printf "  Visibility (private/team/public): "; read -r vis
            local result; result=$(api_put "/api/v1/documents/$id" "{\"visibility\":\"$vis\",\"change_note\":\"visibility updated\"}")
            [ -n "$result" ] && info "Visibility updated" || error "Update failed"
            ;;
    esac
    pause
}

doc_delete() {
    local data="$1"
    local id; id=$(_pick_doc_id "$data") || { error "Invalid"; pause; return; }
    [ -z "$id" ] && { error "Invalid number"; pause; return; }
    printf "  ${R}Confirm delete? [y/N]:${NC} "; read -rn1 yn; echo
    if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
        local code; code=$(api_delete "/api/v1/documents/$id")
        [[ "$code" == "204" ]] && info "Deleted" || error "Delete failed (HTTP $code)"
    fi
    pause
}

doc_versions() {
    local data="$1"
    local id; id=$(_pick_doc_id "$data") || { error "Invalid"; pause; return; }
    [ -z "$id" ] && { error "Invalid number"; pause; return; }
    header "Versions"
    local vers; vers=$(api_get "/api/v1/documents/$id/versions")
    echo "$vers" | jlist "
for v in d.get('versions',[]):
    print(f\"  v{v['version_number']:<4} {v.get('created_by',''):<12} {v.get('created_at','')[:19]}  {v.get('change_note','')[:40]}\")
"
    printf "\n  ${W}Rollback to version? (number or Enter to skip):${NC} "; read -r ver
    if [ -n "$ver" ]; then
        printf "  Change note: "; read -r note
        local result; result=$(api_post "/api/v1/documents/$id/rollback" "{\"target_version\":$ver,\"change_note\":\"${note:-rollback via TUI}\"}")
        [ -n "$result" ] && info "Rolled back to v${ver}" || error "Rollback failed"
    fi
    pause
}

# ═════════════════════════════════════════════════════════════════════════════
#  SEARCH
# ═════════════════════════════════════════════════════════════════════════════
search_menu() {
    header "Search"
    printf "  Query: "; read -r query
    [ -z "$query" ] && return
    local encoded; encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))")
    local data; data=$(api_get "/api/v1/search?q=${encoded}&page_size=50")
    local count; count=$(echo "$data" | jf "['pagination']['total']")
    printf "\n  ${W}Found: ${count} results${NC}\n\n"
    echo "$data" | jlist "
for i,d in enumerate(d.get('data',[])):
    snippet = d.get('snippet','')[:50].replace(chr(10),' ')
    print(f\"  {i+1:>3}) {d['title'][:35]:<36} {snippet}\")
"
    printf "\n  ${W}View # (or Enter to go back):${NC} "; read -r num
    if [ -n "$num" ]; then
        local id; id=$(echo "$data" | jf "['data'][${num}-1]['id']" 2>/dev/null)
        if [ -n "$id" ]; then
            header "Document"
            local doc; doc=$(api_get "/api/v1/documents/$id")
            printf "  ${C}g${NC}) Rendered (glow)  ${C}t${NC}) Raw text  ${C}Enter${NC}) Skip\n"
            printf "  ${W}Show content:${NC} "; read -rn1 show; echo
            if [[ "$show" == "g" || "$show" == "G" ]]; then
                _show_content "$doc" glow
            elif [[ "$show" == "t" || "$show" == "T" ]]; then
                _show_content "$doc" text
            fi
        fi
    fi
    pause
}

# ═════════════════════════════════════════════════════════════════════════════
#  UPLOAD
# ═════════════════════════════════════════════════════════════════════════════
upload_menu() {
    header "Upload Document"
    menu_item 1 "Local file"
    menu_item 2 "Remote file (SSH)"
    menu_item 3 "Paste/create new"
    menu_item b "Back"
    printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
    case "$choice" in
        1) upload_local ;;
        2) upload_ssh ;;
        3) upload_new ;;
        b|B) return ;;
    esac
}

upload_local() {
    printf "\n  File path: "; read -re filepath
    [ -z "$filepath" ] && return
    filepath="${filepath/#\~/$HOME}"
    if [ ! -f "$filepath" ]; then
        error "File not found: $filepath"; pause; return
    fi
    _do_upload "$filepath"
}

upload_ssh() {
    printf "\n  SSH user@host: "; read -r target
    [ -z "$target" ] && return
    printf "  Remote path: "; read -r rpath
    [ -z "$rpath" ] && return

    # List remote directory
    printf "\n  ${DIM}Listing ${target}:${rpath}…${NC}\n"
    local listing
    listing=$(ssh -o BatchMode=yes -o ConnectTimeout=5 "$target" "ls -la $rpath" 2>&1) || { error "SSH failed: $listing"; pause; return; }
    local md_files
    md_files=$(echo "$listing" | grep -E '\.md$|\.markdown$' || true)
    if [ -z "$md_files" ]; then
        warn "No .md files found in ${target}:${rpath}"; pause; return
    fi
    echo "$md_files" | awk '{print NR") "$NF}'

    printf "\n  File # (or full filename): "; read -r pick
    local filename
    if [[ "$pick" =~ ^[0-9]+$ ]]; then
        filename=$(echo "$md_files" | awk "NR==$pick{print \$NF}")
    else
        filename="$pick"
    fi
    [ -z "$filename" ] && { error "No file selected"; pause; return; }

    local tmp; tmp=$(mktemp /tmp/mdbrowse_ssh_XXXXXX.md)
    printf "  ${DIM}Downloading ${filename}…${NC}\n"
    scp -o BatchMode=yes -o ConnectTimeout=5 "${target}:${rpath%/}/$filename" "$tmp" 2>/dev/null || { error "SCP failed"; rm -f "$tmp"; pause; return; }
    _do_upload "$tmp"
    rm -f "$tmp"
}

upload_new() {
    printf "\n  Document title: "; read -r title
    [ -z "$title" ] && return
    local tmp; tmp=$(mktemp /tmp/mdbrowse_new_XXXXXX.md)
    cat > "$tmp" <<EOF
---
title: $title
---

EOF
    ${EDITOR:-nano} "$tmp"
    _do_upload "$tmp"
    rm -f "$tmp"
}

_do_upload() {
    local filepath="$1"
    printf "  Category (optional): "; read -r cat
    printf "  Tags (comma-separated, optional): "; read -r tags
    printf "  Folder ID (optional): "; read -r folder

    local result
    result=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
        ${cat:+-F "category=$cat"} ${tags:+-F "tags=$tags"} ${folder:+-F "folder_id=$folder"} \
        -F "file=@$filepath" "${API_URL}/api/v1/documents/upload" 2>/dev/null)
    if [ -n "$result" ]; then
        info "Uploaded: $(echo "$result" | jf "['documents'][0]['title']")"
    else
        error "Upload failed"
    fi
    pause
}

# ═════════════════════════════════════════════════════════════════════════════
#  FOLDERS
# ═════════════════════════════════════════════════════════════════════════════
folders_menu() {
    while true; do
        header "Folders"
        local data; data=$(api_get "/api/v1/folders")
        echo "$data" | jlist "
for i,f in enumerate(d):
    parent = f.get('parent_id','') or 'root'
    print(f\"  {i+1:>3}) {f['name']:<25} parent={parent[:12]:<14} {f.get('created_at','')[:10]}  id={f['id'][:12]}\")
"
        hr
        menu_item c "Create folder"
        menu_item r "Rename folder"
        menu_item d "Delete folder"
        menu_item b "Back"
        printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
        case "$choice" in
            c)
                printf "  Folder name: "; read -r fname
                printf "  Parent folder # (or Enter for root): "; read -r pnum
                local parent_id=""
                [ -n "$pnum" ] && parent_id=$(echo "$data" | jf "[$pnum-1]['id']" 2>/dev/null)
                local body="{\"name\":\"$fname\"${parent_id:+,\"parent_id\":\"$parent_id\"}}"
                local result; result=$(api_post "/api/v1/folders" "$body")
                [ -n "$result" ] && info "Folder created" || error "Create failed"
                ;;
            r)
                printf "  Folder #: "; read -r fnum
                local fid; fid=$(echo "$data" | jf "[$fnum-1]['id']" 2>/dev/null)
                [ -z "$fid" ] && { error "Invalid"; continue; }
                printf "  New name: "; read -r newname
                local result; result=$(api_put "/api/v1/folders/$fid" "{\"name\":\"$newname\"}")
                [ -n "$result" ] && info "Renamed" || error "Rename failed"
                ;;
            d)
                printf "  Folder #: "; read -r fnum
                local fid; fid=$(echo "$data" | jf "[$fnum-1]['id']" 2>/dev/null)
                [ -z "$fid" ] && { error "Invalid"; continue; }
                printf "  ${R}Confirm delete? [y/N]:${NC} "; read -rn1 yn; echo
                if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
                    local code; code=$(api_delete "/api/v1/folders/$fid")
                    [[ "$code" == "204" ]] && info "Deleted" || error "Delete failed"
                fi
                ;;
            b|B) return ;;
        esac
    done
}

# ═════════════════════════════════════════════════════════════════════════════
#  USERS
# ═════════════════════════════════════════════════════════════════════════════
users_menu() {
    while true; do
        header "User Management"
        local data; data=$(api_get "/api/v1/admin/users")
        echo "$data" | jlist "
for i,u in enumerate(d):
    print(f\"  {i+1:>3}) {u['username']:<20} role={u.get('role','viewer'):<10} {u.get('created_at','')[:10]}\")
"
        hr
        menu_item c "Create user"
        menu_item r "Change role"
        menu_item p "Change password"
        menu_item d "Delete user"
        menu_item b "Back"
        printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
        case "$choice" in
            c)
                printf "  Username: "; read -r newuser
                printf "  Password: "; read -rs newpass; echo
                printf "  Role (admin/editor/viewer): "; read -r newrole
                newrole="${newrole:-viewer}"
                local result; result=$(api_post "/api/v1/admin/users" "{\"username\":\"$newuser\",\"password\":\"$newpass\",\"role\":\"$newrole\"}")
                [ -n "$result" ] && info "User '${newuser}' created" || error "Create failed"
                ;;
            r)
                printf "  User #: "; read -r unum
                local uname; uname=$(echo "$data" | jf "[$unum-1]['username']" 2>/dev/null)
                [ -z "$uname" ] && { error "Invalid"; continue; }
                printf "  New role (admin/editor/viewer): "; read -r newrole
                local result; result=$(api_put "/api/v1/admin/users/$uname" "{\"role\":\"$newrole\"}")
                [ -n "$result" ] && info "'${uname}' → ${newrole}" || error "Update failed"
                ;;
            p)
                printf "  User #: "; read -r unum
                local uname; uname=$(echo "$data" | jf "[$unum-1]['username']" 2>/dev/null)
                [ -z "$uname" ] && { error "Invalid"; continue; }
                printf "  New password: "; read -rs newpass; echo
                local result; result=$(api_put "/api/v1/admin/users/$uname" "{\"password\":\"$newpass\"}")
                [ -n "$result" ] && info "Password changed" || error "Update failed"
                ;;
            d)
                printf "  User #: "; read -r unum
                local uname; uname=$(echo "$data" | jf "[$unum-1]['username']" 2>/dev/null)
                [ -z "$uname" ] && { error "Invalid"; continue; }
                printf "  ${R}Delete '${uname}'? [y/N]:${NC} "; read -rn1 yn; echo
                if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
                    local code; code=$(api_delete "/api/v1/admin/users/$uname")
                    [[ "$code" == "204" ]] && info "Deleted" || error "Delete failed"
                fi
                ;;
            b|B) return ;;
        esac
    done
}

# ═════════════════════════════════════════════════════════════════════════════
#  SETTINGS
# ═════════════════════════════════════════════════════════════════════════════
settings_menu() {
    while true; do
        header "Settings"
        local data; data=$(api_get "/api/v1/admin/settings")
        echo "$data" | jlist "
for k,v in d.items():
    print(f\"  {k:<30} = {v}\")
"
        hr
        menu_item t "Toggle registration"
        menu_item b "Back"
        printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
        case "$choice" in
            t)
                local current; current=$(echo "$data" | jf "['registration_enabled']")
                local new_val
                [[ "$current" == "True" ]] && new_val="false" || new_val="true"
                local result; result=$(api_put "/api/v1/admin/settings" "{\"registration_enabled\":$new_val}")
                [ -n "$result" ] && info "Registration → $new_val" || error "Update failed"
                ;;
            b|B) return ;;
        esac
    done
}

# ═════════════════════════════════════════════════════════════════════════════
#  AUDIT LOGS
# ═════════════════════════════════════════════════════════════════════════════
audit_menu() {
    local page=1
    while true; do
        header "Audit Logs (page $page)"
        local data; data=$(api_get "/api/v1/audit-logs?page=$page&page_size=20")
        local total; total=$(echo "$data" | jf "['pagination']['total']")
        printf "  ${W}Total: ${total} entries${NC}\n\n"
        printf "  ${DIM}%-20s %-16s %-20s %-12s %s${NC}\n" "Time" "Actor" "Action" "Type" "Resource"
        echo "$data" | jlist "
for e in d.get('data',[]):
    actor = f\"{e.get('actor_type','')}:{e.get('actor_id','')}\"
    print(f\"  {e.get('created_at','')[:19]:<20} {actor[:16]:<16} {e.get('action',''):<20} {e.get('resource_type',''):<12} {e.get('resource_id','')[:20]}\")
"
        hr
        menu_item n "Next page"
        menu_item p "Previous page"
        menu_item f "Filter by action"
        menu_item b "Back"
        printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
        case "$choice" in
            n|N) ((page++)) ;;
            p|P) ((page > 1)) && ((page--)) ;;
            f)
                printf "  Action filter (e.g. document.create): "; read -r action_filter
                data=$(api_get "/api/v1/audit-logs?page=1&page_size=20&action=$action_filter")
                echo "$data" | jlist "
for e in d.get('data',[]):
    actor = f\"{e.get('actor_type','')}:{e.get('actor_id','')}\"
    print(f\"  {e.get('created_at','')[:19]:<20} {actor[:16]:<16} {e.get('action',''):<20} {e.get('resource_type',''):<12} {e.get('resource_id','')[:20]}\")
"
                pause
                ;;
            b|B) return ;;
        esac
    done
}

# ═════════════════════════════════════════════════════════════════════════════
#  AGENT TOKENS
# ═════════════════════════════════════════════════════════════════════════════
agent_tokens_menu() {
    while true; do
        header "Agent Tokens"
        printf "  ${DIM}(Agent tokens are write-once; existing tokens can only be viewed via audit logs)${NC}\n\n"
        menu_item c "Create new agent token"
        menu_item b "Back"
        printf "\n  ${W}Choose: ${NC}"; read -rn1 choice; echo
        case "$choice" in
            c)
                printf "  Token name: "; read -r tname
                [ -z "$tname" ] && continue
                printf "  Scopes (comma-sep, from: documents:read,documents:write,versions:read,search:read,audit:read)\n"
                printf "  Scopes: "; read -r scopes_raw
                local scopes_json; scopes_json=$(python3 -c "import json; print(json.dumps([s.strip() for s in '$scopes_raw'.split(',') if s.strip()]))")
                printf "  Expires (ISO date or empty for never): "; read -r expires
                local body="{\"name\":\"$tname\",\"scopes\":$scopes_json${expires:+,\"expires_at\":\"$expires\"}}"
                local result; result=$(api_post "/api/v1/agents/tokens" "$body")
                if [ -n "$result" ]; then
                    info "Token created!"
                    printf "\n  ${R}${BOLD}SECRET (save now, shown only once):${NC}\n"
                    echo "$result" | jlist "
print(f\"  Token:   {d['secret_token']}\")
print(f\"  Name:    {d['name']}\")
print(f\"  Scopes:  {', '.join(d['scopes'])}\")
print(f\"  Prefix:  {d['token_prefix']}\")
print(f\"  Expires: {d.get('expires_at') or 'never'}\")
"
                else
                    error "Create failed"
                fi
                pause
                ;;
            b|B) return ;;
        esac
    done
}

# ═════════════════════════════════════════════════════════════════════════════
#  CATEGORIES & TAGS QUICK VIEW
# ═════════════════════════════════════════════════════════════════════════════

# ═════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═════════════════════════════════════════════════════════════════════════════
main() {
    if ! command -v curl &>/dev/null; then echo "curl required"; exit 1; fi
    if ! command -v python3 &>/dev/null; then echo "python3 required"; exit 1; fi

    do_login
    main_menu
}

main "$@"
