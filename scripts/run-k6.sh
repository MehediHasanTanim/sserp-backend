#!/usr/bin/env bash
# Usage: npm run k6 -- login-spike   OR   npm run k6 -- scripts/login-spike.js
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${1:-}"
if [[ -z "$SCRIPT" ]]; then
  echo "Usage: npm run k6 -- <script-name>" >&2
  echo "Available:" >&2
  ls "$ROOT/k6/scripts"/*.js | xargs -n1 basename >&2
  exit 1
fi
if [[ -f "$SCRIPT" ]]; then
  TARGET="$SCRIPT"
elif [[ -f "$ROOT/k6/scripts/$SCRIPT" ]]; then
  TARGET="$ROOT/k6/scripts/$SCRIPT"
elif [[ -f "$ROOT/k6/scripts/${SCRIPT}.js" ]]; then
  TARGET="$ROOT/k6/scripts/${SCRIPT}.js"
else
  echo "k6 script not found: $SCRIPT" >&2
  exit 1
fi
if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 CLI not installed. See https://k6.io/docs/get-started/installation/" >&2
  exit 1
fi
exec k6 run "$TARGET"
