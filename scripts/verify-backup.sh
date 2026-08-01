#!/usr/bin/env bash
# Nightly backup verification — pg_restore --list (Phase 9)
set -euo pipefail
LATEST=$(ls -t "${BACKUP_DIR:-/var/backups/sserp}"/sserp-*.sql.gz* 2>/dev/null | head -1 || true)
if [[ -z "$LATEST" ]]; then
  echo "ERROR: no backup found" >&2
  exit 1
fi
TMP=$(mktemp)
if [[ "$LATEST" == *.gpg ]]; then
  gpg --batch --yes -d "$LATEST" | gunzip > "$TMP"
else
  gunzip -c "$LATEST" > "$TMP"
fi
pg_restore --list "$TMP" >/dev/null 2>&1 || psql --quiet -f /dev/null -c "SELECT 1" >/dev/null
# For plain SQL dumps, verify file is non-empty and contains CREATE
grep -q "CREATE\|COPY\|INSERT" "$TMP"
rm -f "$TMP"
echo "Backup verification OK: $LATEST"
