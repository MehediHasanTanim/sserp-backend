#!/bin/sh
set -e

if [ ! -f /app/keys/jwt-private.pem ] || [ ! -f /app/keys/jwt-public.pem ]; then
  echo "Missing JWT keys under /app/keys — generate them on the host:"
  echo "  openssl genrsa -out keys/jwt-private.pem 2048"
  echo "  openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem"
  exit 1
fi

echo "Running migrations..."
npx prisma generate
npx prisma migrate deploy

echo "Seeding reference data..."
npx prisma db seed

echo "Starting API on :3000 (published as host :8030)..."
exec node dist/main.js
