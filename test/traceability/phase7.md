# Phase 7 — Reports & Dashboard Rule Traceability

## Framework rules (RP-01–RP-20)

| Rule | Description | Test / enforcement |
|------|-------------|-------------------|
| RP-01 | All execution via `ReportExecutorService` | Controllers delegate to executor; `report-executor.service.spec.ts` |
| RP-02 | Permission-gated catalog and execution | `report-catalog-rbac.integration.spec.ts`, `report-executor.service.spec.ts` |
| RP-03 | Row-level scope (teacher/therapist); parent denied | `report-scope.service.spec.ts`, `report-catalog-rbac.integration.spec.ts` |
| RP-04 | Date range `max_range_days` validation | `report-executor.service.spec.ts` |
| RP-05 | Heavy reports → async queue (202 + jobId) | `report-executor.service.spec.ts`, `report-heavy-sync.js`, `report-all-endpoints.integration.spec.ts` |
| RP-06 | Sync timeout → `REPORT_TIMEOUT` 504 | `report-executor.service.spec.ts` |
| RP-07 | `dataFreshness` on responses | Handler `reportResult()` + integration smoke |
| RP-08 | Financial figures reconcile to ledger | `report-ledger-reconciliation.integration.spec.ts`, `finance.pnl.spec.ts` |
| RP-09 | Export jobs expire after retention window | `export-cleanup.job.ts`, `ExportCleanupJob` (integration soft-assert in export pipeline) |
| RP-10 | Excel stream + `export_max_rows` cap | `xlsx.renderer.spec.ts`, export processor |
| RP-11 | PDF header/metadata | `pdf.renderer.ts` + export processor |
| RP-12 | Custom builder — no free SQL; whitelist only | `safe-query.builder.spec.ts` (injection suite), `custom-report-injection.integration.spec.ts` |
| RP-13 | Column permissions on custom datasets | `custom-report.service.spec.ts` |
| RP-14 | Scheduled report retry + owner notification | `scheduled-report.job.ts` |
| RP-15 | Recipient permission check at send time | `export.processor.ts` `notifyScheduledRecipients` |
| RP-16 | MV refresh `CONCURRENTLY`, log on failure | `mv-refresh.integration.spec.ts` (skip when job absent) |
| RP-17 | Dashboard cache TTL 10 min | Dashboard module (when present); `dashboard-kpi-load.js` |
| RP-18 | KPI `noData: true` vs zero | KPI unit tests (when dashboard module lands) |
| RP-19 | PDF + Excel on every exportable report | Startup parity + `ReportHandlersRegistrar` format assertion |
| RP-20 | Reports never mutate data | `.semgrep/phase7-reports-readonly.yml` (handlers/framework/renderers/dashboards) |

## Unit specs (W5)

| Component | Spec |
|-----------|------|
| ReportExecutorService | `report-executor.service.spec.ts` |
| ReportScopeService | `report-scope.service.spec.ts` |
| SafeQueryBuilder | `safe-query.builder.spec.ts` (injection suite — merge blocker) |
| ExpressionValidator | `expression.validator.spec.ts` |
| CsvRenderer | `csv.renderer.spec.ts` |
| XlsxRenderer | `xlsx.renderer.spec.ts` |
| CustomReportService | `custom-report.service.spec.ts` |
| finance.pnl handler | `finance.pnl.spec.ts` |
| school.fee-collection | `fee-collection.spec.ts` |
| therapy.session-completion-rate | `session-completion-rate.spec.ts` |
| hr.payroll-summary | `payroll-summary.spec.ts` |
| inventory.stock-position | `stock-position.spec.ts` |

## Integration suites (W5)

| Suite | Focus |
|-------|--------|
| `report-catalog-rbac.integration.spec.ts` | Principal catalog access; parent forbidden |
| `report-all-endpoints.integration.spec.ts` | Every registered code returns non-500 |
| `export-pipeline.integration.spec.ts` | Queue export, poll job (soft-assert) |
| `custom-report-injection.integration.spec.ts` | Malicious custom report filters → 400 |
| `dashboard.integration.spec.ts` | GET `/dashboard` with principal token |
| `report-ledger-reconciliation.integration.spec.ts` | `finance.pnl` vs `StatementService` |
| `mv-refresh.integration.spec.ts` | `MvRefreshJob.handle` when present |

## Exit criteria

| Criterion | Proof |
|-----------|-------|
| Feature list 8.1–8.6 coverage | `docs/plan/backend/report-coverage.md` |
| Custom report injection CI | `safe-query.builder.spec.ts` + `custom-report-injection.integration.spec.ts` |
| Ledger reconciliation | `report-ledger-reconciliation.integration.spec.ts` |
| Read-only report handlers (RP-20) | `.semgrep/phase7-reports-readonly.yml` |
| Mutation ≥75% on framework + high-value handlers | `stryker.config.js` Phase 7 paths |
| k6 load scripts | `dashboard-kpi-load.js`, `report-export-async.js`, `report-heavy-sync.js` |
| Report registry parity | `ReportHandlersRegistrar` + `report-all-endpoints.integration.spec.ts` |

## ADR

| Topic | Document |
|-------|----------|
| Custom report builder — no raw SQL | `docs/adr/0005-custom-report-no-sql.md` |
