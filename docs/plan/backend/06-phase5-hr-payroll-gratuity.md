# Backend Phase 5 — HR Advanced: Payroll, Gratuity & Encashment

| Field | Value |
|---|---|
| Duration | 4 weeks |
| Prerequisites | Phase 0, 1, 4 merged |
| Feature list coverage | 3.3 Leave Encashment, 3.3A Gratuity Management, 3.4 Payroll, 3.5 Performance, 3.6 Recruitment, 3.7 Training, 3.8 Benefits |
| TDD sections | 6.4 (gratuity tables), 7.3 (HR), 9.2 |

---

## 1. Objective and scope

Complete the HR module with the money-bearing features. Payroll and gratuity are the two most financially sensitive processes in the system after the ledger itself: payroll must be reproducible and immutable once locked, and gratuity provisioning must produce an accrual trail that survives audit.

**In scope**

- Salary structure builder, payroll groups, monthly payroll run with lock, statutory deductions, bonuses, payslip PDFs, bank transfer file, year-end tax summary
- Gratuity: policy configuration, entitlement calculation, monthly provisioning, gratuity ledger, exit settlement, payment voucher
- Leave encashment: policy, request, approval, calculation, payroll integration
- Performance management: review cycles, KPIs, self and manager appraisal, 360 feedback, ratings, increment recommendation
- Recruitment: requisition, posting, applicant tracking, interview scheduling, offer letter, conversion to employee
- Training: programmes, enrollment, attendance, certification, cost tracking
- Benefits: enrollment, insurance tracking, loans and advances with repayment schedules, end-of-service benefits

**Out of scope**

- HR reports (Phase 7)
- Biometric device integration (Phase 9 optional)

---

## 2. Prerequisites

- Phase 1 employees, attendance, leave, leave types with encashment configuration.
- Phase 4 `AccountsService`, `posting_rules`, `fiscal_periods`, `ap_ledger`, `budget_check`.

---

## 3. Prisma schema additions

### Payroll

#### `salary_components`
`id`, `code`, `name`, `component_type` (`earning`|`deduction`|`employer_contribution`), `calculation_type` (`fixed`|`percentage_of_basic`|`percentage_of_gross`|`formula`|`attendance_based`), `value NUMERIC(12,4)`, `formula_expression`, `is_taxable`, `is_statutory`, `affects_gratuity BOOLEAN`, `coa_account_code`, `sequence`, `is_active`.

`affects_gratuity` matters: gratuity is normally computed on basic salary only, but the policy may include specified allowances.

#### `payroll_groups`
`id`, `name`, `employment_types TEXT[]`, `pay_frequency` (`monthly`), `pay_day_of_month`, `is_active`.

#### `salary_structures`
`id`, `employee_id`, `payroll_group_id`, `effective_from`, `effective_to`, `gross_amount`, `status` (`draft`|`active`|`superseded`), `approved_by`, `approved_at`, `revision_reason`. Partial unique index: one `active` structure per employee at a time.

#### `salary_structure_lines`
`id`, `salary_structure_id`, `salary_component_id`, `amount INTEGER`, `override_value NUMERIC(12,4)`.

#### `payroll_runs`
`id`, `period_month`, `period_year`, `payroll_group_id`, `run_number`, `status` (`draft`|`calculating`|`calculated`|`approved`|`locked`|`paid`|`cancelled`), `employee_count`, `total_gross`, `total_deductions`, `total_net`, `total_employer_contribution`, `calculated_at`, `approved_by`, `approved_at`, `locked_at`, `locked_by`, `journal_id`, `bank_file_object_key`, `notes`. Unique `(period_month, period_year, payroll_group_id, run_number)`.

#### `payroll_slips`
RLS-protected (Phase 9). `id`, `payroll_run_id`, `employee_id`, `slip_number`, `working_days NUMERIC(5,2)`, `present_days`, `absent_days`, `leave_days`, `lop_days` (loss of pay), `overtime_minutes`, `gross_amount`, `total_deductions`, `net_amount`, `document_attachment_id`, `payment_status` (`pending`|`paid`|`failed`), `payment_reference`, `paid_at`. Unique `(payroll_run_id, employee_id)`.

#### `payroll_slip_lines`
`id`, `payroll_slip_id`, `salary_component_id`, `component_name`, `component_type`, `amount INTEGER`, `calculation_note`. Snapshot of names and amounts so a payslip renders identically forever even if components are later renamed.

#### `statutory_deduction_settings`
`id`, `deduction_type` (`income_tax`|`provident_fund`|`other`), `name`, `calculation_method` (`slab`|`percentage`|`fixed`), `slabs JSONB`, `employee_rate_percent`, `employer_rate_percent`, `ceiling_amount`, `effective_from`, `effective_to`, `coa_account_code`.

#### `bonuses`
`id`, `employee_id`, `bonus_type` (`festival`|`performance`|`incentive`|`other`), `amount`, `applicable_month`, `applicable_year`, `reason`, `status` (`pending`|`approved`|`rejected`|`paid`), `approved_by`, `payroll_run_id`.

#### `payroll_adjustments`
One-off additions or deductions applied to a specific run. `id`, `employee_id`, `period_month`, `period_year`, `adjustment_type` (`addition`|`deduction`), `label`, `amount`, `reason`, `source_type` (`manual`|`encashment`|`loan_repayment`|`advance_recovery`), `source_id`, `applied_payroll_run_id`, `status`.

#### `tax_certificates`
`id`, `employee_id`, `fiscal_year`, `total_gross`, `total_taxable`, `total_tax_deducted`, `document_attachment_id`, `issued_at`, `issued_by`.

### Gratuity

#### `gratuity_policies`
`id`, `name`, `min_service_years NUMERIC(4,2)`, `applicable_employment_types TEXT[]`, `days_per_year_of_service NUMERIC(5,2)`, `salary_basis` (`basic`|`basic_plus_allowances`|`gross`), `proration_method` (`monthly`|`daily`|`none`), `max_years_counted`, `forfeiture_on_termination BOOLEAN`, `forfeiture_reasons TEXT[]`, `effective_from`, `effective_to`, `is_active`.

Only one active policy at a time; historical policies retained so past settlements remain explainable.

#### `gratuity_entitlements`
Current computed entitlement per employee, recalculated on salary change and service milestones. `id`, `employee_id`, `policy_id`, `as_of_date`, `years_of_service NUMERIC(6,3)`, `eligible BOOLEAN`, `salary_basis_amount`, `entitlement_amount`, `computed_at`. Unique `(employee_id)` — a single current row, with history in the provisions table.

#### `gratuity_provisions`
Per TDD 6.4 plus `policy_id`, `salary_basis_amount`, `years_of_service_at_month NUMERIC(6,3)`, `entitlement_at_month`, `adjustment_amount`, `adjustment_reason`, `journal_id`, `computed_at`. Unique `(employee_id, provision_year, provision_month)`.

#### `gratuity_payments`
Per TDD 6.4 plus `policy_id`, `salary_basis_amount`, `gross_amount`, `forfeited_amount`, `forfeiture_reason`, `deductions_amount`, `deduction_detail JSONB`, `cumulative_provision_at_exit`, `voucher_id`, `journal_id`, `settlement_letter_attachment_id`, `approved_by`.

#### `gratuity_ledger`
Explicit audit trail required by feature 3.3A. `id`, `employee_id`, `entry_date`, `entry_type` (`provision`|`adjustment`|`payment`|`forfeiture`|`opening`), `amount INTEGER` (signed), `running_balance INTEGER`, `reference_type`, `reference_id`, `narration`, `journal_id`.

### Leave encashment

#### `encashment_requests`
`id`, `employee_id`, `leave_type_id`, `year`, `requested_days NUMERIC(5,2)`, `eligible_days NUMERIC(5,2)`, `per_day_amount INTEGER`, `calculated_amount INTEGER`, `approved_amount INTEGER`, `status` (`pending`|`hr_approved`|`approved`|`rejected`|`processed`), `trigger` (`employee_request`|`exit_automatic`), `current_approval_level`, `rejection_reason`, `payroll_run_id`, `payroll_adjustment_id`, `journal_id`, `requested_at`, `processed_at`.

#### `encashment_approval_steps`
`id`, `encashment_request_id`, `level`, `approver_role`, `approver_user_id`, `decision`, `decided_at`, `comment`.

### Performance

#### `review_cycles`
`id`, `name`, `cycle_type` (`annual`|`bi_annual`), `period_start`, `period_end`, `self_appraisal_deadline`, `manager_appraisal_deadline`, `status` (`planned`|`open`|`in_review`|`completed`|`closed`).

#### `kpis`
`id`, `name`, `description`, `department`, `designation`, `measurement_type` (`rating`|`numeric`|`boolean`), `weight_percent`, `target_value`, `is_active`.

#### `appraisals`
`id`, `review_cycle_id`, `employee_id`, `reviewer_user_id`, `self_submitted_at`, `manager_submitted_at`, `self_overall_rating`, `manager_overall_rating`, `final_score NUMERIC(5,2)`, `final_rating` (`outstanding`|`exceeds`|`meets`|`needs_improvement`|`unsatisfactory`), `strengths`, `improvement_areas`, `status` (`draft`|`self_submitted`|`manager_submitted`|`finalised`|`acknowledged`), `employee_acknowledged_at`.

#### `appraisal_kpi_scores`
`id`, `appraisal_id`, `kpi_id`, `self_score`, `manager_score`, `weighted_score`, `comment`.

#### `feedback_360`
`id`, `appraisal_id`, `feedback_provider_user_id`, `relationship` (`peer`|`subordinate`|`other_manager`), `responses JSONB`, `is_anonymous`, `submitted_at`.

#### `increment_recommendations`
`id`, `appraisal_id`, `employee_id`, `recommended_percent NUMERIC(5,2)`, `recommended_amount`, `justification`, `status` (`pending`|`approved`|`rejected`|`applied`), `approved_by`, `applied_salary_structure_id`.

### Recruitment

#### `job_requisitions`
`id`, `requisition_number`, `title`, `department`, `designation`, `positions_count`, `employment_type`, `justification`, `budget_line_id`, `salary_range_min`, `salary_range_max`, `required_by_date`, `status` (`draft`|`pending_approval`|`approved`|`rejected`|`on_hold`|`filled`|`cancelled`), `raised_by`, `approved_by`, `approved_at`, `rejection_reason`.

#### `job_postings`
`id`, `requisition_id`, `title`, `description`, `requirements`, `posted_date`, `closing_date`, `channels TEXT[]`, `status` (`draft`|`published`|`closed`).

#### `applicants`
`id`, `posting_id`, `application_number`, `full_name`, `email`, `phone`, `resume_attachment_id`, `expected_salary`, `notice_period_days`, `source`, `stage` (`applied`|`screening`|`shortlisted`|`interviewing`|`offered`|`accepted`|`rejected`|`withdrawn`), `stage_changed_at`, `rejection_reason`, `converted_employee_id`.

#### `interviews`
`id`, `applicant_id`, `round_number`, `interview_type` (`screening`|`technical`|`panel`|`final`), `scheduled_at`, `duration_minutes`, `mode` (`in_person`|`video`|`phone`), `location`, `panel_user_ids UUID[]`, `status` (`scheduled`|`completed`|`cancelled`|`no_show`), `overall_rating`, `recommendation` (`proceed`|`hold`|`reject`), `notes`.

#### `offers`
`id`, `applicant_id`, `offered_designation`, `offered_department`, `offered_salary_structure JSONB`, `joining_date`, `valid_until`, `status` (`draft`|`sent`|`accepted`|`declined`|`expired`|`withdrawn`), `document_attachment_id`, `approved_by`, `sent_at`, `responded_at`.

### Training

#### `training_programs`
`id`, `name`, `program_type` (`in_house`|`external`), `provider`, `description`, `start_date`, `end_date`, `duration_hours`, `venue`, `max_participants`, `cost_per_participant`, `total_budget`, `budget_line_id`, `status` (`planned`|`open`|`ongoing`|`completed`|`cancelled`), `trainer_name`.

#### `training_enrollments`
`id`, `program_id`, `employee_id`, `enrolled_at`, `enrolled_by`, `status` (`enrolled`|`attended`|`partially_attended`|`absent`|`withdrawn`), `completion_percentage`, `certificate_attachment_id`, `feedback_rating`, `feedback_comment`.

#### `training_sessions` / `training_attendance`
`training_sessions`: `id`, `program_id`, `session_date`, `start_time`, `end_time`, `topic`.
`training_attendance`: `id`, `session_id`, `employee_id`, `status` (`present`|`absent`|`late`), `marked_by`.

#### `training_costs`
`id`, `program_id`, `cost_type` (`fee`|`travel`|`material`|`venue`|`other`), `amount`, `vendor_name`, `journal_id`, `incurred_date`.

### Benefits

#### `benefit_plans`
`id`, `name`, `benefit_type` (`health_insurance`|`life_insurance`|`other`), `provider`, `coverage_summary`, `coverage_amount`, `employee_contribution_amount`, `employer_contribution_amount`, `policy_number`, `policy_start_date`, `policy_expiry_date`, `is_active`.

#### `benefit_enrollments`
`id`, `benefit_plan_id`, `employee_id`, `enrolled_from`, `enrolled_to`, `dependents JSONB`, `status` (`active`|`ended`).

#### `employee_loans`
`id`, `employee_id`, `loan_type` (`loan`|`salary_advance`), `principal_amount`, `interest_rate_percent`, `installment_count`, `installment_amount`, `disbursed_date`, `first_deduction_month`, `outstanding_amount`, `status` (`requested`|`approved`|`rejected`|`disbursed`|`repaying`|`closed`|`written_off`), `purpose`, `approved_by`, `voucher_id`.

#### `loan_repayments`
`id`, `loan_id`, `installment_number`, `due_month`, `due_year`, `scheduled_amount`, `paid_amount`, `payroll_slip_id`, `status` (`scheduled`|`deducted`|`waived`|`overdue`), `deducted_at`.

### Indexes added

```
salary_structures (employee_id, status), (effective_from)
payroll_runs (period_year, period_month, payroll_group_id), (status)
payroll_slips (payroll_run_id), (employee_id, payroll_run_id)
gratuity_provisions (employee_id, provision_year, provision_month)
gratuity_ledger (employee_id, entry_date)
gratuity_entitlements (employee_id), (eligible)
encashment_requests (employee_id, status), (status, requested_at)
appraisals (review_cycle_id, employee_id), (status)
applicants (posting_id, stage)
interviews (scheduled_at, status)
employee_loans (employee_id, status)
loan_repayments (due_year, due_month, status)
```

---

## 4. Module and file structure

```
src/modules/hr/                            (extended)
├── controllers/
│   ├── salary-component.controller.ts
│   ├── salary-structure.controller.ts
│   ├── payroll.controller.ts
│   ├── payslip.controller.ts
│   ├── bonus.controller.ts
│   ├── gratuity-policy.controller.ts
│   ├── gratuity.controller.ts
│   ├── encashment.controller.ts
│   ├── performance.controller.ts
│   ├── recruitment.controller.ts
│   ├── training.controller.ts
│   └── benefits.controller.ts
├── services/
│   ├── salary-structure.service.ts
│   ├── payroll-calculation.service.ts     # pure calculation, no persistence
│   ├── payroll-run.service.ts             # orchestration, lock, posting
│   ├── statutory-deduction.service.ts     # slab-based tax, PF
│   ├── payslip.service.ts
│   ├── bank-transfer-file.service.ts
│   ├── tax-certificate.service.ts
│   ├── gratuity-policy.service.ts
│   ├── gratuity-calculation.service.ts    # pure calculation
│   ├── gratuity-provision.service.ts
│   ├── gratuity-settlement.service.ts
│   ├── encashment.service.ts
│   ├── appraisal.service.ts
│   ├── recruitment.service.ts
│   ├── training.service.ts
│   └── benefits.service.ts
├── jobs/
│   ├── gratuity-monthly-provision.job.ts
│   ├── gratuity-eligibility-check.job.ts
│   ├── contract-expiry-alert.job.ts
│   ├── payroll-reminder.job.ts
│   └── loan-repayment-schedule.job.ts
└── pdf/{payslip,gratuity-settlement,offer-letter,tax-certificate}.template.hbs
```

**Design note.** `PayrollCalculationService` and `GratuityCalculationService` are deliberately **pure**: they take a snapshot of inputs and return computed results with no database or clock access. Time and data come in as parameters. This makes them trivially unit-testable and mutation-testable, which matters because they are the two services most likely to be audited.

---

## 5. API endpoints

### Salary and payroll

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/hr/salary-components` | hr_officer, super_admin |
| GET/POST/PATCH | `/hr/payroll-groups` | hr_officer, super_admin |
| GET | `/hr/employees/:id/salary-structure` | hr_officer, employee(own), accountant(R) |
| POST | `/hr/employees/:id/salary-structure` | hr_officer | New structure, supersedes the previous |
| POST | `/hr/salary-structures/:id/approve` | principal, hr_officer |
| GET/POST/PATCH | `/hr/statutory-deductions` | hr_officer, super_admin, accountant |
| GET/POST | `/hr/bonuses` | hr_officer |
| POST | `/hr/bonuses/:id/approve` | principal |
| GET/POST | `/hr/payroll-adjustments` | hr_officer |
| GET | `/hr/payroll/runs` | hr_officer, accountant, principal(R) |
| POST | `/hr/payroll/run` | hr_officer | Create + calculate (async) |
| GET | `/hr/payroll/runs/:id` | hr_officer, accountant, principal(R) | Includes calculation status |
| POST | `/hr/payroll/runs/:id/recalculate` | hr_officer | Draft/calculated only |
| POST | `/hr/payroll/runs/:id/approve` | principal | → approved |
| POST | `/hr/payroll/runs/:id/lock` | hr_officer, principal | Immutable; posts the journal |
| POST | `/hr/payroll/runs/:id/cancel` | principal | Pre-lock only |
| POST | `/hr/payroll/runs/:id/mark-paid` | accountant | Records disbursement |
| GET | `/hr/payroll/runs/:id/bank-file` | accountant, hr_officer | Download generated transfer file |
| GET | `/hr/payroll/runs/:id/slips` | hr_officer, accountant |
| GET | `/hr/payroll/slips/:employeeId` | hr_officer, employee(own), accountant |
| GET | `/hr/payroll/slips/:slipId/document` | hr_officer, employee(own) |
| GET | `/hr/employees/:id/tax-certificate/:fiscalYear` | hr_officer, employee(own) |

### Gratuity

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/hr/gratuity/policies` | super_admin, principal, hr_officer |
| POST | `/hr/gratuity/policies/:id/activate` | principal |
| GET | `/hr/gratuity/employees/:id` | hr_officer, accountant, employee(own), principal(R) | Entitlement + provision history + ledger |
| POST | `/hr/gratuity/employees/:id/recalculate` | hr_officer |
| GET | `/hr/gratuity/provisions` | hr_officer, accountant | By month/year, with totals |
| POST | `/hr/gratuity/provisions/run` | hr_officer, super_admin | Manual trigger of the monthly provision |
| POST | `/hr/gratuity/employees/:id/adjust` | hr_officer + principal approval | Manual adjustment with reason |
| POST | `/hr/gratuity/employees/:id/settle` | hr_officer, principal | Compute and record exit settlement |
| POST | `/hr/gratuity/payments/:id/pay` | accountant | Generate voucher, post payment |
| GET | `/hr/gratuity/payments/:id/settlement-letter` | hr_officer, employee(own) |
| GET | `/hr/gratuity/liability` | accountant, principal | Cumulative liability as of a date |

### Encashment

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/hr/leave-encashments` | hr_officer, principal, employee(own) |
| POST | `/hr/leave-encashments` | staff | Own request |
| GET | `/hr/leave-encashments/eligibility` | staff | Eligible days per encashable type |
| POST | `/hr/leave-encashments/:id/approve` | hr_officer then principal |
| POST | `/hr/leave-encashments/:id/reject` | hr_officer, principal | Reason mandatory |
| POST | `/hr/leave-encashments/:id/process` | hr_officer | Attach to a payroll run |

### Performance

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/hr/review-cycles` | hr_officer, principal |
| POST | `/hr/review-cycles/:id/open` | hr_officer | Generates appraisals for eligible employees |
| GET/POST/PATCH | `/hr/kpis` | hr_officer, principal |
| GET | `/hr/appraisals` | hr_officer, principal; manager sees reports; employee sees own |
| GET | `/hr/appraisals/:id` | scoped |
| PATCH | `/hr/appraisals/:id/self` | employee(own) | Self-appraisal, pre-deadline |
| PATCH | `/hr/appraisals/:id/manager` | reporting manager |
| POST | `/hr/appraisals/:id/finalise` | hr_officer, principal |
| POST | `/hr/appraisals/:id/acknowledge` | employee(own) |
| POST | `/hr/appraisals/:id/feedback-360` | invited providers |
| POST | `/hr/appraisals/:id/increment-recommendation` | manager, hr_officer |
| POST | `/hr/increment-recommendations/:id/approve` | principal | Optionally applies a new salary structure |

### Recruitment

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST | `/hr/requisitions` | hr_officer, department heads |
| POST | `/hr/requisitions/:id/approve` | principal | Budget check applied |
| POST | `/hr/requisitions/:id/reject` | principal | Reason mandatory |
| GET/POST/PATCH | `/hr/job-postings` | hr_officer |
| GET/POST | `/hr/applicants` | hr_officer |
| PATCH | `/hr/applicants/:id/stage` | hr_officer | Stage transition with validation |
| GET/POST/PATCH | `/hr/interviews` | hr_officer, panel members |
| POST | `/hr/interviews/:id/feedback` | panel members |
| GET/POST | `/hr/offers` | hr_officer |
| POST | `/hr/offers/:id/send` | hr_officer, principal |
| POST | `/hr/offers/:id/respond` | hr_officer | Record acceptance/decline |
| POST | `/hr/applicants/:id/convert` | hr_officer | Create the employee record |

### Training

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/hr/training-programs` | hr_officer |
| POST | `/hr/training-programs/:id/enroll` | hr_officer | Multi-employee |
| GET/POST | `/hr/training-programs/:id/sessions` | hr_officer |
| POST | `/hr/training-sessions/:id/attendance` | hr_officer, trainer |
| POST | `/hr/training-enrollments/:id/certificate` | hr_officer |
| GET/POST | `/hr/training-programs/:id/costs` | hr_officer, accountant |
| GET | `/hr/employees/:id/training-history` | hr_officer, employee(own) |

### Benefits

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/hr/benefit-plans` | hr_officer, super_admin |
| GET/POST | `/hr/employees/:id/benefit-enrollments` | hr_officer, employee(own R) |
| GET/POST | `/hr/loans` | hr_officer, employee(own request) |
| POST | `/hr/loans/:id/approve` | principal | Budget and policy check |
| POST | `/hr/loans/:id/disburse` | accountant | Generates voucher and repayment schedule |
| GET | `/hr/loans/:id/schedule` | hr_officer, employee(own) |
| POST | `/hr/loan-repayments/:id/waive` | principal | Reason mandatory |
| GET | `/hr/employees/:id/end-of-service-summary` | hr_officer, principal | Gratuity + encashment + loan recovery |

---

## 6. Business rules and invariants

### Payroll

| # | Rule | Error |
|---|---|---|
| PR-01 | One `active` salary structure per employee at any date. Creating a new one supersedes the previous with an `effective_to` of the day before. | — |
| PR-02 | A structure requires approval before it affects payroll. | `STRUCTURE_NOT_APPROVED` 422 |
| PR-03 | Gross = Σ earning components. Net = gross − Σ deductions. Employer contributions are excluded from net but included in the cost posting. | — |
| PR-04 | Percentage components resolve against the value of `basic` at calculation time, not against a stale snapshot. | — |
| PR-05 | Attendance-based components and loss-of-pay use `working_days` from the holiday-aware calendar, `present_days` from `hr_attendance`, and `leave_days` split into paid and unpaid by leave type. LOP = unpaid leave days + absent days. Per-day rate = gross ÷ working days. | — |
| PR-06 | A payroll run is unique per `(month, year, group, run_number)`. A second run for the same period requires the first to be `cancelled` or is created as run 2 (supplementary). | `PAYROLL_RUN_EXISTS` 409 |
| PR-07 | Calculation is asynchronous (Bull job) and idempotent — recalculating replaces slips wholesale within a transaction. | — |
| PR-08 | **A `locked` run is completely immutable.** No slip, line, or total may change. Attempting any mutation returns `PAYROLL_LOCKED`. Corrections are made via a supplementary run or a payroll adjustment in the next period. | `PAYROLL_LOCKED` 409 |
| PR-09 | Locking posts a single journal for the run: debit salary expense components per cost center, credit net-payable, credit statutory-payable accounts. Debits must equal credits. | `JOURNAL_UNBALANCED` 422 |
| PR-10 | Locking requires prior approval by `principal`. The lock is performed by `hr_officer` or `principal`. | `RUN_NOT_APPROVED` 409 |
| PR-11 | Employees with status `resigned`, `terminated`, or `retired` whose last working day precedes the period start are excluded. Mid-month exits are prorated to the last working day. | — |
| PR-12 | Approved encashments, approved bonuses, and due loan installments for the period are pulled in automatically as `payroll_adjustments` and appear as named payslip lines. | — |
| PR-13 | Statutory income tax uses the slab table in force for the fiscal year; the annual projection method is documented in the calculation service and asserted by test. | — |
| PR-14 | Payslip lines snapshot component names and types, so historical payslips never change when a component is renamed. | — |
| PR-15 | The bank transfer file is generated only after lock, contains one line per slip with `payment_status = pending`, and its checksum is recorded on the run. | `PAYROLL_NOT_LOCKED` 409 |
| PR-16 | Net pay may not be negative. If deductions exceed gross, the run reports the affected employees and refuses to calculate until adjusted. | `NEGATIVE_NET_PAY` 422 |
| PR-17 | Payroll is subject to the budget check against the salary budget line, in `warn` mode by default. | — |

### Gratuity

| # | Rule | Error |
|---|---|---|
| GR-01 | Exactly one `active` gratuity policy. Activating a new one deactivates the previous with an effective date; past provisions and settlements retain their `policy_id`. | — |
| GR-02 | Eligibility: `years_of_service ≥ policy.min_service_years` **and** `employment_type ∈ policy.applicable_employment_types`. | — |
| GR-03 | `years_of_service` is computed from `joining_date` to the as-of date as exact years with fractional months, using the `proration_method`. Leave without pay beyond a configurable threshold is excluded — documented and tested. | — |
| GR-04 | `entitlement = salary_basis_amount ÷ 30 × days_per_year_of_service × min(years_of_service, max_years_counted)`. The salary basis is resolved from the policy's `salary_basis` and the components flagged `affects_gratuity`. | — |
| GR-05 | Entitlement is recalculated when: the salary structure changes, an eligibility milestone is crossed, the policy changes, or the monthly provision job runs. | — |
| GR-06 | Monthly provision = current cumulative entitlement − cumulative provisioned to date. A negative delta (from a salary decrease) is recorded as a negative provision, never silently dropped. | — |
| GR-07 | Provisioning is idempotent per `(employee, year, month)`. Re-running the job produces no duplicate rows and no duplicate journals. | — |
| GR-08 | Each provision posts an accrual journal: debit gratuity expense (cost center of the employee's department), credit gratuity provision liability. Cumulative liability is visible on the balance sheet under employee benefit obligations. | — |
| GR-09 | Every provision, adjustment, payment, and forfeiture writes a `gratuity_ledger` row with a correct signed amount and running balance. The final running balance must equal `cumulative_total` on the latest provision. | — |
| GR-10 | Exit settlement = entitlement at last working day, prorated, minus forfeiture (if the policy forfeits on termination for the recorded reason) minus deductions (outstanding loans and advances). | — |
| GR-11 | Settlement requires an `employee_exits` record with a last working day. | `EXIT_RECORD_MISSING` 422 |
| GR-12 | Settlement posts: debit gratuity provision liability for the provisioned portion, debit gratuity expense for any shortfall, credit gratuity payable. Payment then debits payable and credits cash/bank. | — |
| GR-13 | Only one settlement per employee. A second attempt is rejected. | `ALREADY_SETTLED` 409 |
| GR-14 | Manual adjustments require `principal` approval and a reason and appear in the ledger as `adjustment`. | `FORBIDDEN` 403 |
| GR-15 | Crossing the eligibility threshold emits `gratuity.eligibility.reached` for the HR officer alert (feature 11.2). | — |

### Encashment

| # | Rule | Error |
|---|---|---|
| EN-01 | Only leave types with `is_encashable = true` are encashable. | `LEAVE_TYPE_NOT_ENCASHABLE` 422 |
| EN-02 | `eligible_days = min(available_balance − min_balance_to_retain, max_encashable_days_per_year − already_encashed_this_year)`, floored at 0. Requesting more is rejected with the eligible figure in the error details. | `EXCEEDS_ELIGIBLE_DAYS` 422 |
| EN-03 | `per_day_amount = basic_salary ÷ 30` by default, overridable by a configurable formula. `calculated_amount = eligible_days × per_day_amount`. | — |
| EN-04 | Approval is two-level: HR officer then principal. | — |
| EN-05 | Approval deducts `encashed_days` from the leave balance in the same transaction and creates a `payroll_adjustments` addition for the applicable month. | — |
| EN-06 | An encashment is `processed` only when its payroll run is locked. | — |
| EN-07 | On employee exit, remaining eligible balance is automatically encashed via a request with `trigger = exit_automatic`, skipping the employee-request step but still requiring principal approval. | — |
| EN-08 | Rejection releases nothing (no balance was deducted) and requires a reason. | `VALIDATION_ERROR` 400 |

### Performance, recruitment, training, benefits

| # | Rule | Error |
|---|---|---|
| PF-01 | Opening a review cycle generates one appraisal per eligible employee (confirmed, active, joined before the period start). | — |
| PF-02 | Self-appraisal is editable by the employee only, before the self deadline. Manager appraisal only by the reporting manager. | `FORBIDDEN` 403 / `DEADLINE_PASSED` 422 |
| PF-03 | An employee may not be their own reviewer. | `SELF_REVIEW_FORBIDDEN` 422 |
| PF-04 | `final_score = Σ (manager_score × kpi.weight_percent) ÷ 100`. KPI weights for a role must sum to 100. | `KPI_WEIGHTS_INVALID` 422 |
| PF-05 | Anonymous 360 feedback never exposes the provider identity through any API response. Asserted by test. | — |
| PF-06 | An increment recommendation, once approved, may create a new salary structure effective from a chosen date. | — |
| RC-01 | A requisition requires principal approval, and approval runs a budget check against the salary budget line. | `BUDGET_EXCEEDED` 422 |
| RC-02 | Applicant stage transitions follow the defined order; skipping forward is rejected, and moving backward requires a reason. | `INVALID_STAGE_TRANSITION` 409 |
| RC-03 | An offer requires an approved requisition with unfilled positions. | `NO_OPEN_POSITION` 422 |
| RC-04 | Conversion to employee is allowed only from an `accepted` offer and creates the employee with the offered structure in one transaction; the requisition's filled count increments and closes at zero remaining. | `OFFER_NOT_ACCEPTED` 409 |
| TR-01 | Training enrollment cannot exceed `max_participants`. | `CAPACITY_FULL` 409 |
| TR-02 | Training costs post to the training expense account with a budget check against the training budget line. | `BUDGET_EXCEEDED` 422 |
| TR-03 | A certificate can be uploaded only for an `attended` enrollment. | `NOT_ATTENDED` 422 |
| BN-01 | A loan requires approval; `installment_amount × installment_count ≥ principal`, and disbursement generates the full repayment schedule in one transaction. | `VALIDATION_ERROR` 400 |
| BN-02 | Loan installments are pulled into payroll as deductions. A deduction that would make net pay negative is capped and the shortfall rolls to the next month, extending the schedule. | — |
| BN-03 | Outstanding loan balance is recovered from the exit settlement before gratuity is paid out. | — |
| BN-04 | Insurance policies expiring within 30 days trigger an alert. | — |

---

## 7. Domain events

**Emitted:** `payroll.run.created`, `payroll.run.calculated`, `payroll.run.approved`, `payroll.run.completed` (on lock), `payroll.run.paid`, `payslip.published`, `gratuity.provision.monthly`, `gratuity.eligibility.reached`, `gratuity.settled`, `gratuity.paid`, `encashment.requested`, `encashment.approved`, `encashment.processed`, `appraisal.finalised`, `increment.approved`, `requisition.approved`, `offer.sent`, `offer.accepted`, `applicant.converted`, `training.enrolled`, `loan.disbursed`, `employee.contract.expiring`, `benefit.policy.expiring`.

**Consumed**

| Event | Handler | Action |
|---|---|---|
| `payroll.run.completed` | Accounts `HrPostingListener` | Verify the journal posted by the lock transaction; maintain `ap_ledger` net-payable rows |
| `gratuity.provision.monthly` | Accounts | Verify accrual postings; update liability rollup |
| `encashment.approved` | `PayrollAdjustmentListener` | Create the payroll adjustment |
| `employee.exit.initiated` (Phase 1) | `ExitSettlementListener` | Trigger automatic encashment request and gratuity settlement draft |
| `salary_structure.approved` | `GratuityEntitlementListener` | Recalculate entitlement |

### Ledger postings added

| Trigger | Debit | Credit | Cost center |
|---|---|---|---|
| Payroll locked | `5010 Salary Expense` (per component, per department cost center) | `2110 Net Salary Payable`, `2120 Income Tax Payable`, `2130 PF Payable` | per department |
| Payroll paid | `2110 Net Salary Payable` | `1020 Bank` | admin |
| Gratuity monthly provision | `5020 Gratuity Expense` | `2210 Gratuity Provision` | per department |
| Gratuity settlement | `2210 Gratuity Provision` + `5020 Gratuity Expense` (shortfall) | `2211 Gratuity Payable` | per department |
| Gratuity paid | `2211 Gratuity Payable` | `1010 Cash` / `1020 Bank` | admin |
| Encashment (via payroll) | `5011 Leave Encashment Expense` | `2110 Net Salary Payable` | per department |
| Loan disbursed | `1310 Employee Loan Receivable` | `1020 Bank` | admin |
| Loan installment recovered | `2110 Net Salary Payable` | `1310 Employee Loan Receivable` | admin |
| Training cost | `5030 Training Expense` | `2010 Accounts Payable` / `1020 Bank` | per department |

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `gratuity-monthly-provision` | Last day of month 23:00 | Compute and post provisions for all eligible employees; idempotent |
| `gratuity-eligibility-check` | Daily 07:00 | Detect threshold crossings, emit alerts, recalculate entitlements |
| `payroll-calculation` | Queue-driven | Async payroll run calculation |
| `payslip-pdf` | Queue-driven | Render payslip PDFs after lock |
| `payroll-reminder` | Monthly, 3 days before pay day | Remind HR |
| `contract-expiry-alert` | Daily 07:15 | 30-day contract expiry alerts |
| `benefit-policy-expiry-alert` | Weekly | Insurance policy expiry alerts |
| `loan-overdue-check` | Monthly after payroll | Flag missed installments |
| `appraisal-deadline-reminder` | Daily during open cycles | Nudge employees and managers |

Queue added: `payroll`.

---

## 9. Configuration and secrets

New settings:

- `organization_settings.gratuity_lwp_exclusion_threshold_days`
- `organization_settings.payroll_default_working_days` (fallback when the calendar is unavailable)
- `organization_settings.encashment_per_day_divisor` (default 30)
- `organization_settings.bank_transfer_file_format` (`csv` | `fixed_width` | `bank_specific`)
- `statutory_deduction_settings` seeded with a documented placeholder slab table that must be replaced with the real local rates before go-live — flagged as a Phase 9 checklist item

---

## 10. Tests owed by this phase

### Factories added

`salaryComponentFactory`, `salaryStructureFactory`, `payrollRunFactory`, `payrollSlipFactory`, `statutorySlabFactory`, `bonusFactory`, `gratuityPolicyFactory`, `gratuityProvisionFactory`, `encashmentFactory`, `reviewCycleFactory`, `appraisalFactory`, `kpiFactory`, `requisitionFactory`, `applicantFactory`, `offerFactory`, `trainingProgramFactory`, `loanFactory`.

### Unit tests — `PayrollCalculationService` (pure)

Table-driven with explicit paisa-exact expectations:

- Fixed-only structure.
- Percentage-of-basic components.
- Percentage-of-gross components with correct ordering.
- Attendance-based proration: 22 working days, 20 present, 1 unpaid leave, 1 absent → asserts the exact LOP deduction.
- Full-month attendance produces no LOP.
- Mid-month joiner prorated from the joining date.
- Mid-month exit prorated to the last working day.
- Overtime added at the configured rate.
- Income tax slab boundaries: an amount exactly at each slab edge, and one paisa above.
- Provident fund at the ceiling and below it.
- Deductions exceeding gross → `NEGATIVE_NET_PAY`.
- Encashment, bonus, and loan installment adjustments appear as distinct named lines.
- Rounding: gross computed from percentage components sums exactly to the stated gross with no residual paisa.

### Unit tests — `PayrollRunService`

- Duplicate run for the same period rejected.
- Recalculation replaces slips rather than appending.
- Every mutation on a locked run rejected — tested for slip edit, line edit, recalculate, cancel, and adjustment attachment.
- Lock without approval rejected.
- Lock posts exactly one balanced journal; debits equal credits.
- Excluded employees (exited before period start) absent from the slip set.
- Bank file generation before lock rejected.

### Unit tests — `GratuityCalculationService` (pure)

- Service years: exactly 1.0, 4.99, 5.0, 5.01 against a 5-year threshold.
- Ineligible employment type excluded even with sufficient service.
- Entitlement formula asserted against three hand-computed examples with different `days_per_year_of_service`.
- `max_years_counted` caps the calculation.
- Proration `monthly` vs `daily` vs `none` produce the documented different results.
- LWP beyond the threshold reduces service years.
- Salary basis `basic` vs `basic_plus_allowances` uses the correct components.
- Leap-year and month-end joining dates handled without off-by-one.

### Unit tests — `GratuityProvisionService` / `GratuitySettlementService`

- First provision equals full entitlement; second equals the delta only.
- Salary increase mid-year produces a catch-up provision equal to the entitlement difference.
- Salary decrease produces a negative provision.
- Re-running the job for the same month creates no duplicate row and no duplicate journal.
- Ledger running balance after a sequence of provision, adjustment, and payment entries is arithmetically correct and equals the cumulative total.
- Settlement without an exit record rejected.
- Settlement with forfeiture applies the policy's forfeiture reasons only.
- Settlement deducts an outstanding loan balance.
- Second settlement attempt rejected.
- Settlement journal balances, and the provision liability is fully relieved.

### Unit tests — `EncashmentService`

- Non-encashable type rejected.
- Eligible-days formula across six combinations of balance, retained minimum, annual cap, and already-encashed days.
- Request exceeding eligible days rejected with the eligible figure in the error details.
- Approval deducts the balance exactly once even under a repeated call.
- Exit-triggered encashment skips the employee step but still requires principal approval.
- Rejection requires a reason and changes no balance.

### Unit tests — remaining services

- `AppraisalService`: self-review forbidden, deadline enforcement, weighted score maths, KPI weights not summing to 100 rejected, anonymous feedback never returns provider identity.
- `RecruitmentService`: stage order enforcement, offer requires an open position, conversion only from accepted, filled count and closure.
- `TrainingService`: capacity, budget check, certificate gating.
- `BenefitsService`: loan schedule generation, installment capping and schedule extension, exit recovery ordering (loan before gratuity payout).

### Integration tests

| Suite | Assertions |
|---|---|
| `payroll-run.integration.spec.ts` | Run payroll for 50 seeded employees, assert slip count equals active employee count, totals match the sum of slips, lock posts one journal with DR=CR, journal appears in the ledger (mirrors HR-E2E-03) |
| `payroll-immutability.integration.spec.ts` | Every mutating endpoint against a locked run returns 409 `PAYROLL_LOCKED` — table-driven over the full route list |
| `payroll-idempotency.integration.spec.ts` | Recalculate three times, assert one slip per employee each time and no orphan lines |
| `gratuity-provision.integration.spec.ts` | Employee crosses the threshold, run the monthly job, assert the provision row, the accrual journal, and the cumulative total increment; run the job again and assert no duplication (mirrors HR-E2E-04) |
| `gratuity-settlement.integration.spec.ts` | Process an exit, settle, assert years of service and amount match the policy formula, the voucher is generated, the provision liability is relieved, and the ledger balance is zero after payment (mirrors HR-E2E-05) |
| `encashment-payroll.integration.spec.ts` | Submit, approve at both levels, process into a payroll run, assert the leave balance is reduced and the encashment appears as a payslip line in the correct month (mirrors HR-E2E-06) |
| `leave-rejection.integration.spec.ts` | Principal rejects with a reason, employee has a notification containing the reason, balance unchanged (mirrors HR-E2E-07) |
| `appraisal-cycle.integration.spec.ts` | Open a cycle, self-appraise, manager appraise, finalise, acknowledge, recommend an increment, approve, assert a new salary structure exists |
| `recruitment-to-employee.integration.spec.ts` | Requisition → approval → posting → applicant → interview → offer → accept → convert; assert the employee exists with the offered structure and the requisition closes |
| `loan-payroll.integration.spec.ts` | Disburse a 12-installment loan, run payroll for 3 months, assert three deductions and a correctly decreasing outstanding balance |
| `hr-payroll-rbac.integration.spec.ts` | An employee can read only their own payslip and gratuity; a coordinator gets 403 on all payroll routes |

### Performance tests

- `k6/scripts/payroll-run-stress.js` — exactly the TDD 18.8.3 script: `POST /hr/payroll/run` for 100 employees, 10 VU × 3 min, asserting the run is queued rather than blocking and the calculation completes within the SLA.

### Mutation testing

`PayrollCalculationService`, `GratuityCalculationService`, `StatutoryDeductionService`, `EncashmentService`, `GratuityProvisionService`, `GratuitySettlementService`, `PayrollRunService` at ≥ 75%. The two pure calculation services should target ≥ 90%, since they have no I/O to excuse surviving mutants.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] `PayrollCalculationService` and `GratuityCalculationService` contain no database, clock, or config access — verified by a lint rule banning injected repositories in those files.
- [ ] Payroll immutability proven across every mutating route.
- [ ] Gratuity ledger running balance reconciles to cumulative provisions for every employee in the seeded dataset, asserted by an integration test.
- [ ] Every payroll and gratuity journal balances, verified by running the Phase 4 integrity job after the payroll suite.
- [ ] Encashment eligibility formula documented in the code with the six tested combinations referenced.
- [ ] Statutory slab placeholders are clearly marked `TODO-GOLIVE` and listed in the Phase 9 checklist.
- [ ] A payslip PDF renders in CI with all components, gross, and net, and is asserted non-empty.
- [ ] Exit flow end-to-end: exit record → automatic encashment → gratuity settlement → loan recovery → single net settlement figure, asserted arithmetically.
