#!/usr/bin/env bash
# sync-verify.sh — nightly integrity check of md-docs mirrors.
# Dry-run rsync with checksums; any listed path means drift (lsyncd missed it).
# Result is appended to /var/log/md-sync-verify.log; the cron fallback rsync
# will correct real drift within 5 minutes anyway.
set -uo pipefail

MIRRORS=("mli@54.165.17.203")
SRC="/home/mli/md-browse/backend/data/"
KEY="/home/mli/.ssh/mdsync_ed25519"
LOG="/var/log/md-sync-verify.log"

for m in "${MIRRORS[@]}"; do
    drift=$(rsync -anc --delete --out-format='%n' -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" "$SRC" "$m:/" 2>&1 | grep -v '^\.\?/\?$' | head -50)
    if [ -n "$drift" ]; then
        printf '%s DRIFT on %s:\n%s\n' "$(date -Is)" "$m" "$drift" >> "$LOG"
    else
        printf '%s OK %s\n' "$(date -Is)" "$m" >> "$LOG"
    fi
done
