# Frontend Phase 5 — HR Advanced: Payroll, Gratuity & Encashment

| Field | Value |
|---|---|
| Duration | 4 weeks |
| Prerequisites | Frontend Phase 0, 1, 4; Backend Phase 5 contract published |
| Feature list coverage | 3.3 Leave Encashment, 3.3A Gratuity, 3.4 Payroll, 3.5 Performance, 3.6 Recruitment, 3.7 Training, 3.8 Benefits |
| Backend counterpart | [backend/06-phase5-hr-payroll-gratuity.md](../backend/06-phase5-hr-payroll-gratuity.md) |

---

## 1. Objective and scope

Complete the HR module with its money-bearing features. Two interface concerns dominate.

First, **payroll is asynchronous and irreversible once locked**, so the UI must make the run's state unmistakable at all times, show calculation progress rather than a frozen spinner, and make the lock action feel as consequential as it is.

Second, **gratuity is an accrual the user cannot see directly** — it accumulates monthly in the background. The interface's job is to make an invisible liability visible and explainable, so that when an employee leaves, the settlement figure is expected rather than surprising.

**In scope**

- Salary components, payroll groups, salary structures with approval
- Statutory deduction configuration
- Payroll run lifecycle with progress, review, approval, lock, payment, and bank file download
- Payslip viewing for HR and for the employee themselves; year-end tax certificates
- Gratuity policy configuration, entitlement views, provision history, the gratuity ledger, adjustments, exit settlement, payment
- Leave encashment: eligibility view, request, two-level approval, payroll attachment
- Performance: review cycles, KPIs, self and manager appraisal, 360 feedback, finalisation, acknowledgment, increment recommendation
- Recruitment: requisitions, postings, applicant pipeline, interview scheduling and feedback, offers, conversion to employee
- Training: programmes, enrollment, session attendance, certificates, cost tracking
- Benefits: plans, enrollments, loans and advances with repayment schedules, end-of-service summary

**Out of scope**

- HR reports and the HR dashboard — Phase 7

---

## 2. Prerequisites

- Phase 1 employee, attendance, and leave interfaces.
- Phase 4 `MoneyDisplay`, `MoneyInput`, `BudgetCheckIndicator`, and the accounting invalidation helper.
- Backend Phase 5 contract, including the payroll run status endpoint that reports calculation progress.

---

## 3. Routes and page tree

```
app/(app)/hr/                              (additions)
├── salary/
│   ├── components/page.tsx
│   ├── groups/page.tsx
│   └── statutory-deductions/page.tsx
├── employees/[id]/
│   ├── salary-structure/page.tsx
│   ├── payslips/page.tsx
│   ├── gratuity/page.tsx
│   ├── loans/page.tsx
│   ├── benefits/page.tsx
│   ├── appraisals/page.tsx
│   ├── training/page.tsx
│   └── end-of-service/page.tsx
├── payroll/
│   ├── page.tsx                           # run list
│   ├── new/page.tsx                       # create + calculate
│   ├── runs/[id]/
│   │   ├── page.tsx                       # run detail + slip list + actions
│   │   └── slips/[slipId]/page.tsx
│   ├── bonuses/page.tsx
│   └── adjustments/page.tsx
├── gratuity/
│   ├── page.tsx                           # organisation-wide entitlement overview
│   ├── policies/page.tsx
│   ├── provisions/page.tsx                # monthly provision runs
│   ├── liability/page.tsx
│   └── settlements/
│       ├── page.tsx
│       └── [id]/page.tsx
├── encashment/
│   ├── page.tsx                           # my requests + eligibility
│   ├── approvals/page.tsx
│   └── [id]/page.tsx
├── performance/
│   ├── cycles/page.tsx
│   ├── kpis/page.tsx
│   ├── appraisals/
│   │   ├── page.tsx                       # queue: mine, my reports, all
│   │   └── [id]/page.tsx                  # appraisal form (self / manager view)
│   └── increments/page.tsx
├── recruitment/
│   ├── requisitions/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── postings/page.tsx
│   ├── applicants/
│   │   ├── page.tsx                       # pipeline board
│   │   └── [id]/page.tsx
│   ├── interviews/page.tsx
│   └── offers/
│       ├── page.tsx
│       └── [id]/page.tsx
├── training/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx
│       ├── enrollments/page.tsx
│       ├── sessions/page.tsx
│       └── costs/page.tsx
└── benefits/
    ├── plans/page.tsx
    ├── loans/
    │   ├── page.tsx
    │   └── [id]/page.tsx
    └── enrollments/page.tsx

app/(app)/profile/
├── payslips/page.tsx                      # employee self-service
├── gratuity/page.tsx
├── leave-encashment/page.tsx
├── appraisals/page.tsx
└── loans/page.tsx
```

The self-service routes under `/profile` matter: every staff member needs their own payslip and leave balance without HR access, and putting them under the profile rather than inside `/hr` keeps the permission model clean.

---

## 4. Component inventory

### Salary and payroll

| Component | Notes |
|---|---|
| `SalaryComponentTable` / `SalaryComponentForm` | Component definitions with calculation type, formula, taxability, and the gratuity-affecting flag. The gratuity flag has an explanatory hint, since its consequence is not obvious. |
| `SalaryStructureBuilder` | Component lines with amounts or derived values, a live gross total, and a breakdown of earnings, deductions, and employer contributions. Percentage components show their computed value alongside the percentage so the user sees both. |
| `SalaryStructureHistory` | Effective-dated versions with the current one marked, so a salary revision's history is auditable at a glance. |
| `PayrollRunWizard` | Period and payroll group selection, then a pre-run summary: employee count, employees who will be excluded and why, pending adjustments that will be pulled in (encashments, bonuses, loan installments), and the budget check result. Only then the calculate action. Users should never trigger a payroll run without knowing what it will contain. |
| `PayrollRunStatusBanner` | The state indicator, present on every run page. Draft, Calculating, Calculated, Approved, **Locked**, Paid, Cancelled. The Locked state is visually distinct and carries the text "This run is locked. No changes are possible. Corrections require a supplementary run or a next-period adjustment." — stated once, prominently, so nobody hunts for a disabled edit button. |
| `PayrollCalculationProgress` | Polls the run status and shows a determinate progress indicator with the employee count processed. A payroll run for 100 employees takes time; an indeterminate spinner makes users reload and retrigger. |
| `PayrollSlipTable` | Per-employee row: working days, present, LOP days, gross, deductions, net. Sortable, filterable by department, with totals in a footer that must equal the run header's totals — displayed with a match indicator. |
| `PayrollSlipDetail` | Full component-by-component breakdown grouped into earnings, deductions, and employer contributions, with the calculation note per line where the backend provides one. This is what an employee queries when they disagree with their net pay, so the arithmetic must be legible. |
| `PayrollApprovalBar` | Approve, Lock, Mark Paid — role-filtered and state-filtered. |
| `PayrollLockDialog` | The most consequential confirmation in the module. States the totals, the employee count, and that the action posts the payroll journal and is irreversible. Requires typing "LOCK" to confirm. |
| `NegativeNetPayAlert` | When the calculation reports employees whose deductions exceed gross, this lists them with the shortfall and links to the adjustment that should be changed. Blocking without explanation would leave HR stuck. |
| `BankTransferFileButton` | Available only after lock; downloads the generated file and shows its record count and checksum. |
| `BonusForm` / `BonusApprovalQueue` | Type, amount, applicable month, reason; approval by principal. |
| `PayrollAdjustmentForm` | One-off addition or deduction with a source indicator distinguishing manual entries from system-generated ones (encashment, loan recovery), which are shown read-only. |
| `TaxCertificateView` | Year-end summary with a download action. |

### Gratuity

| Component | Notes |
|---|---|
| `GratuityPolicyForm` | Minimum service years, applicable employment types, days per year of service, salary basis, proration method, maximum years counted, forfeiture rules. A **live example calculation** panel shows what the policy would produce for a sample salary and service length — the only reliable way to confirm a policy was configured as intended. |
| `GratuityOverviewTable` | Organisation-wide: employee, service years, eligibility, current entitlement, cumulative provision. Filterable by eligibility. |
| `GratuityEmployeeCard` | For one employee: service years, eligibility status with the threshold stated, salary basis amount, current entitlement, cumulative provision, and — critically — a **calculation breakdown** showing the formula with the actual numbers substituted. An employee asking "why is my gratuity this amount" gets an answer from the screen. |
| `GratuityProvisionHistoryChart` | Cumulative provision over time with monthly deltas, and an accessible table alternative. |
| `GratuityLedgerTable` | Entry date, type (provision, adjustment, payment, forfeiture), signed amount, running balance, reference. The running balance column is what makes the accrual auditable. |
| `GratuityProvisionRunPanel` | Month selector, a pre-run summary of eligible employees and the expected total provision, run action, and the result with per-employee deltas. Re-running shows that nothing new was created. |
| `GratuityAdjustmentDialog` | Amount (signed), reason, principal approval requirement stated. |
| `GratuitySettlementWizard` | Step 1 shows the computed entitlement with the full breakdown; step 2 shows forfeiture, if the policy applies it, with the reason; step 3 shows deductions (outstanding loans and advances) itemised; step 4 shows the net settlement figure and the resulting journal preview. The user sees how the number was reached at every step rather than being handed a total. |
| `GratuityLiabilityView` | Cumulative organisational liability as of a date, by department, with the provision account balance shown alongside for verification. |
| `SettlementLetterButton` | Downloads the generated settlement letter. |

### Encashment

| Component | Notes |
|---|---|
| `EncashmentEligibilityCard` | Per encashable leave type: available balance, minimum to retain, annual cap, already encashed this year, and the resulting eligible days — each figure labelled. Eligibility is a four-variable calculation, and showing only the answer generates disputes. |
| `EncashmentRequestForm` | Type selector limited to encashable types, days input capped at eligible days with the cap stated, and a live computed amount using the per-day rate, which is also shown. |
| `EncashmentApprovalQueue` | Two-level: HR pending and principal pending, in separate tabs with counts. |
| `EncashmentApprovalDialog` | Approve or reject; a reject requires a reason; approval states that the days will be deducted from the balance and the amount added to the specified payroll month. |
| `EncashmentStatusTimeline` | Requested, HR approved, principal approved, processed — with dates and actors, and the linked payroll run once processed. |

### Performance

| Component | Notes |
|---|---|
| `ReviewCycleForm` / `ReviewCycleTable` | Period, deadlines, status, with an open action that reports how many appraisals will be generated. |
| `KpiTable` / `KpiForm` | Name, department, designation, measurement type, weight. A **weight total indicator per role** flags when weights do not sum to 100, since the score calculation depends on it. |
| `AppraisalForm` | Renders differently by viewer: the employee sees self-score inputs and read-only manager scores once submitted; the manager sees manager-score inputs alongside the employee's self-scores for context. A weighted score preview updates live. Deadline state is shown, and past-deadline fields are read-only with the reason stated. |
| `AppraisalWorkflowBar` | Submit self, submit manager, finalise, acknowledge — role and state filtered. |
| `Feedback360Form` | Structured responses with an anonymity indicator that clearly states whether the response will be attributed. |
| `Feedback360Summary` | Aggregated responses. For anonymous responses, no provider identity is rendered anywhere — asserted by test, since a leak here damages trust irreparably. |
| `IncrementRecommendationForm` | Percentage or amount with the resulting new salary shown, plus justification. |
| `IncrementApprovalQueue` | Principal queue with the financial impact per recommendation and an aggregate total. |

### Recruitment

| Component | Notes |
|---|---|
| `RequisitionForm` | Title, department, designation, positions, employment type, salary range, justification, required-by date, and the `BudgetCheckIndicator` against the salary budget line so the requester sees the constraint before submitting. |
| `RequisitionApprovalBar` | Principal approve or reject with a reason. |
| `JobPostingForm` | Description, requirements, dates, channels. |
| `ApplicantPipelineBoard` | Kanban-style columns for the eight stages with counts, drag-to-advance for permitted roles, and a keyboard-accessible stage-change action on each card. Backward moves require a reason. |
| `ApplicantDetail` | Profile, resume preview, interview history with feedback, and the stage timeline. |
| `InterviewScheduleForm` | Round, type, date and time, duration, mode, location, panel selection. Panel members' conflicting interviews are flagged, since double-booking an interviewer is the common failure here. |
| `InterviewFeedbackForm` | Ratings, notes, and a recommendation of proceed, hold, or reject. |
| `OfferForm` | Designation, department, salary structure builder reused from the salary section, joining date, validity. |
| `OfferStatusBar` | Draft, sent, accepted, declined, expired, withdrawn, with the appropriate actions. |
| `ApplicantConvertDialog` | Available only for an accepted offer; previews the employee record that will be created from the offer and states that the requisition's filled count will increment. |

### Training and benefits

| Component | Notes |
|---|---|
| `TrainingProgramForm` | Details, capacity, cost per participant, total budget, with the `BudgetCheckIndicator` against the training budget line. |
| `TrainingEnrollmentPanel` | Multi-employee enrollment with a capacity indicator and a per-employee outcome list, following the same partial-success pattern as group therapy enrollment. |
| `TrainingSessionAttendance` | Per-session attendance using the established attendance grid interaction model. |
| `CertificateUploadDialog` | Available only for an attended enrollment, with the restriction explained. |
| `TrainingCostTable` | Cost lines by type with the posted journal link. |
| `BenefitPlanForm` / `BenefitEnrollmentPanel` | Plan details with policy expiry indicators; enrollment with dependents. |
| `LoanRequestForm` | Type, principal, interest rate, installment count, with a **live repayment schedule preview** showing every installment and the total repayable. A loan agreed without seeing the schedule is a loan misunderstood. |
| `LoanScheduleTable` | Installment number, due month, scheduled amount, paid amount, status, and the payroll slip link where deducted. |
| `LoanRepaymentWaiveDialog` | Principal only; reason required. |
| `EndOfServiceSummary` | Gratuity settlement, automatic encashment, outstanding loan recovery, and the resulting net settlement, each itemised with links to its source. This is the screen that closes an employee's file, and it must reconcile visibly. |

---

## 5. Server state

### Query keys

```typescript
hr: {
  salary: { components: [...], groups: [...], statutory: [...],
            structure: (empId) => [...], structureHistory: (empId) => [...] },
  payroll: { runs: (f) => [...], run: (id) => [...], runStatus: (id) => [...],
             slips: (runId) => [...], slip: (id) => [...],
             employeeSlips: (empId) => [...], bonuses: (f) => [...],
             adjustments: (f) => [...], taxCertificate: (empId, year) => [...] },
  gratuity: { policies: [...], overview: (f) => [...], employee: (empId) => [...],
              ledger: (empId) => [...], provisions: (period) => [...],
              liability: (asOf) => [...], settlements: (f) => [...], settlement: (id) => [...] },
  encashment: { eligibility: (empId) => [...], requests: (f) => [...],
                request: (id) => [...], approvals: (level) => [...] },
  performance: { cycles: [...], kpis: (f) => [...], appraisals: (f) => [...],
                 appraisal: (id) => [...], feedback360: (id) => [...],
                 increments: (f) => [...] },
  recruitment: { requisitions: (f) => [...], requisition: (id) => [...],
                 postings: (f) => [...], applicants: (f) => [...],
                 applicant: (id) => [...], interviews: (f) => [...],
                 offers: (f) => [...], offer: (id) => [...] },
  training: { programs: (f) => [...], program: (id) => [...],
              enrollments: (id) => [...], sessions: (id) => [...], costs: (id) => [...] },
  benefits: { plans: [...], enrollments: (empId) => [...],
              loans: (f) => [...], loan: (id) => [...], schedule: (loanId) => [...],
              endOfService: (empId) => [...] },
}
```

### The payroll run status query

`usePayrollRunStatus(id)` is the one polling query in this phase.

- `refetchInterval` is `2000` while the status is `calculating` and `false` otherwise, so polling stops the moment the calculation finishes.
- On transition from `calculating` to `calculated`, it invalidates `payroll.run`, `payroll.slips`, and clears the progress component.
- A calculation that fails surfaces the error with the affected employees rather than reverting to Draft silently.

### Invalidation

| Mutation | Invalidates |
|---|---|
| Approve a salary structure | `salary.structure`, `salary.structureHistory`, `gratuity.employee` (entitlement recalculates), `gratuity.overview` |
| Create or recalculate a payroll run | `payroll.runs`, `payroll.run`, `payroll.slips`, `payroll.runStatus` |
| Approve a run | `payroll.run`, `payroll.runs` |
| **Lock a run** | `payroll.run`, `payroll.runs`, `payroll.slips`, plus `invalidateAccountingViews()` because the lock posts the payroll journal, plus `benefits.loan` and `benefits.schedule` because installments are recorded, plus `encashment.requests` because attached encashments become processed |
| Mark a run paid | `payroll.run`, `payroll.runs`, `payroll.slips`, `invalidateAccountingViews()` |
| Run monthly gratuity provisions | `gratuity.provisions`, `gratuity.overview`, `gratuity.employee` (all), `gratuity.ledger`, `gratuity.liability`, `invalidateAccountingViews()` |
| Gratuity adjustment | `gratuity.employee`, `gratuity.ledger`, `gratuity.liability`, `invalidateAccountingViews()` |
| Settle gratuity | `gratuity.settlements`, `gratuity.employee`, `gratuity.ledger`, `gratuity.liability`, `benefits.endOfService`, `invalidateAccountingViews()` |
| Approve an encashment | `encashment.requests`, `encashment.approvals`, `encashment.eligibility`, `hr.leave.balances`, `payroll.adjustments` |
| Finalise an appraisal | `performance.appraisals`, `performance.appraisal` |
| Approve an increment | `performance.increments`, `salary.structure`, `salary.structureHistory`, `gratuity.employee` |
| Approve a requisition | `recruitment.requisitions`, `budgets.check` |
| Convert an applicant | `recruitment.applicants`, `recruitment.requisition`, `hr.employees.list`, `salary.structure` |
| Disburse a loan | `benefits.loans`, `benefits.loan`, `benefits.schedule`, `invalidateAccountingViews()` |
| Post a training cost | `training.costs`, `invalidateAccountingViews()`, `budgets.variance` |

The payroll lock row is the widest invalidation in the application, and it is worth writing out explicitly rather than leaving a developer to discover the loan-schedule and encashment consequences later.

---

## 6. Client state

- `payrollRunStore` — the run being viewed, its polling state, and whether the lock confirmation is in progress.
- `salaryStructureDraftStore` — the structure builder grid.
- `appraisalDraftStore` — self and manager appraisal drafts with autosave, since appraisals are written thoughtfully over time.
- `budgetDraftStore` reused for the training programme budget.
- `filterStore` additions for the payroll run list, gratuity overview, applicant pipeline, and appraisal queue.

---

## 7. Forms and validation

| Form | Notable rules |
|---|---|
| Salary component | Code unique; percentage-based components require a base selection; a formula component requires a valid expression validated server-side with the error mapped back to the field |
| Salary structure | At least one earning component; gross positive; effective-from date required and not overlapping the current structure without superseding it |
| Payroll run creation | Period and group required; a duplicate period and group combination is blocked client-side with a link to the existing run |
| Payroll lock | Typed confirmation "LOCK" required; blocked unless the run is Approved |
| Bonus | Amount positive; applicable month within an open payroll period; reason required |
| Payroll adjustment | Amount positive; type required; reason required; system-sourced adjustments are read-only |
| Gratuity policy | Minimum service years non-negative; days per year positive; at least one applicable employment type; the live example must compute successfully before submit |
| Gratuity adjustment | Amount non-zero; reason minimum 20 characters |
| Gratuity settlement | Blocked without an exit record, with a link to create one; every step must be reviewed before the final action |
| Encashment request | Type from the encashable set; days positive and not exceeding eligible days, with the eligible figure stated in the error; the computed amount displayed before submit |
| Encashment rejection | Reason minimum 10 characters |
| Review cycle | Period valid; self deadline before the manager deadline; both before the cycle end |
| KPI | Weight 0–100; the per-role total must equal 100 to activate, with the current total shown |
| Appraisal | Every KPI scored before submit; overall rating required; the manager form requires strengths and improvement areas |
| Increment recommendation | Percentage or amount positive; justification minimum 20 characters |
| Requisition | Positions ≥ 1; salary range min ≤ max; justification minimum 20 characters; required-by date in the future |
| Interview | Date and time in the future; duration positive; at least one panel member; a panel conflict warning shown but not blocking, since an interviewer may legitimately accept overlap |
| Offer | Joining date in the future; validity date before the joining date; salary structure complete |
| Training programme | Dates valid; capacity ≥ 1; cost non-negative; the budget check result shown |
| Loan | Principal positive; installment count ≥ 1; installment × count ≥ principal, with the shortfall stated if not; first deduction month not in the past; the schedule preview must render before submit |
| Loan waiver | Reason minimum 20 characters |

---

## 8. RBAC visibility

| Element | Visible to |
|---|---|
| Salary components, groups, statutory deductions | hr_officer, super_admin |
| Salary structure view | hr_officer, super_admin, accountant (read), the employee themselves |
| Salary structure create | hr_officer |
| Salary structure approve | principal, hr_officer |
| Payroll run list and detail | hr_officer, accountant, principal (read) |
| Payroll run create and recalculate | hr_officer |
| Payroll approve | principal |
| Payroll lock | hr_officer, principal |
| Mark paid, bank file | accountant, hr_officer |
| Payslip — all employees | hr_officer, accountant |
| Payslip — own | every employee, via `/profile/payslips` |
| Gratuity policy | super_admin, principal, hr_officer |
| Gratuity overview and liability | hr_officer, accountant, principal |
| Gratuity — own | every employee, via `/profile/gratuity` |
| Gratuity adjustment | hr_officer with principal approval |
| Gratuity settlement | hr_officer, principal |
| Encashment request | every employee, for themselves |
| Encashment approval level 1 | hr_officer |
| Encashment approval level 2 | principal |
| Review cycles and KPIs | hr_officer, principal |
| Appraisal — self | the employee |
| Appraisal — manager section | the reporting manager |
| Appraisal finalise | hr_officer, principal |
| Increment approve | principal |
| Requisition create | hr_officer, department heads |
| Requisition approve | principal |
| Applicant pipeline, interviews, offers | hr_officer; panel members see their own interviews |
| Offer send | hr_officer, principal |
| Training management | hr_officer |
| Benefit plans | hr_officer, super_admin |
| Loan request | every employee, for themselves |
| Loan approve | principal |
| Loan disburse | accountant |
| End-of-service summary | hr_officer, principal |

**Salary confidentiality** is the sharpest RBAC concern in this phase. Salary figures appear in the employee profile, the structure builder, payslips, offers, and increment recommendations. Every one of these surfaces is gated, and a component test asserts that a non-permitted role sees no salary figure — not a masked value, not a zero, but no field at all.

---

## 9. Accessibility and responsive requirements

| Item | Requirement |
|---|---|
| Payroll run status | The status banner is a `role="status"` region; a transition from Calculating to Calculated is announced |
| Calculation progress | Determinate progress with `aria-valuenow` and a text count ("Processed 64 of 100 employees") |
| Lock dialog | The consequence is stated before the confirmation input; the typed confirmation field is labelled explicitly |
| Payslip breakdown | A real table grouped with row-group headings for earnings, deductions, and employer contributions; totals rows marked; the net figure has an accessible name including the currency |
| Slip table totals match | The match between the slip totals and the run header stated in text |
| Gratuity calculation breakdown | Rendered as a definition list with the formula in text, not as an image or a colour-coded diagram |
| Gratuity ledger | The running balance column has a clear header; signed amounts are stated as credit or debit in text, not conveyed by colour or a bare minus sign alone |
| Provision chart | Accessible table alternative required |
| Encashment eligibility | Each of the four contributing figures separately labelled; the resulting eligible days announced when the type changes |
| Settlement wizard | Step position announced; each step's figures readable in sequence; the final net figure announced |
| Appraisal form | Self and manager score inputs distinguished by accessible name; the weighted score preview in a live region; deadline state stated in text |
| 360 anonymity | The anonymity state stated in text on the form before submission |
| Pipeline board | Columns are labelled regions with counts in the heading; each card has a keyboard-accessible stage-change action; drag is never the only path; a stage change is announced |
| Loan schedule | A real table; the total repayable stated in text |
| Mobile payroll run | Slip table becomes stacked cards; the status banner and lock action remain prominent; the bank file action is available |
| Mobile payslip | Component groups as an accordion with the net figure pinned |
| Mobile pipeline | Columns become a single filterable list with a stage selector |
| Mobile settlement wizard | Single-column steps with a sticky next action |
| Mobile self-service | `/profile/payslips` and `/profile/gratuity` are mobile-first, since employees will most often check these on a phone |

---

## 10. Tests owed by this phase

### Component tests

| Target | Scenarios |
|---|---|
| `SalaryStructureBuilder` | Percentage components show both the percentage and the computed value; gross updates live; validation on an empty earning set; salary fields absent for a non-permitted role |
| `PayrollRunWizard` | Pre-run summary lists excluded employees with reasons and pending adjustments; duplicate period blocked with a link to the existing run; the budget check result renders |
| `PayrollRunStatusBanner` | Each state renders with its label; the Locked state shows the full explanatory text; the state change is announced |
| `PayrollCalculationProgress` | Polls while calculating; stops on completion; shows a determinate count; a failure surfaces the affected employees |
| `PayrollSlipTable` | Totals equal the sum of rows and the match with the run header is stated; department filter; sorting |
| `PayrollSlipDetail` | Component grouping correct; calculation notes rendered; net equals gross minus deductions, asserted against a fixture |
| `PayrollApprovalBar` | For each role and state, exactly the permitted actions render; Lock absent before approval |
| `PayrollLockDialog` | Typed confirmation required; the exact string enforced; totals and irreversibility stated |
| `NegativeNetPayAlert` | Lists affected employees with shortfalls and links to the adjustments |
| Locked-run immutability | Every editing affordance on a locked run is absent — asserted across the slip table, adjustment attachment, and recalculate action |
| `GratuityPolicyForm` | The live example computes and updates as fields change; an invalid policy blocks submit |
| `GratuityEmployeeCard` | The calculation breakdown substitutes actual values; ineligible employees show the threshold and the shortfall in service years |
| `GratuityLedgerTable` | Running balance arithmetic across a sequence of provision, adjustment, and payment entries; signed amounts stated in text |
| `GratuityProvisionRunPanel` | Pre-run summary shows eligible count and expected total; the result shows per-employee deltas; a re-run reports nothing new |
| `GratuitySettlementWizard` | Each step renders its figures; blocked without an exit record with a link to create one; forfeiture step appears only when the policy applies; deductions itemised; the net figure equals entitlement minus forfeiture minus deductions, asserted against a fixture |
| `EncashmentEligibilityCard` | All four contributing figures labelled; the eligible figure matches a hand-computed fixture across six combinations |
| `EncashmentRequestForm` | Days capped at eligible with the cap stated; the amount computes live from the shown per-day rate; a non-encashable type is absent from the selector |
| `EncashmentStatusTimeline` | All four stages with dates and actors; the payroll run link appears once processed |
| `AppraisalForm` | The employee view shows self inputs and read-only manager scores; the manager view shows both; a past deadline renders read-only with the reason; the weighted score preview matches the KPI weights; an employee cannot open their own manager section |
| `Feedback360Summary` | No provider identity is rendered for anonymous responses — asserted by scanning the rendered output for the provider name |
| `KpiTable` | The per-role weight total indicator flags a non-100 total |
| `IncrementRecommendationForm` | The resulting new salary displayed; justification required |
| `RequisitionForm` | The budget check indicator renders and warns on an over-budget requisition |
| `ApplicantPipelineBoard` | Stage counts correct; forward advance via the keyboard action; a backward move requires a reason; drag emits the same intent as the keyboard action; stage change announced |
| `InterviewScheduleForm` | A panel conflict is flagged but not blocking; past date and time blocked |
| `ApplicantConvertDialog` | Available only for an accepted offer; previews the employee record; states the requisition effect |
| `LoanRequestForm` | The schedule preview renders every installment; installment × count below principal blocks with the shortfall stated |
| `LoanScheduleTable` | Statuses render; the payroll slip link appears for deducted installments; the total repayable stated |
| `EndOfServiceSummary` | Gratuity, encashment, and loan recovery itemised; the net figure reconciles, asserted against a fixture |
| Salary confidentiality | For each of the nine roles, assert that salary figures are present or entirely absent per the permission matrix, across the employee profile, structure builder, payslip, offer form, and increment form |

### Hook tests

- `usePayrollRunStatus`: polls at 2 s while calculating, stops on completion, invalidates the run and slips on transition.
- The payroll lock mutation's invalidation set asserted in full, including `invalidateAccountingViews`, the loan schedule, and encashment requests.
- The gratuity provision run's invalidation set including the accounting views and the liability view.
- Salary structure approval invalidating the gratuity entitlement.

### E2E scenarios

| ID | Scenario |
|---|---|
| `PAY-E2E-01` | Create a payroll run for 50 employees → the pre-run summary lists exclusions → calculate → progress shows and completes → review slips → totals match the header → principal approves → lock with the typed confirmation → the payroll journal appears in the ledger (mirrors TDD HR-E2E-03) |
| `PAY-E2E-02` | Attempt every editing action on a locked run → each is unavailable and the explanatory text is present |
| `PAY-E2E-03` | A calculation reporting negative net pay lists the affected employees → adjust → recalculate → succeeds |
| `PAY-E2E-04` | An employee views their own payslip via `/profile/payslips` and cannot access another employee's |
| `PAY-E2E-05` | Download the bank transfer file after lock; the action is unavailable before lock |
| `GRA-E2E-01` | Configure a gratuity policy with the live example confirming the intended figures → an employee crosses the eligibility threshold → run the monthly provision → the provision appears in the ledger with the correct running balance → the liability view increases (mirrors HR-E2E-04) |
| `GRA-E2E-02` | Process an employee exit → settle gratuity through the wizard → each step's figures reconcile → the net settlement matches the formula → the settlement letter downloads (mirrors HR-E2E-05) |
| `GRA-E2E-03` | Re-run the monthly provision for the same month → the panel reports nothing new created |
| `GRA-E2E-04` | An employee views their own gratuity entitlement with the calculation breakdown |
| `ENC-E2E-01` | View encashment eligibility → request days at the cap → HR approves → principal approves → attach to a payroll run → lock → the leave balance is reduced and the encashment appears as a payslip line (mirrors HR-E2E-06) |
| `ENC-E2E-02` | Request more days than eligible → blocked with the eligible figure stated |
| `PRF-E2E-01` | Open a review cycle → the employee self-appraises → the manager appraises → finalise → the employee acknowledges → recommend an increment → principal approves → a new salary structure exists |
| `PRF-E2E-02` | Anonymous 360 feedback is submitted and the summary reveals no provider identity |
| `REC-E2E-01` | Raise a requisition → the budget indicator warns → principal approves → post the job → add an applicant → advance through the pipeline by keyboard → schedule an interview → record feedback → send an offer → mark accepted → convert to an employee with the offered structure |
| `BEN-E2E-01` | Request a loan → the schedule preview renders → principal approves → accountant disburses → run payroll for three months → three installments are deducted and the outstanding balance decreases correctly |
| `BEN-E2E-02` | End-of-service summary for an exiting employee reconciles gratuity, encashment, and loan recovery to a single net figure |
| `RBAC-E2E-04` | Coordinator role: no access to payroll, gratuity, or salary structures; can see their own payslip and request encashment |
| `A11Y-E2E-06` | Keyboard-only: complete a self-appraisal and advance an applicant through two pipeline stages |

### Accessibility tests

- `jest-axe` on every component in section 4.
- Full-page axe scan on: payroll run list, run detail, slip detail, gratuity overview, gratuity employee page, gratuity ledger, provision run panel, settlement wizard (each step), encashment eligibility and request, appraisal form in both views, KPI table, pipeline board, interview form, offer form, training programme, loan detail, end-of-service summary, and both self-service pages.
- Live-region assertions for the payroll status transition, calculation progress, weighted score preview, and encashment eligibility change.

### Visual regression

Baselines for: the payroll run in each of its seven states with particular attention to Locked; the calculation progress state; the slip table with totals; the slip detail breakdown; the gratuity policy form with its live example; the gratuity employee card with the calculation breakdown; the gratuity ledger; the settlement wizard steps; the encashment eligibility card; the appraisal form in employee and manager views; the pipeline board; the loan schedule preview; the end-of-service summary; and mobile viewports of the payroll run detail, payslip, and self-service pages.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] The Locked payroll state is unmistakable and every editing affordance is absent, proven by `PAY-E2E-02`.
- [ ] The lock action requires a typed confirmation and states the totals and irreversibility.
- [ ] Calculation progress is determinate with a processed count; no indeterminate spinner is used for payroll.
- [ ] Slip totals match the run header and the match is stated in text.
- [ ] The gratuity policy form's live example lets an administrator verify the configuration before saving.
- [ ] Every gratuity figure shown to a user is accompanied by a calculation breakdown with actual values substituted.
- [ ] The gratuity ledger running balance reconciles and is asserted against a fixture.
- [ ] The settlement wizard shows the derivation at every step, and the net figure reconciles.
- [ ] Encashment eligibility shows all four contributing figures, matching hand-computed fixtures across six combinations.
- [ ] Anonymous 360 feedback never renders a provider identity, asserted by output scanning.
- [ ] The salary confidentiality matrix test passes for all nine roles across all five salary surfaces.
- [ ] The payroll lock invalidation set is complete, including accounting views, loan schedules, and encashment status.
- [ ] Self-service payslip and gratuity pages are mobile-first and usable at 360px.
- [ ] Zero axe violations on all 20 scanned pages.
