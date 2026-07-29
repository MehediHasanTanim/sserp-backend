#!/bin/sh
set -e
mc alias set local http://minio:9000 minioadmin minioadmin

BUCKETS="student-documents iep-documents progress-reports therapy-attachments hr-documents invoices-receipts activity-media leave-documents exports"

for b in $BUCKETS; do
  mc mb --ignore-existing "local/$b"
done

# exports bucket: expire objects after 24 hours
mc anonymous set none local/exports || true
mc ilm rule add --expire-days 1 local/exports || true

echo "MinIO buckets ready"
