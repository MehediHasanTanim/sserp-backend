# Backend Phase 9 — Security Hardening, Performance, UAT & Go-Live

| Field | Value |
|---|---|
| Duration | 3 weeks |
| Prerequisites | Phases 0–8 merged |
| Feature list coverage | 9.5 Data Backup & Security; completion of all cross-cutting non-functional requirements |
| TDD sections | 3.1 Constraints, 12.1–12.3 Security, 13.1–13.5 Deployment, 14.1–14.3 Performance, 15 Logging, 16 NFRs |

---

## 1. Objective and scope

Turn a feature-complete system into a production system. This phase adds no business features. It closes the security controls that were deferred because they are cross-cutting, proves the non-functional requirements from TDD section 16 with measurements rather than assertions, and executes the go-live runbook.

**In scope**

- Row-Level Security policies on sensitive tables
- Application-layer field encryption for medical and financial fields
- Backup, restore, and point-in-time recovery, proven by an actual restore drill
- Production Docker Compose, Nginx, TLS, firewall, container hardening
- Prometheus metrics, Grafana dashboards, Sentry integration, alerting
- Performance tuning against the measured k6 results; NFR verification
- Full OWASP ZAP active scan remediation and penetration-test preparation
- Offline resilience for attendance marking and session notes
- Data migration tooling
- Optional integrations: biometric attendance device, online payment gateway
- UAT support, defect triage, go-live cutover, hyper-care

**Out of scope**

- New business functionality of any kind. Anything discovered during UAT that is a genuine new requirement goes to a post-launch backlog, not this phase.

---

## 2. Prerequisites

All phases 0–8 merged with their exit criteria met. The k6 suite must have been run at least once against staging so this phase has real numbers to tune against.

---

## 3. Schema and database changes

### Row-Level Security

Per TDD 12.2, applied to three tables. Implementation approach: the application connects as a non-superuser role, and every request sets session variables inside the transaction.

```sql
-- Session context set by PrismaService per request
SET LOCAL app.current_user_id = '<uuid>';
SET LOCAL app.current_roles = 'coordinator,teacher';
SET LOCAL app.scoped_student_ids = '<uuid>,<uuid>';
```

| Table | Policy |
|---|---|
| `student_medical_records` | Readable by `super_admin`, `principal`, `coordinator`; by a `teacher` only for students in their active mappings or current substitute assignments; by a `parent` only for their scoped students. Writable by `coordinator` and `super_admin`. |
| `session_notes` | Readable and writable by the authoring therapist; readable by the supervising therapist and `coordinator`; readable by `super_admin`. Never readable by `parent`, `accountant`, `hr_officer`, or `teacher`. |
| `payroll_slips` | Readable by `hr_officer`, `accountant`, `super_admin`, and by the owning employee's own user. Never by any other role. |

Two additional tables are added to the RLS set beyond the TDD list, because the same reasoning applies: `patient_medical_history` and `gratuity_payments`. Documented in `docs/adr/0005-rls-scope-extension.md`.

RLS is a defence-in-depth layer. The service-layer scope policies from earlier phases remain and are still the primary control; RLS catches a missed filter rather than replacing the filters.

### Field-level encryption

New table:

#### `encryption_keys`
`id`, `key_version`, `purpose` (`medical`|`financial`), `algorithm` (`aes-256-gcm`), `wrapped_key`, `activated_at`, `retired_at`, `is_current`. The master key lives in the environment; data keys are wrapped by it, enabling rotation without re-encrypting under a new master.

Encrypted columns (converted by migration, with a backfill script):

| Table | Columns |
|---|---|
| `student_medical_records` | `conditions`, `allergies`, `medications`, `emergency_protocol` |
| `patient_medical_history` | `existing_conditions`, `medications`, `allergies`, `past_therapy_history` |
| `session_notes` | `narrative`, `observations` |
| `students` | `disability_category`, `severity_level` |
| `employees` | `national_id`, `basic_salary` |
| `vendors` | `bank_details` |
| `shareholders` | `bank_details`, `tax_identifier` |

Implementation is a Prisma client extension that transparently encrypts on write and decrypts on read, storing `{ v: keyVersion, iv, tag, ct }` as a JSONB or text envelope. The extension records which columns are encrypted in a single registry so nothing is missed.

**Trade-off documented in `docs/adr/0006-field-encryption-scope.md`:** encrypted columns cannot be filtered or sorted in SQL. `students.disability_category` is used as a report filter, so a **blind index** column (`disability_category_hash`, HMAC-SHA256 with a separate index key) is added alongside it to support equality filtering without decryption. `employees.basic_salary` is used in aggregate reports, so payroll and gratuity reports read from `payroll_slips` and `gratuity_provisions` (which store computed integers unencrypted) rather than aggregating the encrypted column.

### Other changes

#### `data_migration_runs`
`id`, `migration_name`, `source_description`, `status`, `records_read`, `records_written`, `records_skipped`, `records_failed`, `error_report_object_key`, `started_at`, `completed_at`, `run_by`.

#### `offline_sync_queue`
Server-side ledger of client-submitted offline batches, for idempotency and conflict reporting. `id`, `client_batch_id` (unique), `user_id`, `entity_type` (`student_attendance`|`session_note`|`group_attendance`), `payload JSONB`, `client_timestamp`, `received_at`, `status` (`accepted`|`partially_accepted`|`conflicted`|`rejected`), `conflict_report JSONB`.

#### `system_health_snapshots`
`id`, `captured_at`, `db_size_bytes`, `active_connections`, `redis_memory_bytes`, `minio_usage_bytes`, `queue_depths JSONB`, `slow_query_count`. Feeds capacity planning.

---

## 4. Work items

### 4.1 Security hardening

| Item | Detail |
|---|---|
| RLS enablement | Migration enabling RLS and creating the policies; `PrismaService` sets session variables per request; a dedicated `app_readwrite` DB role without `BYPASSRLS` |
| Field encryption | Prisma extension, key management, backfill migration for existing rows, blind index for `disability_category` |
| Secrets audit | Confirm no secret in the repository history; rotate every credential before go-live; document the rotation procedure |
| Rate limiting | Nginx `limit_req` zones per route class; NestJS `ThrottlerModule` at 5 req/min on auth routes and 100 req/min globally per user |
| Security headers | Finalise the CSP with the frontend's actual asset origins; enable HSTS with `includeSubDomains` and a 1-year max-age after verifying TLS; `Referrer-Policy: strict-origin-when-cross-origin` |
| CSRF | Double-submit cookie on state-changing requests, complementing `SameSite=Strict` on the refresh cookie |
| Container hardening | Non-root user in every image; read-only root filesystem where possible; dropped Linux capabilities; no `latest` tags; pinned digests |
| Network isolation | Only 80/443 exposed; Postgres, Redis, MinIO on an internal Docker network with no published ports |
| SSH and host | Key-only SSH, `fail2ban`, unattended security upgrades, `ufw` default-deny |
| Audit log integrity | Append-only grant verified; a nightly job computes a rolling hash chain over new audit rows and stores checkpoints, giving tamper evidence per TDD 9.4 |
| Session timeout | Server-side idle enforcement in addition to the client-side timer: a `last_activity_at` in Redis, and requests after the configured idle period are rejected with `SESSION_IDLE_TIMEOUT` |
| IP allow/deny list | Optional middleware reading from `organization_settings`, applied to `super_admin` routes only by default |
| 2FA | Complete the TOTP flow deferred from Phase 0: enrolment, QR provisioning, verification, recovery codes, enforcement per role |

### 4.2 Backup and recovery

| Item | Detail |
|---|---|
| Daily logical backup | `pg_dump` at 02:00, GPG-encrypted, 30 days local and 90 days off-site (Backblaze B2 or equivalent) |
| WAL archiving | Continuous archiving with 7-day retention enabling point-in-time recovery, meeting the < 6 hour RPO |
| MinIO sync | Daily 03:00 encrypted off-site bucket sync, 60-day retention |
| Redis snapshot | RDB every 6 hours, local only |
| Config backup | GPG-encrypted git repository for `.env` and compose files |
| Restore drill | **A full restore onto a clean host, timed and documented.** Must complete within the 4-hour RTO. The drill report is a deliverable: `docs/runbooks/restore-drill-report.md` |
| PITR drill | Restore to a timestamp 30 minutes before a deliberately introduced bad data change, verifying WAL replay |
| Backup verification job | Nightly automated `pg_restore --list` on the latest dump to prove it is readable; alerts on failure. An unverified backup is not a backup. |
| Admin restore endpoint | `POST /admin/backups/trigger` and `GET /admin/backups` for visibility; restore itself remains a documented operator procedure, not an API |

### 4.3 Observability

| Item | Detail |
|---|---|
| Prometheus metrics | HTTP request duration histogram by route and status; queue depth and job duration by queue; DB pool utilisation; cache hit ratio; event bus throughput; business counters (students enrolled, sessions completed, invoices issued, notifications sent) |
| Grafana dashboards | API latency and error rate; queue health; database health; business KPI overview; k6 historical trend |
| Alert rules | p95 latency above threshold for 5 minutes; error rate above 1%; queue depth above 1,000; failed job rate above 5%; disk above 80%; backup verification failure; ledger integrity breach; certificate expiry within 14 days |
| Sentry | Backend and worker integration with release tagging, source maps, user context, and sensitive-data scrubbing |
| Structured logging review | Confirm every log line is JSON with `requestId`, `userId`, `module`; confirm the sensitive-field serialiser covers every field added since Phase 0 |
| Slow query logging | `log_min_duration_statement = 500ms`, surfaced as a WARN and counted as a metric |
| Health endpoints | Extend `/health/ready` to include queue connectivity and MinIO; add `/health/detail` for `super_admin` with component-level diagnostics |

### 4.4 Performance tuning

Driven by measured k6 results rather than guesswork. The process: run the full k6 suite against staging, identify every threshold breach, fix, re-run, and record before/after numbers in `docs/reports/phase9-performance.md`.

| Area | Actions |
|---|---|
| Query tuning | `EXPLAIN ANALYZE` every query on the slow-query list; add or reshape indexes; eliminate remaining N+1 patterns |
| Connection pooling | Size the Prisma pool against the container count and Postgres `max_connections`; add PgBouncer if the pool proves insufficient |
| Caching | Verify every cache entry in TDD 14.1 is implemented with the specified TTL and a working invalidation trigger; measure hit ratios and adjust |
| Payload size | Cursor pagination limits enforced; field selection on heavy list endpoints; gzip/brotli at Nginx |
| Calendar endpoint | The month-view therapy query is the tightest budget in the system at 1 second for 200 sessions. Tune with a covering index and, if needed, a narrower projection returning only calendar-render fields with detail fetched on click |
| Worker throughput | Tune BullMQ concurrency per queue; separate the PDF queue onto its own worker since Puppeteer is memory-heavy |
| Postgres configuration | `shared_buffers`, `work_mem`, `effective_cache_size`, `random_page_cost` tuned for the 8–16 GB target host |

### 4.5 Offline resilience

TDD design principle: "Core operations (attendance marking, session notes) must function with degraded connectivity and sync when reconnected." The backend contract for this:

| Item | Detail |
|---|---|
| Batch submit endpoints | `POST /school/attendance/offline-batch`, `POST /therapy/sessions/offline-batch`, `POST /therapy/groups/offline-batch` accepting an array of operations with a `clientBatchId` and per-operation `clientTimestamp` |
| Idempotency | `clientBatchId` unique; a replayed batch returns the original result |
| Conflict resolution | Last-write-wins by server receipt order, **except** that a server-side value written by a different user after the client's `clientTimestamp` is reported as a conflict and not overwritten. The response returns a per-operation outcome so the client can surface conflicts |
| Freeze interaction | An offline batch for a now-frozen date is rejected per operation with `ATTENDANCE_FROZEN`, not silently dropped |
| Audit | Offline-originated writes are audited with `source: 'offline_sync'` and the client timestamp preserved |

### 4.6 Data migration

| Item | Detail |
|---|---|
| Import framework | CSV/Excel importers for students, guardians, employees, patients, items, vendors, and opening balances, with a dry-run mode producing a validation report before any write |
| Validation | Per-row validation against the same DTOs the API uses, so imported data cannot bypass business rules |
| Error reporting | A downloadable error report keyed by source row number |
| Opening balances | Trial-balance import with a mandatory DR=CR check before commit |
| Reconciliation | Post-import reconciliation report comparing source counts and totals to system counts and totals; committed as a go-live artefact |

### 4.7 Optional integrations

Both are marked optional in the TDD. They are built behind feature flags and are not go-live blockers.

| Integration | Approach |
|---|---|
| Biometric attendance | A `BiometricAdapter` interface with a polling implementation reading the device's log over TCP, mapping device user IDs to employees, and writing `hr_attendance` rows with `source = 'biometric'`. Conflicts with manual entries favour the biometric record and log the override. |
| Online payment gateway | A `PaymentGatewayPort` with an SSLCommerz or Stripe implementation. Portal-initiated payment creates a pending intent, and only the verified server-side webhook (signature-checked, idempotent by gateway transaction id) records the `fee_payments` row and posts the ledger entry. A client-side success callback never records a payment. |

### 4.8 UAT and go-live

| Item | Detail |
|---|---|
| UAT environment | A production-like environment with realistic anonymised data volumes (500 students, 100 employees, 12 months of history) generated by a volume seed script |
| UAT defect triage | Severity classification, a daily triage meeting, and a fix-verify loop with an automated regression test written for every accepted defect before it is closed |
| Training support | API documentation published; the Swagger UI available to trainers; a seeded training environment reset daily |
| Go-live checklist | `docs/runbooks/go-live-checklist.md` — all secrets rotated; statutory tax slabs replaced with real values; chart of accounts confirmed by the accountant; numbering schemes agreed; gratuity policy confirmed against local labour law; SMS sender ID approved; DNS and TLS verified; backups running and verified; monitoring alerting to a real channel; rollback procedure rehearsed |
| Cutover | Maintenance window per TDD 13.1 (Sunday 01:00–03:00); final data import; smoke test script; feature flags set; announcement published |
| Hyper-care | Two weeks of daily log and metric review, a documented escalation path, and a hotfix branch procedure |

---

## 5. Business rules and invariants introduced

| # | Rule | Error |
|---|---|---|
| H-01 | The application database role has no `BYPASSRLS`. A migration test asserts this. | — |
| H-02 | Every request sets the RLS session context inside its transaction. A request that reaches an RLS-protected table without context reads zero rows rather than all rows — fail-closed, asserted by test. | — |
| H-03 | Encrypted fields are never logged, never returned in list projections by default, and never present in any export unless the caller holds the specific permission. | `FORBIDDEN` 403 |
| H-04 | Key rotation re-wraps data keys without re-encrypting row data; decryption selects the key by the envelope's `v`. A row encrypted under a retired key remains readable. | — |
| H-05 | Server-side idle timeout rejects requests after the configured idle period even if the access token is still cryptographically valid. | `SESSION_IDLE_TIMEOUT` 401 |
| H-06 | The audit hash chain checkpoint must verify. A mismatch raises a critical alert. | — |
| H-07 | Offline batches are idempotent by `clientBatchId` and never silently overwrite a newer server-side value by a different user. | — |
| H-08 | A payment is recorded only from a signature-verified gateway webhook, and only once per gateway transaction id. | — |
| H-09 | Data import never bypasses DTO validation or business rules. | `VALIDATION_ERROR` 400 |
| H-10 | An opening-balance import with unbalanced debits and credits is rejected before any write. | `JOURNAL_UNBALANCED` 422 |

---

## 6. Tests owed by this phase

### Security tests

| Suite | Assertions |
|---|---|
| `rls.integration.spec.ts` | For each of the five RLS tables and each of the nine roles, assert the visible row set matches the policy. Includes the fail-closed case: no session context set → zero rows. |
| `rls-bypass-attempt.integration.spec.ts` | A raw Prisma query as the application role cannot read another teacher's student medical record, another therapist's session notes, or another employee's payslip, even with the service-layer filter deliberately removed |
| `encryption.integration.spec.ts` | Write a medical record, read the raw column via a direct SQL query and assert it is not plaintext; read via the API and assert correct decryption; rotate the key and assert the old row still decrypts |
| `blind-index.integration.spec.ts` | Filtering students by disability category returns correct results without decrypting, and the hash is not reversible to the plaintext by inspection |
| `zap-active.ci` | Full OWASP ZAP active scan against staging with zero unremediated medium or high findings. Every accepted finding has a written justification in `.zap/rules.tsv` |
| `secrets-scan.ci` | `gitleaks` over the full history with zero findings |
| `dependency.ci` | Snyk and `npm audit` with zero high or critical CVEs; Trivy on all images |
| `semgrep.ci` | All custom rules pass: no unguarded controller, no raw SQL interpolation, no account code literals outside Accounts, no cross-module Prisma access, no writes in Reports |
| `authz-matrix.integration.spec.ts` | The full TDD 8.4 matrix re-verified across every endpoint that now exists — the exhaustive version of the Phase 0 test, generated from the OpenAPI document so no route can escape it |
| `session-timeout.integration.spec.ts` | A request after the idle period is rejected; activity within the period refreshes the window |
| `2fa.integration.spec.ts` | Enrolment, verification, login with TOTP, recovery code single-use, replay of a used TOTP rejected |
| `audit-chain.integration.spec.ts` | Chain verification passes; a manually tampered row (inserted via superuser) causes verification to fail |

### Reliability tests

| Suite | Assertions |
|---|---|
| `restore-drill` (manual, documented) | Full restore onto a clean host within the 4-hour RTO; a report with actual timings is committed |
| `pitr-drill` (manual, documented) | Point-in-time recovery to a target timestamp; data loss window measured under 6 hours |
| `backup-verification.integration.spec.ts` | The nightly verification job detects a deliberately corrupted dump |
| `offline-sync.integration.spec.ts` | Replay of the same batch is idempotent; a conflicting server value by another user is reported not overwritten; a frozen date is rejected per operation; audit records `source: 'offline_sync'` |
| `graceful-shutdown.integration.spec.ts` | SIGTERM drains in-flight HTTP requests and lets running Bull jobs complete before exit |
| `dependency-outage.integration.spec.ts` | With Redis stopped: `/health/ready` reports unhealthy, reads still work where they do not require cache, and writes fail with a clear error rather than hanging. With MinIO stopped: file operations fail cleanly and other endpoints are unaffected. |

### Performance tests — NFR verification

Every row of TDD section 16 is verified by a measurement, and the results are committed:

| NFR | Verification |
|---|---|
| p95 < 300 ms reads | k6 across all read endpoints |
| p95 < 600 ms writes | k6 across all write endpoints |
| Calendar month view < 1 s with 200 sessions | `therapy-calendar-load.js` |
| Standard reports < 3 s | k6 over all `estimated_cost = light` reports |
| 50 concurrent users sustained 10 min, no degradation | Full-system load test |
| 150 concurrent users stress 5 min, p95 < 800 ms | Stress test |
| Spike 0 → 100 in 30 s, error rate < 2% | `login-spike.js` and a full-system spike |
| 500 active students without schema change | Volume seed to 500 students plus 12 months of history, then re-run the full k6 suite |
| Error rate < 0.5% | Asserted as a k6 threshold on every script |

### Accessibility and E2E

The Playwright suite lives in the frontend repository, but this phase is where the full suite runs against a production-like backend with the volume dataset. The backend's obligation is that all ~44 E2E scenarios pass and no endpoint returns a 5xx under the E2E run.

### Final quality gates

- [ ] Backend service-layer coverage ≥ 80%, overall ≥ 70%.
- [ ] 100% of endpoints in the OpenAPI document hit by an integration test — verified by a coverage script comparing the document to the test-run route log.
- [ ] Stryker mutation score ≥ 75% across the whole service layer, not only per phase.
- [ ] Zero flaky tests: the full suite runs 10 consecutive times in CI with identical results.
- [ ] CI feedback loop within budget: stages 1–2 under 4 minutes, full PR gate under 12 minutes.

---

## 7. Exit criteria

- [ ] RLS enabled and verified fail-closed on all five protected tables.
- [ ] Field encryption live, with a completed backfill, working rotation, and the blind index in place.
- [ ] ZAP active scan clean; every accepted finding justified in writing.
- [ ] Zero high or critical CVEs in dependencies and images.
- [ ] Restore drill and PITR drill completed, timed, and documented within RTO and RPO.
- [ ] Backup verification job running and proven to detect corruption.
- [ ] Prometheus, Grafana, Sentry live with alerts routed to a real channel and at least one alert tested end to end.
- [ ] Every NFR in TDD section 16 verified by a committed measurement in `docs/reports/phase9-performance.md`.
- [ ] Offline batch endpoints implemented with idempotency and conflict reporting.
- [ ] Data import framework complete with a dry-run mode and a reconciliation report.
- [ ] Go-live checklist fully signed off, including the two items most likely to be forgotten: real statutory tax slabs and a gratuity policy confirmed against local labour law.
- [ ] Rollback procedure rehearsed on staging.
- [ ] Hyper-care plan agreed with an on-call rota and escalation path.
