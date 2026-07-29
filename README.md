# SSERP Backend

NestJS API for the Special School & Therapy Center ERP (Phase 0 foundation + Phase 1 HR & School Core).

## Stack

- Node.js 20, NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, MinIO, BullMQ

## Quick start

```bash
# 1. Dependencies
cp .env.example .env
npm ci

# 2. JWT keys (gitignored)
mkdir -p keys
openssl genrsa -out keys/jwt-private.pem 2048
openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem

# 3. Infrastructure + API (API published on host :8030)
docker compose -f docker/docker-compose.dev.yml up -d --build

# Or run API on the host instead of the container:
# npm run start:dev   → http://localhost:3000

# 4. If you only started infra earlier, still apply schema once from the host:
# npx prisma migrate deploy && npx prisma db seed

# Optional rich demo dataset (25 employees, 12 teachers, 30 students):
# SEED_DEMO=true npx prisma db seed

# Swagger (container): http://localhost:8030/api/docs
# Swagger (host npm):  http://localhost:3000/api/docs
```

Bootstrap admin (forced password change on first use):

- username: `superadmin` (or `BOOTSTRAP_ADMIN_USERNAME`)
- password: `ChangeMeNow1` (or `BOOTSTRAP_ADMIN_PASSWORD`)

## Phase 1 modules

| Prefix | Module |
|---|---|
| `/api/v1/hr/*` | Employees, attendance, leave, holidays |
| `/api/v1/school/*` | Academic years, students, admission fees, teachers, mappings, substitutes, attendance |

## Phase 2 modules

| Prefix | Module |
|---|---|
| `/api/v1/school/*` | IEP, progress reports, tuition fees, health/behavior, outdoor activities, student leave |
| `/api/v1/portal/*` | Parent-scoped reads/writes (JWT `scope.studentIds`) |

Rule traceability: `test/traceability/phase1.md`, `test/traceability/phase2.md`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | API with watch |
| `npm run test:unit` | Unit tests |
| `npm run test:integration` | Integration tests (needs Docker stack) |
| `npm run openapi:export` | Write `openapi/openapi.json` |
| `npm run prisma:seed` | Reference seed (roles, RBAC matrix, org, numbering) |

## Phase 0 scope

Auth (JWT RS256 + refresh cookies), RBAC, audit log, org settings, numbering, MinIO files, in-app notifications, Ledger/Notification ports, health, CI stages 1–4.

See [docs/plan/backend/01-phase0-foundation.md](docs/plan/backend/01-phase0-foundation.md).
