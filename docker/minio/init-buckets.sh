#!/bin/sh
set -e
mc alias set local http://minio:9000 minioadmin minioadmin

# Single physical bucket; app stores objects under logical folder prefixes.
mc mb --ignore-existing local/sserp
mc anonymous set none local/sserp || true

echo "MinIO bucket sserp ready (folder prefixes used by API)"
