#!/usr/bin/env bash
# Fail if test/factory/seed fixtures look like real BD mobiles or NIDs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGETS=(
  "$ROOT/test"
  "$ROOT/src/shared/testing"
  "$ROOT/prisma/seed"
  "$ROOT/scripts"
)
# BD mobile: 01XXXXXXXXX (11 digits). Exclude faker-style sequences and comments carefully.
PATTERN='(^|[^0-9])01[3-9][0-9]{8}([^0-9]|$)|NID[[:space:]]*[:=][[:space:]]*[0-9]{10,17}'
found=0
for dir in "${TARGETS[@]}"; do
  if [[ -d "$dir" ]]; then
    if rg -n --glob '!**/node_modules/**' -e "$PATTERN" "$dir" 2>/dev/null; then
      found=1
    fi
  fi
done
if [[ "$found" -eq 1 ]]; then
  echo "ERROR: possible real BD mobile/NID patterns in fixtures. Use Faker-only fictional data." >&2
  exit 1
fi
echo "OK: no sensitive-looking fixture patterns"
