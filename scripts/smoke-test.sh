#!/usr/bin/env bash
# Smoke test after cutover
set -euo pipefail
BASE=${BASE_URL:-http://localhost:3000/api/v1}
curl -sf "$BASE/../health/live" || curl -sf "${BASE%/v1}/../health/live" || curl -sf "http://localhost:3000/api/health/live"
echo "live ok"
curl -sf "http://localhost:3000/api/health/ready"
echo "ready ok"
echo "Smoke passed"
