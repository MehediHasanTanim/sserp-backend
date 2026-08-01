# Phase 7 — Report Coverage Checklist (Feature List 8.1–8.6)

Every named report from the feature list is registered, permission-gated, and implemented in a module handler file. Status: **implemented** for all rows below.

Handler files are grouped by domain (`school.handlers.ts`, etc.); each row maps feature-list name → report code → handler file.

## 8.1 School Reports

| Feature list name | Report code | Handler file | Status |
|---|---|---|---|
| Student Attendance Report (individual / class-wide, monthly / annual) | `school.attendance` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Monthly attendance aggregate (MV-backed) | `school.attendance-monthly-summary` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Monthly Progress Report per student | `school.progress-report-status` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Quarterly IEP Programme Report per student | `school.iep-review-due` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| IEP Goal Progress Report (by student, domain, status) | `school.iep-goal-progress` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Student Enrollment Summary | `school.enrollment-summary` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Pending Admission Fee Report | `school.pending-admission-fee` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Admission Fee Collection Report | `school.admission-fee-collection` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Student–Teacher Mapping Report | `school.teacher-mapping` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Substitute Teacher Assignment History Report | `school.substitute-history` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Student Advance Leave Request Report | `school.student-leave-requests` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Fee Collection Report | `school.fee-collection` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Fee Defaulters Report | `school.fee-defaulters` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Student Health Incident Report | `school.health-incidents` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Outdoor Activity Participation Report | `school.activity-participation` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Outdoor Activity Fee Collection Report | `school.activity-fee-collection` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Outdoor Activity Attendance Report | `school.activity-attendance` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |
| Parent Opt-In Response Report | `school.activity-optin-response` | `src/modules/reports/handlers/school/school.handlers.ts` | ✅ |

**Implementation extension (not in feature list 8.1):** `school.behavioral-incidents` → `school.handlers.ts` ✅

## 8.2 Therapy Reports

| Feature list name | Report code | Handler file | Status |
|---|---|---|---|
| Session Schedule Report | `therapy.session-schedule` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Session Completion Rate Report | `therapy.session-completion-rate` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Patient Progress Report per therapy type | `therapy.patient-progress` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Therapist Utilization Report | `therapy.therapist-utilization` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Therapy Revenue Report | `therapy.revenue` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Waiting List Report | `therapy.waiting-list` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Assessment Report per patient | `therapy.assessment` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Group Therapy Session Report | `therapy.group-session` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Group Therapy Patient Attendance Summary | `therapy.group-patient-attendance` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Group Therapy Revenue Report | `therapy.group-revenue` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |
| Group Enrollment Report | `therapy.group-enrollment` | `src/modules/reports/handlers/therapy/therapy.handlers.ts` | ✅ |

## 8.3 HR Reports

| Feature list name | Report code | Handler file | Status |
|---|---|---|---|
| Employee Master List | `hr.employee-master` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Daily Attendance Report | `hr.attendance-daily` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Monthly Attendance Report | `hr.attendance-monthly` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Leave Balance Report | `hr.leave-balance` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Leave Utilization Report | `hr.leave-utilization` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Leave Encashment Report | `hr.leave-encashment` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Gratuity Entitlement Report | `hr.gratuity-entitlement` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Gratuity Monthly Provision Report | `hr.gratuity-monthly-provision` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Gratuity Annual Liability Report | `hr.gratuity-annual-liability` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Gratuity Exit Settlement Report | `hr.gratuity-exit-settlement` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Payroll Summary Report | `hr.payroll-summary` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Payroll Detail (payslip batch) | `hr.payroll-detail` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Headcount Report | `hr.headcount` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Recruitment Pipeline Report | `hr.recruitment-pipeline` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Training Participation Report | `hr.training-participation` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |
| Employee Turnover Report | `hr.turnover` | `src/modules/reports/handlers/hr/hr.handlers.ts` | ✅ |

## 8.4 Financial & Accounts Reports

| Feature list name | Report code | Handler file | Status |
|---|---|---|---|
| Profit & Loss Statement | `finance.pnl` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Balance Sheet | `finance.balance-sheet` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Cash Flow Statement | `finance.cash-flow` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Cost Center Profitability Report | `finance.cost-center-profitability` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Accounts Receivable Aging Report | `finance.ar-aging` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Accounts Payable Aging Report | `finance.ap-aging` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Budget vs. Actual Report | `finance.budget-vs-actual` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Bank Reconciliation Report | `finance.bank-reconciliation` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Tax Summary Report | `finance.tax-summary` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |
| Shareholder Disbursement Report | `finance.shareholder-disbursement` | `src/modules/reports/handlers/finance/finance.handlers.ts` | ✅ |

**Phase 7 extensions (ledger detail):** `finance.trial-balance`, `finance.general-ledger` → `finance.handlers.ts` ✅

## 8.5 Inventory & Procurement Reports

| Feature list name | Report code | Handler file | Status |
|---|---|---|---|
| Current Stock Position Report | `inventory.stock-position` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |
| Stock Movement Report | `inventory.stock-movement` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |
| Low Stock Alert Report | `inventory.low-stock` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |
| Asset Register | `inventory.asset-register` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |
| Half-Yearly Audit Report | `inventory.audit-summary` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |
| Purchase Request Status Report | `inventory.purchase-request-status` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |
| PO Tracker Report | `inventory.po-tracker` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |
| Vendor Performance Report | `inventory.vendor-performance` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |
| Procurement Spend Analysis | `inventory.procurement-spend` | `src/modules/reports/handlers/inventory/inventory.handlers.ts` | ✅ |

**Phase 7 extension:** `inventory.stock-valuation` → `inventory.handlers.ts` ✅

## 8.6 Cross-Module / Executive Reports

| Feature list name | Report code | Handler file | Status |
|---|---|---|---|
| Monthly Management Summary | `executive.monthly-management-summary` | `src/modules/reports/handlers/executive/executive.handlers.ts` | ✅ |
| Annual Performance Dashboard | `executive.annual-performance` | `src/modules/reports/handlers/executive/executive.handlers.ts` | ✅ |
| Cost per student analysis | `executive.cost-per-student` | `src/modules/reports/handlers/executive/executive.handlers.ts` | ✅ |
| Revenue per therapy type analysis | `executive.revenue-per-therapy-type` | `src/modules/reports/handlers/executive/executive.handlers.ts` | ✅ |

---

**Totals:** 72 registered report codes (feature list 8.1–8.6 + ledger/valuation extensions). All marked implemented.

**CI enforcement:** `npm run test:report-coverage` asserts `report-coverage.md` codes match `ALL_REPORT_CODES` and that no domain handler still calls `emptyHandler(`.

**Registry source:** `src/modules/reports/handlers/report-seed-meta.ts` + `ReportHandlersRegistrar` startup parity assertion.

**Integration proof:** `test/integration/report-all-endpoints.integration.spec.ts`
