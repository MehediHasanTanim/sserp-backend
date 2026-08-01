#!/usr/bin/env bash
# Daily MinIO off-site sync stub (Phase 9)
set -euo pipefail
echo "Syncing MinIO bucket to off-site (${OFFSITE_ENDPOINT:-unset}) — configure mc mirror in production"
# mc mirror local/sserp-files offsite/sserp-files --encrypt
exit 0
