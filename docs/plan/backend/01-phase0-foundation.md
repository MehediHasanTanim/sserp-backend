# Backend Phase 0 — Foundation

| Field | Value |
|---|---|
| Duration | 3 weeks |
| Prerequisites | None — this is the first phase |
| Feature list coverage | 9.1 User Management, 9.2 Organization Configuration, 9.4 Audit Trail |
| TDD sections | 4.2, 5.3, 6.1, 6.6, 7.1–7.3, 8.1–8.4, 12.1, 13.2–13.4, 15 |

---

## 1. Objective and scope

Deliver a running, deployable, fully-tested NestJS application skeleton with authentication, authorization, auditing, error handling, and the CI pipeline. No business module ships in this phase. Every subsequent phase plugs into the primitives built here, so the quality bar is deliberately high: if `@Roles` is wrong or the audit interceptor misses a case, every later phase inherits the defect.

**In scope**

- Repository scaffold, TypeScript config, lint config, Docker Compose for all backing services
- Prisma bootstrap with the auth and admin schema
- Dual-token JWT authentication with account lockout
- RBAC: roles, permissions, guards, decorators
- Audit logging framework
- Global error handling, response envelope, request ID propagation, structured logging
- File service (MinIO presign/confirm/download) — built here because three later phases need it
- Notification and Ledger **ports** (interfaces + minimal implementations) so later phases never take a hard dependency on modules that do not yet exist
- Organization configuration and numbering schemes
- Health checks, Swagger, OpenAPI export
- CI pipeline stages 1–3

**Out of scope**

- Any school, therapy, HR, accounts, inventory, or procurement domain logic
- WebSocket gateway (Phase 8) — the `NotificationPort` in this phase writes only to the DB
- Real ledger posting (Phase 4)

---

## 2. Prerequisites

None. Starting state is an empty repository containing only `docs/` and `README.md`.

---

## 3. Prisma schema additions

### `prisma/schema/base.prisma`

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["prismaSchemaFolder", "postgresqlExtensions"]
}
```

Enable the `pgcrypto` extension for `gen_random_uuid()`.

### Tables

#### `users`

Per TDD 6.6. Columns: `id`, `username` (unique), `email` (unique, citext), `password_hash`, `employee_id` (nullable FK, added in Phase 1 — declared now as a nullable UUID without the constraint, constraint added in the Phase 1 migration), `guardian_id` (same treatment, Phase 2), `is_active`, `last_login_at`, `password_changed_at`, `must_change_password`, `failed_login_attempts`, `locked_until`, `two_factor_secret` (nullable, encrypted), `two_factor_enabled`, plus audit columns and `deleted_at`.

> Deliberate choice: `employee_id` and `guardian_id` start as plain nullable UUID columns and gain their foreign key constraints in later migrations. This avoids a circular schema dependency between `auth` and `hr`/`school` and keeps Phase 0 independently deployable.

#### `roles`

`id`, `name` (unique — the nine roles from TDD 8.3), `description`, `is_system` (system roles cannot be deleted).

#### `user_roles`

Join table supporting the feature-list requirement for **multi-role assignment to a single user** (9.1). Composite PK `(user_id, role_id)`. This intentionally differs from the TDD's `users.role_id` single-column design; the feature list requires many-to-many and the ADR recording this decision is `docs/adr/0001-multi-role-users.md`.

#### `role_permissions`

`role_id`, `module`, `action`. Composite PK `(role_id, module, action)`. `module` ∈ {school, therapy, hr, accounts, finance, inventory, procurement, reports, admin, portal}. `action` ∈ {read, create, update, delete, approve, export}.

#### `refresh_tokens`

`id`, `user_id`, `token_hash`, `family_id`, `issued_at`, `expires_at`, `revoked_at`, `replaced_by_id`, `user_agent`, `ip_address`. Redis holds the hot lookup; Postgres holds the durable record for the login-activity report and for detecting refresh-token reuse.

#### `login_activity`

`id`, `user_id` (nullable — failed logins for unknown usernames), `username_attempted`, `outcome` (`success` | `bad_credentials` | `locked` | `inactive`), `ip_address INET`, `user_agent`, `created_at`. Backs feature list 9.1 "login activity log".

#### `audit_logs`

Per TDD 6.6. `id`, `user_id`, `action`, `module`, `entity_name`, `entity_id`, `before_value JSONB`, `after_value JSONB`, `ip_address INET`, `request_id`, `created_at`. BRIN index on `created_at`, composite B-tree on `(entity_name, entity_id)`.

#### `organization_settings`

Single-row table (enforced by a `CHECK (id = '00000000-0000-0000-0000-000000000001')`). Columns: `name`, `logo_object_key`, `address`, `phone`, `email`, `registration_details JSONB`, `currency_code`, `currency_minor_units`, `timezone`, `session_idle_timeout_minutes`, `date_format`, `fiscal_year_start_month`.

#### `numbering_schemes`

`id`, `entity_type` (student, employee, patient, invoice, receipt, purchase_request, purchase_order, grn, journal_entry, voucher), `prefix`, `padding`, `current_sequence`, `reset_period` (`never` | `yearly` | `monthly`), `last_reset_at`. Backs feature list 9.2.

Sequence allocation uses `SELECT ... FOR UPDATE` inside the caller's transaction so codes are gap-free and collision-free under concurrency.

#### `attachments`

Generic file metadata table used by every module. `id`, `bucket`, `object_key` (unique), `original_filename`, `mime_type`, `size_bytes`, `checksum_sha256`, `entity_type`, `entity_id`, `uploaded_by`, `status` (`pending` | `confirmed` | `orphaned`), `created_at`. Polymorphic by design; `(entity_type, entity_id)` indexed.

#### `pending_ledger_postings` (outbox for Phase 4)

`id`, `reference_type`, `reference_id`, `amount`, `cost_center`, `description`, `debit_account_code`, `credit_account_code`, `posting_date`, `payload JSONB`, `status` (`pending` | `posted` | `failed`), `posted_journal_id` (nullable), `error_message`, `created_at`. Phases 1–3 write here; Phase 4 drains it.

#### `notifications`

`id`, `user_id`, `type`, `title`, `body`, `entity_type`, `entity_id`, `channels_requested TEXT[]`, `read_at`, `created_at`. Phase 0 writes in-app rows only; Phase 8 adds the delivery log and multi-channel dispatch.

#### `idempotency_keys`

`id`, `key`, `user_id`, `endpoint`, `request_hash`, `response_status`, `response_body JSONB`, `created_at`, `expires_at`. Unique on `(key, endpoint)`.

### Reference seed (`prisma/seed/reference.seed.ts`)

Idempotent upserts, run in every environment including production:

- The nine system roles from TDD 8.3.
- The complete `role_permissions` matrix transcribed from TDD 8.4. Each cell of that matrix expands into rows: `✓` → all six actions; `R` → `read`; `A` → `read` + `approve`; `—` → no rows.
- The single `organization_settings` row with safe defaults.
- Default numbering schemes for all ten entity types.
- One `super_admin` user whose password is read from `BOOTSTRAP_ADMIN_PASSWORD` and which is forced into `must_change_password = true`.

---

## 4. Module and file structure

```
src/
├── main.ts                        # bootstrap, global pipes/filters/interceptors, Swagger, versioning
├── worker.main.ts                 # BullMQ worker entrypoint (no HTTP listener)
├── app.module.ts
├── config/
│   ├── configuration.ts           # typed config factory
│   ├── validation.schema.ts       # Joi/Zod schema — app refuses to boot on invalid env
│   └── config.types.ts
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── controllers/auth.controller.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts            # login, logout, refresh, password change/reset
│   │   │   ├── token.service.ts           # sign/verify/rotate, RS256 key handling
│   │   │   ├── lockout.service.ts         # Redis-backed failed-attempt counter
│   │   │   └── password.service.ts        # bcrypt cost 12, policy enforcement
│   │   ├── strategies/jwt.strategy.ts
│   │   └── dto/
│   ├── admin/
│   │   ├── controllers/{user,role,organization,numbering,audit}.controller.ts
│   │   ├── services/{user,role,organization,numbering,audit-query}.service.ts
│   │   └── dto/
│   ├── files/
│   │   ├── controllers/files.controller.ts
│   │   └── services/{minio,attachment}.service.ts
│   └── health/health.controller.ts
└── shared/
    ├── prisma/
    │   ├── prisma.service.ts
    │   ├── extensions/{audit-columns,soft-delete}.extension.ts
    │   └── transaction.helper.ts
    ├── guards/{jwt-auth,roles,permissions}.guard.ts
    ├── decorators/{current-user,roles,permissions,public,audit,idempotent}.decorator.ts
    ├── interceptors/{envelope,audit,logging,timeout}.interceptor.ts
    ├── filters/global-exception.filter.ts
    ├── middleware/request-id.middleware.ts
    ├── errors/{error-codes.ts,domain-exception.ts}
    ├── events/{event-names.ts,transactional-event-publisher.ts}
    ├── ports/{ledger.port.ts,notification.port.ts}
    ├── cache/{redis.module.ts,cache.service.ts,cache-keys.ts}
    ├── money/money.ts
    ├── datetime/{org-clock.service.ts,date.helpers.ts}
    ├── logger/{winston.config.ts,sensitive-fields.serializer.ts}
    └── testing/{factories/,container.harness.ts,auth.helper.ts}
```

---

## 5. API endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | Public, throttled 5/min | Username or email + password → access token + refresh cookie |
| POST | `/auth/refresh` | Refresh cookie | Rotate refresh token, issue new access token |
| POST | `/auth/logout` | Bearer | Revoke current refresh token family |
| POST | `/auth/logout-all` | Bearer | Revoke every refresh token for the user |
| GET | `/auth/me` | Bearer | Current user, roles, flattened permission list |
| POST | `/auth/change-password` | Bearer | Current + new password |
| POST | `/auth/forgot-password` | Public, throttled 3/min | Always returns 204 regardless of account existence |
| POST | `/auth/reset-password` | Public, token in body | Consume single-use reset token |

### User and role administration

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/admin/users` | super_admin | Paginated, filter by role, active state, linked employee |
| POST | `/admin/users` | super_admin | Create user, assign roles, optionally link employee/guardian |
| GET | `/admin/users/:id` | super_admin | Detail with roles and last login |
| PATCH | `/admin/users/:id` | super_admin | Update profile, roles, active state |
| POST | `/admin/users/:id/deactivate` | super_admin | Deactivate and revoke all refresh tokens |
| POST | `/admin/users/:id/reset-password` | super_admin | Admin-forced reset, sets `must_change_password` |
| POST | `/admin/users/:id/unlock` | super_admin | Clear lockout |
| GET | `/admin/roles` | super_admin | List roles with permission counts |
| GET | `/admin/roles/:id/permissions` | super_admin | Full permission matrix for a role |
| PUT | `/admin/roles/:id/permissions` | super_admin | Replace permission set |
| GET | `/admin/login-activity` | super_admin | Filterable login log |

### Organization configuration

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/admin/organization` | authenticated | Public-safe subset for all users (name, logo, timezone, currency) |
| PATCH | `/admin/organization` | super_admin | Update org profile and system settings |
| GET | `/admin/numbering-schemes` | super_admin | List schemes |
| PATCH | `/admin/numbering-schemes/:entityType` | super_admin | Update prefix/padding/reset policy |

### Audit

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/admin/audit-logs` | super_admin | Filter by user, module, entity, action, date range |
| GET | `/admin/audit-logs/:entityType/:entityId` | super_admin, principal | Full change history for one record |

### Files

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| POST | `/files/presign-upload` | authenticated | Validate bucket + mime + size, return presigned PUT URL (15 min TTL) |
| POST | `/files/confirm` | authenticated | Verify object exists in MinIO, persist `attachments` row |
| GET | `/files/:attachmentId/download-url` | authenticated + scope check | Presigned GET URL (15 min TTL) |
| DELETE | `/files/:attachmentId` | owner or super_admin | Soft-remove metadata, schedule object deletion |

### Notifications (in-app only in this phase)

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/notifications` | authenticated | Own notifications, paginated, unread filter |
| GET | `/notifications/unread-count` | authenticated | Badge count |
| POST | `/notifications/:id/read` | authenticated | Mark read |
| POST | `/notifications/read-all` | authenticated | Mark all read |

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health/live` | Process liveness — no dependency checks |
| GET | `/health/ready` | Postgres, Redis, MinIO reachability |

---

## 6. Business rules and invariants

| # | Rule | Enforcement | Error |
|---|---|---|---|
| F-01 | Access token is RS256-signed, 15-minute TTL, contains `sub`, `roles[]`, `permissions[]`, `scope` (for portal users), `jti` | `TokenService` | — |
| F-02 | Refresh token is an opaque UUID; only its SHA-256 hash is stored (Redis + Postgres). TTL 7 days. Delivered as `HttpOnly; Secure; SameSite=Strict` cookie | `TokenService` | — |
| F-03 | Refresh rotation: using a refresh token invalidates it and issues a new one in the same family. Reuse of a consumed token revokes the entire family and logs a security event | `AuthService.refresh` | `UNAUTHENTICATED` 401 |
| F-04 | 5 consecutive failed logins lock the account for 15 minutes. Counter in Redis with TTL, reset on success | `LockoutService` | `ACCOUNT_LOCKED` 423 |
| F-05 | Login response never distinguishes "user not found" from "wrong password" | `AuthService` | `INVALID_CREDENTIALS` 401 |
| F-06 | Passwords: minimum 10 characters, at least one uppercase, one lowercase, one digit; bcrypt cost factor 12; cannot reuse the last 3 hashes | `PasswordService` | `WEAK_PASSWORD` 422 |
| F-07 | `must_change_password = true` blocks every endpoint except `/auth/me`, `/auth/change-password`, `/auth/logout` | `JwtAuthGuard` | `PASSWORD_CHANGE_REQUIRED` 403 |
| F-08 | Deactivating a user immediately revokes all refresh tokens and blacklists live access tokens by `jti` in Redis until natural expiry | `UserService.deactivate` | — |
| F-09 | A user must hold at least one role | DB check + service validation | `VALIDATION_ERROR` 400 |
| F-10 | System roles (`is_system = true`) cannot be renamed or deleted; their permissions can be edited only by `super_admin` | `RoleService` | `FORBIDDEN` 403 |
| F-11 | Every non-GET request that succeeds produces exactly one `audit_logs` row | `AuditInterceptor` | — |
| F-12 | `audit_logs` is append-only. The application DB role has no `UPDATE`/`DELETE` grant on it | Migration `GRANT` statements | — |
| F-13 | Number generation is gap-free and unique under concurrency, honouring the configured reset period | `NumberingService` with `FOR UPDATE` | — |
| F-14 | Presigned upload URLs are bucket-, mime-, and size-constrained per bucket policy. Max 20 MB default, 50 MB for `hr-documents` | `MinioService.presignUpload` | `FILE_TOO_LARGE` 413 / `UNSUPPORTED_MEDIA_TYPE` 415 |
| F-15 | An `attachments` row stays `pending` until confirmed. A nightly job marks unconfirmed rows older than 24h as `orphaned` and deletes the MinIO object | `AttachmentCleanupJob` | — |
| F-16 | Every request carries a `requestId` (from `X-Request-Id` header or generated). It appears in every log line and in error responses | `RequestIdMiddleware` + winston | — |
| F-17 | Sensitive fields (`password`, `passwordHash`, `token`, `refreshToken`, `twoFactorSecret`, `authorization`) are stripped from all log output | `sensitive-fields.serializer.ts` | — |
| F-18 | Idempotent POST endpoints replay the stored response for a repeated `Idempotency-Key` within 24h instead of re-executing | `IdempotencyInterceptor` | — |

---

## 7. Domain events

**Emitted**

| Event | Payload | Purpose |
|---|---|---|
| `auth.login.succeeded` | `{ userId, ip, userAgent }` | Login activity log |
| `auth.login.failed` | `{ usernameAttempted, ip, reason }` | Login activity log, lockout metrics |
| `auth.token.reuse_detected` | `{ userId, familyId, ip }` | Security alert (surfaced in Phase 8) |
| `user.deactivated` | `{ userId, byUserId }` | Token revocation, audit |

**Consumed** — none.

### Ports introduced

```typescript
// shared/ports/ledger.port.ts
export abstract class LedgerPort {
  abstract post(request: PostingRequest): Promise<PostingResult>;
}
// Phase 0 implementation: OutboxLedgerAdapter — inserts into pending_ledger_postings
// within the caller's transaction and returns { deferred: true }.
// Phase 4 replaces the provider binding with AccountsLedgerAdapter.
```

```typescript
// shared/ports/notification.port.ts
export abstract class NotificationPort {
  abstract notify(input: NotifyInput): Promise<void>;
}
// Phase 0 implementation: InAppOnlyNotificationAdapter — writes notifications rows.
// Phase 8 replaces it with MultiChannelNotificationAdapter (in-app + WS + email + SMS).
```

Both are bound in `AppModule` via `{ provide: LedgerPort, useClass: OutboxLedgerAdapter }`. Later phases change one line each.

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `attachment-cleanup` | Daily 03:30 | Mark stale `pending` attachments `orphaned`, delete MinIO objects |
| `refresh-token-prune` | Daily 04:00 | Delete `refresh_tokens` rows expired more than 30 days ago |
| `idempotency-prune` | Hourly | Delete expired `idempotency_keys` |

BullMQ queues registered in this phase: `maintenance`. Later phases add `email`, `sms`, `reports`, `pdf`.

---

## 9. Configuration and secrets

`.env.example` entries introduced:

| Variable | Example | Notes |
|---|---|---|
| `NODE_ENV` | `development` | |
| `PORT` | `3000` | |
| `API_PREFIX` | `api` | |
| `DATABASE_URL` | `postgresql://sserp:pass@localhost:5432/sserp` | |
| `REDIS_URL` | `redis://localhost:6379` | |
| `JWT_PRIVATE_KEY_PATH` | `./keys/jwt-private.pem` | RS256 private key, never committed |
| `JWT_PUBLIC_KEY_PATH` | `./keys/jwt-public.pem` | |
| `JWT_ACCESS_TTL` | `15m` | |
| `JWT_REFRESH_TTL` | `7d` | |
| `BCRYPT_COST` | `12` | |
| `LOCKOUT_MAX_ATTEMPTS` | `5` | |
| `LOCKOUT_DURATION_MINUTES` | `15` | |
| `MINIO_ENDPOINT` | `localhost` | |
| `MINIO_PORT` | `9000` | |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | | |
| `MINIO_USE_SSL` | `false` | |
| `PRESIGN_TTL_SECONDS` | `900` | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | | MailHog locally |
| `SMS_PROVIDER` | `console` | `console` \| `ssl_wireless` |
| `CORS_ORIGINS` | `http://localhost:3001` | Comma-separated |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | | Seed only |
| `SENTRY_DSN` | | Optional in dev |
| `LOG_LEVEL` | `debug` | |

A Zod schema in `config/validation.schema.ts` validates all of these at boot. Missing or malformed values abort startup with a readable message.

### MinIO buckets created by an init script

`student-documents`, `iep-documents`, `progress-reports`, `therapy-attachments`, `hr-documents`, `invoices-receipts`, `activity-media`, `leave-documents`, `exports`. Retention/lifecycle policies per TDD 11.2 applied at creation; `exports` gets a 24-hour expiry lifecycle rule.

---

## 10. Tests owed by this phase

Standards and tooling setup live in [11-test-automation.md](11-test-automation.md); this phase is where that tooling is installed and proven.

### Tooling setup deliverables

- Jest configured with two projects (`unit`, `integration`), `ts-jest`, coverage via Istanbul, thresholds wired.
- `jest-mock-extended` helper `createServiceMock<T>()` in `shared/testing`.
- `fishery` + `@faker-js/faker` factory base in `shared/testing/factories/`.
- Testcontainers harness `shared/testing/container.harness.ts` exposing `startTestApp()` / `stopTestApp()` that boots Postgres 16 + Redis 7 + MinIO, runs `prisma migrate deploy`, seeds reference data, and returns an initialised `INestApplication`.
- `shared/testing/auth.helper.ts` issuing valid tokens for each of the nine roles without going through `/auth/login`.
- Stryker config committed and passing on the Phase 0 service layer.
- k6 project skeleton with a shared `getAuthToken()` helper.

### Unit tests

| Target | Scenarios |
|---|---|
| `TokenService` | Access token claims correct; expired token rejected; refresh hash matches; rotation issues a new family member; tampered signature rejected |
| `AuthService` | Successful login; unknown user and wrong password produce identical error; inactive user rejected; locked user rejected; refresh reuse revokes family; logout revokes token |
| `LockoutService` | Counter increments; locks at exactly 5; TTL set; success resets counter; unlock clears state |
| `PasswordService` | Each policy rule rejected individually; valid password accepted; history of 3 enforced; bcrypt cost is 12 |
| `PermissionsGuard` | Grants on exact match; denies on missing permission; multi-role union of permissions; `@Public()` bypass |
| `RolesGuard` | Single role match; any-of-many match; denial path |
| `NumberingService` | Prefix and padding applied; sequence increments; yearly reset at boundary; concurrent allocation produces no duplicates (uses a real transaction in an integration test too) |
| `AuditInterceptor` | Writes a row on POST/PATCH/DELETE; skips GET; captures before/after; skips on thrown exception |
| `GlobalExceptionFilter` | Maps each `DomainException` subclass to the right status and error code; unknown errors become 500 with a generic message and are logged |
| `EnvelopeInterceptor` | Wraps object and array payloads; passes through already-enveloped responses; leaves 204 alone |
| `MinioService` | Presign URL TTL; mime allow-list rejection; size limit rejection; bucket allow-list |
| `Money` | Addition, subtraction, allocation without rounding loss, formatting |
| `OrgClockService` | UTC storage, org-timezone rendering, DST boundary correctness |

Target: ≥ 80% line and branch on `src/modules/**/services` and `src/shared/**`.

### Integration tests (Supertest + Testcontainers)

| Suite | Assertions |
|---|---|
| `auth.integration.spec.ts` | Full login → access protected route → refresh → logout cycle; refresh cookie flags (`HttpOnly`, `Secure`, `SameSite=Strict`) present; 5 failed attempts → 423 and Redis key set; token reuse → family revoked in Postgres; password change invalidates old sessions |
| `rbac.integration.spec.ts` | For each of the nine roles, hit a representative endpoint of every module and assert the result matches the TDD 8.4 matrix cell. This suite is **table-driven from a transcription of the matrix**, so future permission drift fails immediately |
| `users.integration.spec.ts` | Create → assign multiple roles → `/auth/me` returns the union of permissions; deactivate → existing access token rejected on next call |
| `audit.integration.spec.ts` | Create/update/delete a user and assert three `audit_logs` rows with correct before/after JSONB; attempt to modify an audit row via the DB app role and assert the grant denies it |
| `files.integration.spec.ts` | Presign → PUT to MinIO container → confirm → download URL resolves; confirm without a real object returns 422; oversized file rejected |
| `numbering.integration.spec.ts` | 50 parallel allocations produce 50 distinct gap-free codes |
| `envelope-and-errors.integration.spec.ts` | Every documented status code reachable; `requestId` echoed |
| `health.integration.spec.ts` | `/health/ready` returns 503 when Redis container is paused |

Endpoint coverage: 100% of the routes in section 5.

### Security tests

- Semgrep rule `no-unguarded-controller` written and passing.
- ZAP baseline scan configured in CI against the Docker Compose test stack; `.zap/rules.tsv` seeded with accepted findings.
- Snyk and `npm audit` wired as blocking gates.
- Explicit integration assertions for security headers: HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.

### Performance tests

- `k6/scripts/login-spike.js` — 0 → 100 VU in 30 s, error rate < 2%, per TDD 18.8.3.

### Mutation testing

Stryker runs against `src/modules/auth/services/**` and `src/shared/**`. Score must be ≥ 75%.

---

## 11. Exit criteria

In addition to the global Definition of Done in [00-overview.md](00-overview.md):

- [ ] `docker compose up` on a clean machine produces a working API, reachable Swagger UI at `/api/docs`, and a passing `/health/ready`.
- [ ] The RBAC matrix integration test covers all 21 module rows × 9 roles from TDD 8.4 and passes.
- [ ] A deliberate unguarded controller method causes CI to fail (verified once, then reverted).
- [ ] The audit table cannot be mutated through the application DB role — proven by test.
- [ ] `openapi/openapi.json` committed and the staleness check passes.
- [ ] CI stages 1, 2, 3, and 4 (lint/SAST, unit, integration, dependency scan) are green and complete in under 12 minutes.
- [ ] A `super_admin` bootstrapped by seed can log in, is forced to change password, and can create a second user.
- [ ] `LedgerPort` and `NotificationPort` are bound and exercised by at least one test each, proving later phases can depend on them safely.
