#!/usr/bin/env bash
# Daily logical backup — GPG-encrypted pg_dump (Phase 9)
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR=${BACKUP_DIR:-/var/backups/sserp}
mkdir -p "$OUT_DIR"
DUMP="$OUT_DIR/sserp-$STAMP.sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$DUMP"
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  gpg --batch --yes -e -r "$BACKUP_GPG_RECIPIENT" "$DUMP"
  rm -f "$DUMP"
  echo "Encrypted backup written: ${DUMP}.gpg"
else
  echo "Backup written (unencrypted — set BACKUP_GPG_RECIPIENT): $DUMP"
fi
# Retain 30 days local
find "$OUT_DIR" -type f -mtime +30 -delete
