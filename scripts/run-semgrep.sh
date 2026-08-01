#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Only ERROR-severity rules block CI; WARNING rules still exist for gradual cleanup.
ARGS=(--config .semgrep --metrics=off --severity=ERROR --error "$@")
if command -v semgrep >/dev/null 2>&1; then
  exec semgrep "${ARGS[@]}"
fi
if command -v docker >/dev/null 2>&1; then
  exec docker run --rm -v "$ROOT:/src" -w /src returntocorp/semgrep:1.97.0 \
    semgrep "${ARGS[@]}"
fi
echo "semgrep CLI or Docker required to run architectural rules" >&2
exit 1
