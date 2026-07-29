# Backend Phase 7 — Reports, Analytics & Dashboards

| Field | Value |
|---|---|
| Duration | 4 weeks |
| Prerequisites | Phases 0–6 merged |
| Feature list coverage | 8.1–8.7 (Report Module), 12.1–12.3 (Dashboard & Analytics) |
| TDD sections | 7.3 (Reports), 8.4 (role-based report visibility), 11.4, 14.1–14.2 |

---

## 1. Objective and scope

Deliver every report in feature list section 8, the async export pipeline, the custom report builder, scheduled email delivery, and the five role-based dashboards with their KPIs.

The architectural driver is that reports must never degrade the transactional system. Therefore: reports read through a dedicated query layer with its own connection pool settings, heavy aggregations use materialised views refreshed on a schedule, and anything that could exceed 3 seconds runs as a background job.

**In scope**

- A reusable report framework: definition registry, parameter validation, role-based visibility, pagination, caching
- All 60+ named reports from feature list 8.1–8.5
- Cross-module executive reports (8.6)
- Report features (8.7): date filters, PDF and Excel export, scheduled email delivery, custom report builder, saved templates, role-based visibility
- Materialised views for attendance, revenue, and utilisation aggregations
- Role-based dashboards for principal, coordinator, therapist, accountant, and HR officer
- KPI computation with month-over-month and year-over-year comparison
- Drill-down endpoints from summary to detail

**Out of scope**

- Chart rendering (frontend)
- Real-time dashboard push (Phase 8 adds WebSocket invalidation of dashboard cache)

---

## 2. Prerequisites

All domain modules complete, since every report reads from them.

---

## 3. Prisma schema additions

#### `report_definitions`
Registry row per report, seeded from code so the registry and the implementation cannot drift. `id`, `code` (unique, e.g. `school.attendance`), `name`, `module`, `category`, `description`, `parameters JSONB` (schema for validation and UI generation), `supported_formats TEXT[]`, `required_permissions JSONB`, `default_sort`, `is_exportable`, `is_schedulable`, `estimated_cost` (`light`|`heavy` — drives sync vs async routing), `is_active`.

#### `saved_report_templates`
`id`, `report_code`, `name`, `owner_user_id`, `visibility` (`private`|`role`|`organisation`), `visible_to_roles TEXT[]`, `parameters JSONB`, `column_selection JSONB`, `created_at`. Backs "saved report templates" (8.7).

#### `custom_reports`
`id`, `name`, `owner_user_id`, `base_dataset` (a whitelisted dataset key, never raw SQL), `selected_columns JSONB`, `filters JSONB`, `group_by JSONB`, `aggregations JSONB`, `sort JSONB`, `visibility`, `visible_to_roles TEXT[]`, `is_active`.

**Security note.** The custom report builder never accepts SQL. It accepts a dataset key plus column, filter, and aggregation selections that are validated against a server-side dataset descriptor and compiled into a parameterised Prisma or SQL builder query. This is the single most likely injection vector in the system, so the whitelist is exhaustive and tested.

#### `report_datasets`
Server-side descriptors for the builder: `id`, `key`, `name`, `module`, `columns JSONB` (name, type, filterable, groupable, aggregatable, required permission), `joins JSONB`, `row_level_scope` (`none`|`student`|`teacher`|`therapist`|`department`), `is_active`.

#### `export_jobs`
`id`, `report_code`, `custom_report_id`, `requested_by`, `parameters JSONB`, `format` (`pdf`|`xlsx`|`csv`), `status` (`queued`|`running`|`completed`|`failed`|`expired`), `progress_percent`, `row_count`, `object_key`, `file_size_bytes`, `error_message`, `queued_at`, `started_at`, `completed_at`, `expires_at`.

#### `scheduled_reports`
`id`, `report_code`, `saved_template_id`, `name`, `frequency` (`daily`|`weekly`|`monthly`|`quarterly`), `day_of_week`, `day_of_month`, `send_time`, `timezone`, `format`, `recipient_user_ids UUID[]`, `recipient_emails TEXT[]`, `parameters JSONB`, `is_active`, `last_run_at`, `last_run_status`, `next_run_at`, `created_by`.

#### `scheduled_report_runs`
`id`, `scheduled_report_id`, `run_at`, `status`, `export_job_id`, `recipients_notified`, `error_message`.

#### `dashboard_widget_preferences`
`id`, `user_id`, `dashboard_role`, `widget_layout JSONB`, `hidden_widgets TEXT[]`.

### Materialised views

| View | Contents | Refresh |
|---|---|---|
| `mv_monthly_attendance_summary` | Per student per month: working days, present, absent, late, half-day, excused, medical, percentage. Explicitly named in TDD 14.2. | Nightly 02:30, plus on-demand for the current month |
| `mv_daily_attendance_rollup` | Per date per shift: enrolled, present, absent, percentage | Nightly + hourly for today |
| `mv_iep_goal_progress` | Per student per domain: goal counts by status, achievement rate | Nightly |
| `mv_fee_collection_summary` | Per month per fee head: billed, collected, outstanding, waived, discounted | Nightly + after each payment batch |
| `mv_therapy_session_summary` | Per therapist per month per therapy type per mode: scheduled, completed, cancelled, no-show, hours delivered | Nightly |
| `mv_therapy_revenue_summary` | Per therapy type per mode per month: billed, collected, outstanding | Nightly |
| `mv_group_attendance_summary` | Per group per patient: sessions held, present, absent, late, excused | Nightly |
| `mv_hr_attendance_summary` | Per employee per month: working days, present, absent, late, leave, overtime | Nightly |
| `mv_account_period_balances` | Per account per fiscal period: opening, debits, credits, closing | Nightly, plus on period close |
| `mv_stock_position` | Per item per location: on hand, value, below minimum flag | Hourly |

All views are created with `CREATE MATERIALIZED VIEW ... WITH NO DATA` and populated by the refresh job, with `REFRESH MATERIALIZED VIEW CONCURRENTLY` so reads are never blocked. Each carries a unique index to permit concurrent refresh.

#### `mv_refresh_log`
`id`, `view_name`, `started_at`, `completed_at`, `duration_ms`, `row_count`, `status`, `error_message`. Freshness is exposed on report responses so consumers know how current the data is.

### Indexes added

```
export_jobs (requested_by, status), (status, queued_at), (expires_at)
scheduled_reports (is_active, next_run_at)
saved_report_templates (owner_user_id), (report_code)
mv_monthly_attendance_summary unique (student_id, period_year, period_month)
mv_therapy_session_summary unique (therapist_id, period_year, period_month, therapy_type, session_mode)
mv_fee_collection_summary unique (period_year, period_month, fee_head_id)
```

---

## 4. Module and file structure

```
src/modules/reports/
├── reports.module.ts
├── controllers/
│   ├── report-catalog.controller.ts
│   ├── school-reports.controller.ts
│   ├── therapy-reports.controller.ts
│   ├── hr-reports.controller.ts
│   ├── finance-reports.controller.ts
│   ├── inventory-reports.controller.ts
│   ├── executive-reports.controller.ts
│   ├── export.controller.ts
│   ├── scheduled-report.controller.ts
│   ├── custom-report.controller.ts
│   └── dashboard.controller.ts
├── framework/
│   ├── report-registry.ts               # code → handler + definition
│   ├── report-executor.service.ts       # param validation, scope, cache, sync/async routing
│   ├── report-scope.service.ts          # row-level filtering by role
│   ├── report-cache.service.ts
│   ├── query-builder/
│   │   ├── dataset-registry.ts          # whitelisted datasets and columns
│   │   ├── safe-query.builder.ts        # compiles selections to parameterised SQL
│   │   └── expression.validator.ts
│   └── types.ts
├── handlers/
│   ├── school/                          # one file per report
│   ├── therapy/
│   ├── hr/
│   ├── finance/
│   ├── inventory/
│   └── executive/
├── renderers/
│   ├── pdf.renderer.ts                  # Handlebars + Puppeteer
│   ├── xlsx.renderer.ts                 # ExcelJS streaming writer
│   └── csv.renderer.ts
├── dashboards/
│   ├── principal.dashboard.ts
│   ├── coordinator.dashboard.ts
│   ├── therapist.dashboard.ts
│   ├── accountant.dashboard.ts
│   ├── hr.dashboard.ts
│   └── kpi/                             # one file per KPI
├── jobs/
│   ├── export.job.ts
│   ├── scheduled-report.job.ts
│   ├── mv-refresh.job.ts
│   └── export-cleanup.job.ts
└── dto/
```

### Report handler contract

```typescript
export interface ReportHandler<P extends object, R> {
  readonly code: string;
  readonly definition: ReportDefinition;
  validate(params: unknown): P;                   // Zod schema
  execute(params: P, ctx: ReportContext): Promise<ReportResult<R>>;
  // ReportContext carries the authenticated user, resolved scope, timezone, and pagination
}
```

Every report is a handler registered in `ReportRegistry`. The registry is the single source of the catalog endpoint, the seeded `report_definitions` rows, and the permission checks — so a report cannot exist without a definition, and cannot be reached without a declared permission. A startup assertion fails the boot if a handler and its definition disagree.

---

## 5. API endpoints

### Catalog and execution

| Method | Endpoint | Description |
|---|---|---|
| GET | `/reports/catalog` | Reports the caller is permitted to run, grouped by module, with parameter schemas |
| GET | `/reports/:code` | Execute a report synchronously; returns data, meta, and `dataFreshness` |
| POST | `/reports/:code/export` | Queue an export; returns `jobId` |
| GET | `/reports/export/:jobId` | Poll job status; returns a presigned download URL when complete |
| DELETE | `/reports/export/:jobId` | Cancel a queued job |
| GET | `/reports/exports` | Caller's recent export jobs |

### School reports (feature 8.1)

Each is a `GET /reports/school/<slug>`:

`attendance`, `attendance-monthly-summary`, `progress-report-status`, `iep-goal-progress`, `iep-review-due`, `enrollment-summary`, `pending-admission-fee`, `admission-fee-collection`, `teacher-mapping`, `substitute-history`, `student-leave-requests`, `fee-collection`, `fee-defaulters`, `health-incidents`, `behavioral-incidents`, `activity-participation`, `activity-fee-collection`, `activity-attendance`, `activity-optin-response`.

### Therapy reports (feature 8.2)

`GET /reports/therapy/<slug>`: `session-schedule`, `session-completion-rate`, `patient-progress`, `therapist-utilization`, `revenue`, `waiting-list`, `assessment`, `group-session`, `group-patient-attendance`, `group-revenue`, `group-enrollment`.

### HR reports (feature 8.3)

`GET /reports/hr/<slug>`: `employee-master`, `attendance-daily`, `attendance-monthly`, `leave-balance`, `leave-utilization`, `leave-encashment`, `gratuity-entitlement`, `gratuity-monthly-provision`, `gratuity-annual-liability`, `gratuity-exit-settlement`, `payroll-summary`, `payroll-detail`, `headcount`, `recruitment-pipeline`, `training-participation`, `turnover`.

### Financial reports (feature 8.4)

`GET /reports/finance/<slug>`: `pnl`, `balance-sheet`, `cash-flow`, `cost-center-profitability`, `ar-aging`, `ap-aging`, `budget-vs-actual`, `bank-reconciliation`, `tax-summary`, `shareholder-disbursement`, `trial-balance`, `general-ledger`.

### Inventory and procurement reports (feature 8.5)

`GET /reports/inventory/<slug>`: `stock-position`, `stock-movement`, `low-stock`, `asset-register`, `audit-summary`, `stock-valuation`, `purchase-request-status`, `po-tracker`, `vendor-performance`, `procurement-spend`.

### Executive reports (feature 8.6)

`GET /reports/executive/<slug>`: `monthly-management-summary`, `annual-performance`, `cost-per-student`, `revenue-per-therapy-type`.

### Templates, schedules, custom reports

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH/DELETE | `/reports/templates` | any report-permitted user (own templates) |
| GET/POST/PATCH/DELETE | `/reports/scheduled` | principal, accountant, hr_officer, super_admin |
| POST | `/reports/scheduled/:id/run-now` | owner, super_admin |
| GET | `/reports/scheduled/:id/runs` | owner, super_admin |
| GET | `/reports/datasets` | users with the custom-report permission | Whitelisted datasets and columns for the builder |
| GET/POST/PATCH/DELETE | `/reports/custom` | users with the custom-report permission |
| GET | `/reports/custom/:id/run` | scoped |
| POST | `/reports/custom/:id/export` | scoped |

### Dashboards

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/dashboard` | authenticated | Returns the dashboard for the caller's primary role; multi-role users get a `availableDashboards[]` list |
| GET | `/dashboard/:role` | user holding that role | Explicit role dashboard |
| GET | `/dashboard/kpi/:kpiCode` | scoped | Single KPI with comparison periods, for refresh without reloading the page |
| GET | `/dashboard/kpi/:kpiCode/drill-down` | scoped | Underlying rows behind a KPI figure |
| GET/PUT | `/dashboard/preferences` | authenticated | Widget layout and hidden widgets |

### Dashboard contents

| Dashboard | Widgets |
|---|---|
| Principal | Enrollment count and trend; attendance rate; fee collection rate and outstanding; therapy utilisation; pending approvals queue (PR, leave, waivers, discounts, journals); month revenue vs expense; headcount |
| Coordinator | Today's schedule by shift; absent teachers today; substitute assignments pending; progress report status by stage; IEP reviews due within 30 days; unmarked attendance today; today's therapy sessions |
| Therapist | Today's sessions; next 7 days; session completion rate this month; pending session notes; patients served this month; group sessions this week |
| Accountant | Revenue summary this month; outstanding receivables by bucket; payables due within 7 days; budget utilisation by cost center; unreconciled bank lines; cash and bank balances |
| HR officer | Today's attendance summary; pending leave requests; contracts expiring within 30 days; payroll status and due date; gratuity provision status for the month; open requisitions; probations due |

### KPIs (feature 12.2)

`enrollment_trend`, `attendance_rate_school`, `attendance_rate_student`, `iep_goal_achievement_rate`, `therapy_session_completion_rate`, `fee_collection_rate`, `hr_headcount`, `hr_attrition_rate`, `inventory_stock_health`, `therapy_utilization_rate`, `outstanding_receivables`, `budget_utilization_rate`, `cost_per_student`, `revenue_per_therapy_type`.

Every KPI returns `{ code, label, value, unit, period, comparison: { previousPeriod, previousYear, changePercent, direction }, drillDownAvailable }`.

---

## 6. Business rules and invariants

| # | Rule | Error |
|---|---|---|
| RP-01 | Every report execution passes through `ReportExecutorService`. No controller queries the database directly. | — |
| RP-02 | A report is reachable only if the caller holds the report's `required_permissions`. The catalog endpoint returns exactly the reachable set, so the UI cannot offer an unreachable report. | `FORBIDDEN` 403 |
| RP-03 | Row-level scope is applied server-side per the dataset's `row_level_scope`: a teacher's reports cover only their mapped students; a therapist's only their patients and sessions; a parent has no report access at all (per the TDD 8.4 matrix). | — |
| RP-04 | Every report accepts and validates a date range. A range exceeding `max_range_days` for that report is rejected with the limit in the error details. | `RANGE_TOO_LARGE` 422 |
| RP-05 | Reports marked `estimated_cost = 'heavy'`, and any export, are routed to the async queue. A synchronous request for a heavy report returns `202` with a `jobId` rather than blocking. | — |
| RP-06 | Synchronous reports must complete within 3 seconds. A `TimeoutInterceptor` aborts at 5 seconds and returns a message advising export. Any abort is logged as a WARN with the report code and parameters for tuning. | `REPORT_TIMEOUT` 504 |
| RP-07 | Report responses include `dataFreshness: { source: 'live' \| 'materialised', asOf }` so users can tell whether a figure includes today's activity. | — |
| RP-08 | Financial report figures must agree with the ledger. A report-level reconciliation test asserts, for the same period, that the fee collection report total equals the corresponding ledger account movement, and that therapy revenue equals its ledger movement. | — |
| RP-09 | Export jobs expire after 24 hours; the file is deleted from the `exports` bucket and the job marked `expired`. | — |
| RP-10 | Excel export streams rows rather than buffering, so a 100,000-row export does not exhaust worker memory. Hard cap `export_max_rows` (default 200,000) with a clear error beyond it. | `EXPORT_TOO_LARGE` 422 |
| RP-11 | PDF export paginates and includes the organisation header, report name, parameters, generation timestamp in org timezone, and the running user. | — |
| RP-12 | Custom reports accept **no** free-text SQL. Every column, filter, group-by, and aggregation is validated against the dataset descriptor; anything unrecognised is rejected before query compilation. | `INVALID_SELECTION` 400 |
| RP-13 | A custom report's available columns are filtered by the caller's permissions, so a coordinator building a report on the employee dataset cannot select the salary column. | `FORBIDDEN` 403 |
| RP-14 | Scheduled reports run in the organisation timezone. A failed run is retried twice with backoff, then recorded as failed and the owner notified. A scheduled report never silently stops. | — |
| RP-15 | Scheduled report delivery respects the recipient's permissions at send time. A recipient who has lost access is skipped and the owner is informed. | — |
| RP-16 | Materialised view refresh uses `CONCURRENTLY` and never blocks readers. A refresh failure alerts and leaves the previous data intact. | — |
| RP-17 | Dashboard responses are cached per `(role, userId, date)` for 10 minutes per TDD 14.1. Cache is invalidated by the relevant domain events. | — |
| RP-18 | A KPI with no data for the period returns `value: null` with an explicit `noData: true`, never zero. Zero and "no data" are different facts. | — |
| RP-19 | Every report is exportable to both PDF and Excel unless its definition explicitly says otherwise, satisfying feature 8.7. A startup assertion verifies each definition's `supported_formats` against the renderers available. | — |
| RP-20 | Reports never mutate data. A lint rule bans write operations inside `modules/reports`. | — |

---

## 7. Domain events

**Emitted:** `report.export.queued`, `report.export.ready`, `report.export.failed`, `report.scheduled.delivered`, `report.scheduled.failed`, `mv.refresh.failed`.

**Consumed** — for cache invalidation:

| Event | Effect |
|---|---|
| `student.enrolled`, `student.status_changed` | Invalidate enrollment KPIs and dashboards |
| `student.attendance.*` (bulk submit completion) | Invalidate attendance KPIs, refresh current-month attendance MV |
| `fee.payment.received`, `fee.invoice.generated` | Invalidate collection KPIs, refresh fee MV |
| `therapy_session.completed`, `therapy_session.cancelled` | Invalidate therapy KPIs |
| `journal.posted` | Invalidate financial dashboards |
| `payroll.run.completed` | Invalidate HR dashboards |
| `inventory.stock.low` | Invalidate stock health KPI |
| `period.closed` | Invalidate and then permanently cache that period's financial statements |

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `mv-refresh-nightly` | Daily 02:30 | Refresh all materialised views concurrently, log durations |
| `mv-refresh-hot` | Hourly | Refresh current-month attendance, today's rollup, and stock position |
| `export` | Queue-driven | Execute and render export jobs with progress reporting |
| `scheduled-report` | Every 15 minutes | Dispatch scheduled reports whose `next_run_at` has passed |
| `export-cleanup` | Hourly | Expire and delete export files past 24 hours |
| `dashboard-prewarm` | Daily 06:00 | Pre-compute dashboards for active users so the first login of the day is fast |

Queue added: `reports`.

---

## 9. Configuration and secrets

New settings:

- `organization_settings.report_sync_timeout_ms` (default 5000)
- `organization_settings.export_max_rows` (default 200000)
- `organization_settings.export_retention_hours` (default 24)
- `organization_settings.dashboard_cache_ttl_seconds` (default 600)
- Per-report `max_range_days` in the report definition (seeded)

---

## 10. Tests owed by this phase

### Unit tests — framework

- `ReportRegistry`: every registered handler has a matching definition; a handler without a definition fails the startup assertion; a definition without a handler fails too.
- `ReportExecutorService`: permission denial; scope application per role; range validation; heavy report routed to async; sync timeout produces the documented error; freshness metadata attached.
- `ReportScopeService`: teacher scope limited to mapped students; therapist to own patients; coordinator to all; parent denied.
- `SafeQueryBuilder`: **the injection suite.** Attempts to inject through a column name, a filter operator, a filter value, a group-by expression, an aggregation function, a sort direction, and a dataset key — all rejected. Includes classic payloads (`'; DROP TABLE`, `1=1 --`, `pg_sleep`, UNION SELECT), unicode homoglyphs, and nested-object attempts. This suite is a merge blocker.
- `ExpressionValidator`: only whitelisted aggregation functions accepted.
- `XlsxRenderer`: streams rather than buffers, verified by asserting memory does not scale with row count on a 50,000-row fixture.
- `CsvRenderer`: correct escaping of commas, quotes, newlines, and formula-injection prefixes (`=`, `+`, `-`, `@` are prefixed with a quote).

### Unit tests — handlers

Each of the ~60 report handlers gets at least:

- A happy-path test with a seeded fixture asserting exact figures.
- A parameter validation test.
- A scope test where the report is scopeable.
- An empty-result test asserting an empty array and correct meta, not an error.

The high-value handlers get hand-computed expectation tests:

| Report | Assertion |
|---|---|
| `school.attendance-monthly-summary` | Percentage matches the Phase 1 hand-computed fixture exactly, holidays and excused leave excluded |
| `school.fee-collection` | Billed, collected, outstanding, waived, discounted all reconcile: `billed = collected + outstanding + waived + discounted` |
| `school.fee-defaulters` | Only invoices past due with outstanding > 0, aged correctly |
| `school.pending-admission-fee` | Exactly the students in `pending_admission_fee` status |
| `therapy.session-completion-rate` | `completed / (completed + cancelled + no_show)` including both individual and group |
| `therapy.therapist-utilization` | Hours delivered sums individual and group session durations without double counting |
| `therapy.group-revenue` | Per-patient billing rows sum to the group total; per-patient collection state correct |
| `hr.payroll-summary` | Totals equal the sum of the run's slips and the posted journal amount |
| `hr.gratuity-annual-liability` | Equals the sum of cumulative provisions and reconciles to the provision liability account balance |
| `finance.pnl` | Equals the Phase 4 statement service output for the same period |
| `finance.ar-aging` | Equals the Phase 4 aging output; buckets identical |
| `finance.budget-vs-actual` | Actuals equal ledger movements for the mapped accounts |
| `inventory.stock-position` | Equals the sum of movements per item and location |
| `executive.cost-per-student` | `total school cost center expense / active student count`, with the denominator documented |

### Integration tests

| Suite | Assertions |
|---|---|
| `report-catalog-rbac.integration.spec.ts` | For each of the nine roles, the catalog contains exactly the permitted reports, and every excluded report returns 403 when called directly. Table-driven from the TDD 8.4 Reports row. |
| `report-all-endpoints.integration.spec.ts` | Every registered report code executes successfully against the seeded dataset with default parameters — guarantees 100% report endpoint coverage |
| `export-pipeline.integration.spec.ts` | Queue a PDF export and an Excel export, drain the queue, assert both objects exist in the `exports` bucket, the URLs resolve with correct MIME types, and the row counts match the synchronous report |
| `export-expiry.integration.spec.ts` | Advance the clock, run cleanup, assert the object is deleted and the job is `expired` |
| `custom-report-injection.integration.spec.ts` | The full injection payload matrix against the live API; every attempt returns 400 and no query is executed. Asserted by checking the Postgres statement log contains no injected fragment. |
| `custom-report-permissions.integration.spec.ts` | A coordinator building on the employee dataset cannot select `basic_salary`; an HR officer can |
| `scheduled-report.integration.spec.ts` | Create a daily schedule, advance the clock, assert the run executes, the export is produced, and email jobs are enqueued for each permitted recipient; a recipient whose permission was revoked is skipped |
| `mv-refresh.integration.spec.ts` | Refresh runs concurrently while a read is in flight; the read succeeds and returns pre-refresh data; the log records duration and row count |
| `report-ledger-reconciliation.integration.spec.ts` | Fee collection report, therapy revenue report, and payroll summary each reconcile to their ledger account movements for the same period — the single most important test in this phase |
| `dashboard.integration.spec.ts` | Each of the five dashboards returns all its widgets for a user with that role; a user without the role gets 403; cache hit on a second call within the TTL; invalidation after a relevant domain event |
| `kpi-comparison.integration.spec.ts` | Month-over-month and year-over-year comparisons computed correctly across a year boundary; a period with no data returns `noData: true`, not zero |
| `drill-down.integration.spec.ts` | For each KPI with drill-down, the detail rows sum to the KPI value |

### Performance tests

- `k6/scripts/dashboard-kpi-load.js` — per TDD 18.8.3: dashboard queries, 50 VU × 10 min, p95 < 300 ms with cache warm.
- `k6/scripts/report-export-async.js` — per TDD 18.8.3: `POST /reports/export` then poll `GET /reports/export/:id`, 15 VU × 5 min, asserting the queue drains and no request blocks.
- `k6/scripts/report-heavy-sync.js` — confirm heavy reports return 202 rather than timing out under load.

### Mutation testing

`ReportExecutorService`, `ReportScopeService`, `SafeQueryBuilder`, `ExpressionValidator`, and the fifteen hand-computed report handlers at ≥ 75%. `SafeQueryBuilder` targets ≥ 90%.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] Every report named in feature list 8.1–8.6 exists, is registered, is permission-gated, and is covered by the all-endpoints integration test. A checklist mapping each feature-list bullet to its report code is committed at `docs/plan/backend/report-coverage.md`.
- [ ] The custom report builder injection suite passes and is marked as a required CI check.
- [ ] Financial reports reconcile to the ledger for the same period — the reconciliation test is green.
- [ ] All five dashboards are complete with every widget listed in section 5.
- [ ] Every KPI in feature list 12.2 is implemented with comparison periods and drill-down where meaningful.
- [ ] Every report exports to both PDF and Excel, verified by the startup assertion and a smoke export of each in CI.
- [ ] Materialised views refresh concurrently in under 60 seconds total on the seeded dataset, with durations recorded.
- [ ] Dashboard p95 under 300 ms at 50 VU with a warm cache.
- [ ] No write operation exists anywhere in `modules/reports` — enforced by lint.
