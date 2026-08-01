#!/usr/bin/env bash
# Ban jest.retryTimes — flaky retries are forbidden (11-test-automation §1).
set -euo pipefail
if rg -n --glob '!node_modules/**' --glob '!dist/**' 'retryTimes\s*\(' .; then
  echo "ERROR: jest.retryTimes is banned. Fix or delete the flaky test." >&2
  exit 1
fi
echo "OK: no jest.retryTimes usage"
