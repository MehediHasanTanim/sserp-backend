# Backend Phase 1 — HR & School Core

| Field | Value |
|---|---|
| Duration | 6 weeks |
| Prerequisites | Phase 0 merged |
| Feature list coverage | 1.1, 1.2, 1.3, 1.4, 1.5, 1.9, 1.10 (academic year), 3.1, 3.2, 3.3 (leave + holiday master) |
| TDD sections | 6.2, 6.4, 7.3 (School/HR), 8.4, 9.2 |

---

## 1. Objective and scope

Establish the two identity sources of truth — **HR owns employees, School owns students** — and deliver the daily operational core: enrollment with the admission-fee activation gate, the shift-capped student–teacher mapping, the substitute workflow driven by HR absence and approved leave, and attendance on both sides with holiday exclusion.

This phase contains the two most rule-dense features in the whole system: the **shift cap** and the **admission fee gate**. Both are cited repeatedly in the TDD test strategy. Treat their invariants as the phase's primary risk.

**In scope**

- HR: employees, employment lifecycle, documents, contracts, probation, exit; daily attendance; leave types, balances, applications, multi-level approval; holiday master
- School: academic years, shifts, students, guardians, admission fees, teacher profiles, student–teacher mapping, substitute assignment, student attendance

**Out of scope**

- IEP, progress reports, tuition fee structures, outdoor activities, parent portal — Phase 2
- Payroll, gratuity, encashment, performance, recruitment, training, benefits — Phase 5
- Real ledger posting — admission fee payments write to `pending_ledger_postings` through `LedgerPort`

---

## 2. Prerequisites

- Phase 0 auth, RBAC, audit, numbering, files, `LedgerPort`, `NotificationPort`.
- `users.employee_id` foreign key constraint is added in this phase's first migration, now that `employees` exists.

---

## 3. Prisma schema additions

### HR

#### `employees`
Per TDD 6.4, extended for the feature list. `id`, `employee_code` (unique, from `NumberingService`), `full_name`, `date_of_birth`, `gender`, `national_id`, `personal_email`, `phone`, `address JSONB`, `photo_attachment_id`, `department` (`school`|`therapy`|`administration`|`support`), `designation`, `employment_type` (`permanent`|`contractual`|`part_time`), `reporting_manager_id` (self FK), `joining_date`, `probation_end_date`, `confirmation_date`, `basic_salary INTEGER`, `status` (`active`|`on_probation`|`on_notice`|`resigned`|`terminated`|`retired`), `deleted_at`.

#### `employee_contracts`
`id`, `employee_id`, `contract_type`, `start_date`, `end_date`, `attachment_id`, `is_current`. Expiry alerts consume `end_date` (job added in Phase 5, event contract defined here).

#### `employee_documents`
`id`, `employee_id`, `document_type` (`nid`|`qualification`|`police_clearance`|`offer_letter`|`other`), `attachment_id`, `issued_date`, `expiry_date`, `notes`. Backs the "document vault" (3.1).

#### `employee_history`
`id`, `employee_id`, `change_type` (`transfer`|`promotion`|`designation_change`|`salary_change`|`status_change`), `effective_date`, `from_value JSONB`, `to_value JSONB`, `reason`, `recorded_by`.

#### `employee_exits`
`id`, `employee_id` (unique), `exit_type` (`resignation`|`termination`|`retirement`), `notice_date`, `last_working_day`, `exit_interview_notes`, `clearance_checklist JSONB`, `status` (`in_progress`|`completed`).

#### `hr_shifts`
Employee work shifts, distinct from school teaching shifts. `id`, `name`, `start_time`, `end_time`, `grace_minutes`.

#### `employee_shift_assignments`
`id`, `employee_id`, `hr_shift_id`, `effective_from`, `effective_to`.

#### `hr_attendance`
`id`, `employee_id`, `attendance_date DATE`, `status` (`present`|`absent`|`late`|`half_day`|`on_duty`|`holiday`|`leave`), `check_in TIMESTAMPTZ`, `check_out TIMESTAMPTZ`, `overtime_minutes`, `late_minutes`, `source` (`manual`|`biometric`), `remarks`, `marked_by`. Unique `(employee_id, attendance_date)`.

#### `leave_types`
`id`, `code`, `name`, `is_paid`, `annual_entitlement_days`, `carry_forward_allowed`, `max_carry_forward_days`, `requires_medical_certificate_after_days`, `is_encashable`, `max_encashable_days_per_year`, `min_balance_to_retain`, `applies_to_employment_types TEXT[]`, `is_active`.

Seeded with the eight types in feature list 3.3.

#### `leave_balances`
`id`, `employee_id`, `leave_type_id`, `year`, `entitled_days NUMERIC(5,2)`, `carried_forward_days`, `consumed_days`, `encashed_days`, `pending_days` (soft-held while an application awaits approval). Unique `(employee_id, leave_type_id, year)`.

#### `hr_leave_requests`
Per TDD 6.4 plus: `total_days NUMERIC(5,2)`, `is_half_day`, `medical_certificate_attachment_id`, `current_approval_level`, `rejected_reason`, `cancelled_at`.

#### `leave_approval_steps`
`id`, `leave_request_id`, `level`, `approver_role`, `approver_user_id`, `decision` (`pending`|`approved`|`rejected`), `decided_at`, `comment`. Supports the multi-level workflow required by 3.3.

#### `holidays`
`id`, `name`, `holiday_date DATE`, `type` (`public`|`school`|`optional`), `academic_year_id` (nullable), `applies_to_departments TEXT[]`, `description`. Unique `(holiday_date, type)`. **This is the holiday master feeding school attendance (feature 1.9).**

### School

#### `academic_years`
Per TDD 6.2 plus `status` (`planning`|`active`|`closed`). Partial unique index enforcing a single `is_current = true`.

#### `academic_terms`
`id`, `academic_year_id`, `name`, `start_date`, `end_date`, `sequence`. Backs 1.10 term configuration.

#### `shifts`
Per TDD 6.2 plus `capacity_limit INTEGER`, `break_start TIME`, `break_end TIME`, `working_hours NUMERIC(4,2)`, `is_active`. Seeded with Morning and Day.

#### `students`
Per TDD 6.2, extended: `nationality`, `religion`, `photo_attachment_id`, `blood_group`, `previous_institution`, `previous_therapy_history TEXT`, `support_needs TEXT`, `admission_date`, `status_reason` (mandatory when status is set manually), plus audit and `deleted_at`.

`status` ∈ `pending_admission_fee` | `active` | `on_leave` | `inactive` | `graduated` | `transferred` | `withdrawn`.

#### `student_status_history`
`id`, `student_id`, `from_status`, `to_status`, `reason`, `changed_by`, `changed_at`, `is_manual_override`. Every transition is recorded; manual overrides require a reason (feature 1.2).

#### `student_guardians`
Per TDD 6.2 plus `occupation`, `national_id`, `address`, `is_emergency_contact`, `emergency_priority` (1 = primary, 2 = secondary), `portal_access_enabled`.

#### `student_documents`
`id`, `student_id`, `document_type` (`birth_certificate`|`disability_certificate`|`doctor_report`|`previous_iep`|`photo`|`other`), `attachment_id`, `issued_date`, `notes`.

#### `student_enrollments`
Supports re-enrollment across academic years (feature 1.2). `id`, `student_id`, `academic_year_id`, `shift_id`, `enrollment_date`, `status` (`enrolled`|`carried_forward`|`completed`|`withdrawn`). Unique `(student_id, academic_year_id)`.

#### `admission_fee_settings`
`id`, `academic_year_id`, `student_category` (nullable — null means global default), `amount INTEGER`, `is_active`. Backs "configurable globally or per student category" (1.2).

#### `admission_fees`
Per TDD 6.2 plus `payment_method` (`cash`|`bank_transfer`|`cheque`|`online`), `payment_reference`, `paid_amount INTEGER`, `recorded_by`, `attachment_id` (bank slip).

#### `teachers`
School-specific profile layered over the HR employee (feature 1.3). `id`, `employee_id` (unique FK), `specialization_areas TEXT[]`, `teaching_methodology`, `years_experience_special_needs`, `status` (`active`|`on_leave`|`resigned`|`transferred`). Name/contact/designation are **never duplicated** — they are read from `employees` through `HrEmployeeReadService`.

#### `teacher_certifications`
`id`, `teacher_id`, `title`, `issuing_body`, `issued_date`, `expiry_date`, `attachment_id`.

#### `teacher_shift_assignments`
`id`, `teacher_id`, `shift_id`, `effective_from`, `effective_to`, `is_active`. Unique partial index on `(teacher_id, shift_id)` where `is_active`. A teacher may hold at most two rows — one per shift.

#### `student_teacher_mappings`
Per TDD 6.2 plus `mapping_type` (`primary`), `created_reason`, `ended_reason`.

Critical constraints:
- Partial unique index `(teacher_employee_id, shift_id) WHERE is_active` — a teacher can hold only one active mapping per shift.
- Partial unique index `(student_id) WHERE is_active` — a student has exactly one active primary teacher.

Database-level uniqueness is a backstop; the service layer produces the friendly `SHIFT_CAP_EXCEEDED` error first.

#### `substitute_assignments`
Per TDD 6.2 plus `status` (`pending`|`assigned`|`auto_reverted`|`cancelled`), `reverted_at`, `notes`. Note there is **no** partial unique index on substitute teacher + shift: feature 1.4 explicitly permits a substitute to cover multiple students across shifts.

#### `student_attendance`
Per TDD 6.2 plus `remarks`, `is_amended`, `amended_by`, `amended_at`, `amendment_reason`, `amendment_approved_by`. Unique `(student_id, attendance_date)`.

#### `attendance_amendments`
`id`, `attendance_id`, `previous_status`, `requested_status`, `reason`, `requested_by`, `status` (`pending`|`approved`|`rejected`), `reviewed_by`, `reviewed_at`. Backs "attendance correction with approval" (1.5).

#### `attendance_settings`
`id`, `academic_year_id`, `freeze_after_days INTEGER` (default 7), `allow_teacher_marking BOOLEAN`, `unauthorized_absence_alert_enabled BOOLEAN`.

### Indexes added

Per TDD 6.7 plus this phase's access patterns:

```
students (student_code), (status), (shift_id), (academic_year_id, status)
student_attendance (student_id, attendance_date), (attendance_date), (shift_id, attendance_date)
student_teacher_mappings (teacher_employee_id, is_active), (student_id, is_active)
substitute_assignments (start_date, end_date), (substitute_teacher_id, start_date)
employees (employee_code), (department, status)
hr_attendance (employee_id, attendance_date), (attendance_date, status)
hr_leave_requests (employee_id, status), (start_date, end_date, status)
holidays (holiday_date)
```

---

## 4. Module and file structure

```
src/modules/hr/
├── hr.module.ts
├── controllers/
│   ├── employee.controller.ts
│   ├── employee-document.controller.ts
│   ├── hr-attendance.controller.ts
│   ├── leave-type.controller.ts
│   ├── leave-request.controller.ts
│   ├── leave-balance.controller.ts
│   └── holiday.controller.ts
├── services/
│   ├── employee.service.ts
│   ├── employee-lifecycle.service.ts      # probation, confirmation, transfer, exit
│   ├── hr-attendance.service.ts
│   ├── leave-request.service.ts
│   ├── leave-balance.service.ts
│   ├── leave-approval.service.ts
│   ├── holiday.service.ts
│   └── hr-employee-read.service.ts        # PUBLIC read façade consumed by School/Therapy
├── repositories/
├── listeners/
├── jobs/employee-status-sync.job.ts
└── dto/

src/modules/school/
├── school.module.ts
├── controllers/
│   ├── academic-year.controller.ts
│   ├── shift.controller.ts
│   ├── student.controller.ts
│   ├── student-guardian.controller.ts
│   ├── admission-fee.controller.ts
│   ├── teacher.controller.ts
│   ├── mapping.controller.ts
│   ├── substitute.controller.ts
│   └── student-attendance.controller.ts
├── services/
│   ├── academic-year.service.ts
│   ├── shift.service.ts
│   ├── student.service.ts
│   ├── student-status.service.ts          # the single owner of status transitions
│   ├── admission-fee.service.ts
│   ├── teacher.service.ts
│   ├── teacher-mapping.service.ts         # shift cap rules live here
│   ├── substitute.service.ts
│   ├── school-attendance.service.ts
│   └── working-days.service.ts            # holiday-aware calendar maths
├── listeners/
│   ├── admission-fee-paid.listener.ts
│   └── hr-absence.listener.ts             # consumes hr.attendance.absent + hr.leave.approved
├── policies/student.policy.ts             # teacher sees only mapped students
└── dto/
```

**Boundary rule.** `school` never imports `PrismaService` models owned by `hr`. It calls `HrEmployeeReadService`, which exposes a narrow DTO (`{ id, employeeCode, fullName, phone, designation, department, status }`). This is what makes the teacher profile "auto-populate from HR records" without duplication (feature 1.3).

---

## 5. API endpoints

### HR — Employees

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/hr/employees` | hr_officer, super_admin, principal(R), accountant(R) | Filter by department, type, status, manager |
| POST | `/hr/employees` | hr_officer, super_admin | Onboard; generates `employee_code` |
| GET | `/hr/employees/:id` | hr_officer, super_admin, principal(R) | Full profile |
| PATCH | `/hr/employees/:id` | hr_officer, super_admin | Update; writes `employee_history` on tracked fields |
| DELETE | `/hr/employees/:id` | super_admin | Soft delete |
| POST | `/hr/employees/:id/confirm-probation` | hr_officer | Sets `confirmation_date`, status → active |
| POST | `/hr/employees/:id/transfer` | hr_officer | Department/designation change with effective date |
| GET/POST | `/hr/employees/:id/documents` | hr_officer | Document vault |
| GET/POST | `/hr/employees/:id/contracts` | hr_officer | Contract upload and expiry tracking |
| POST | `/hr/employees/:id/exit` | hr_officer, principal | Initiate exit; records last working day and checklist |
| GET | `/hr/employees/:id/history` | hr_officer, principal | Employment history timeline |

### HR — Attendance

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/hr/attendance` | hr_officer, super_admin | Filter by date, department, status |
| POST | `/hr/attendance/bulk` | hr_officer | Batch submit for a date |
| PATCH | `/hr/attendance/:id` | hr_officer | Correct a single record |
| GET | `/hr/attendance/monthly-summary` | hr_officer, principal | Per-employee monthly rollup |
| GET | `/hr/attendance/anomalies` | hr_officer | Repeated lateness, unexplained absences |

### HR — Leave

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET/POST | `/hr/leave-types` | hr_officer, super_admin | Configure leave types |
| GET | `/hr/leave-requests` | hr_officer, principal; employees see own | Filter by status, employee, date range |
| POST | `/hr/leave-requests` | authenticated staff | Apply for leave |
| GET | `/hr/leave-requests/:id` | owner, hr_officer, principal | Detail with approval trail |
| PATCH | `/hr/leave-requests/:id/approve` | hr_officer, principal | Approve at caller's level |
| PATCH | `/hr/leave-requests/:id/reject` | hr_officer, principal | Reject with mandatory reason |
| POST | `/hr/leave-requests/:id/cancel` | owner, hr_officer | Cancel; restores balance if already approved |
| GET | `/hr/leave-balances/:employeeId` | owner, hr_officer | Per-type balances for a year |
| GET | `/hr/leave-calendar` | hr_officer, principal, coordinator | Team/department leave calendar |

### HR — Holidays

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/hr/holidays` | authenticated | Filter by year, type, department |
| POST | `/hr/holidays` | hr_officer, super_admin | Create; invalidates `holidays:{year}` cache |
| PATCH/DELETE | `/hr/holidays/:id` | hr_officer, super_admin | Edit/remove |
| POST | `/hr/holidays/bulk-import` | hr_officer | Bulk create from a year calendar |

### School — Configuration

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET/POST | `/school/academic-years` | super_admin, principal | Manage years |
| POST | `/school/academic-years/:id/set-current` | super_admin, principal | Exactly one current year |
| GET/POST | `/school/academic-years/:id/terms` | super_admin, principal | Term configuration |
| GET/POST/PATCH | `/school/shifts` | super_admin, coordinator | Shift definitions, timings, capacity |
| GET | `/school/shifts/:id/schedule` | coordinator, teacher | Shift-wise daily schedule (students, teachers) |
| GET/POST/PATCH | `/school/admission-fee-settings` | super_admin, principal | Global/per-category admission fee amounts |
| GET/PATCH | `/school/attendance-settings` | super_admin, coordinator | Freeze window, alert toggles |

### School — Students

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/school/students` | coordinator, receptionist, super_admin; principal/teacher/accountant read; teacher scoped | List with filters (status, shift, year, disability category) |
| POST | `/school/students` | coordinator, receptionist, super_admin | Enroll; generates code, creates admission fee invoice, status `pending_admission_fee` |
| GET | `/school/students/:id` | scoped | Full profile including guardians, documents, mapping, fee state |
| PATCH | `/school/students/:id` | coordinator, receptionist, super_admin | Update details |
| DELETE | `/school/students/:id` | principal, super_admin | Soft delete |
| POST | `/school/students/:id/status` | principal, super_admin | Manual override with mandatory reason |
| GET | `/school/students/:id/status-history` | coordinator, principal | Transition log |
| GET/POST/PATCH/DELETE | `/school/students/:id/guardians` | coordinator, receptionist | Guardian records |
| GET/POST | `/school/students/:id/documents` | coordinator, receptionist | Document upload |
| POST | `/school/students/:id/re-enroll` | coordinator | Carry into a new academic year |
| GET | `/school/students/:id/attendance` | scoped | Attendance history |

### School — Admission fee

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/school/students/:id/admission-fee` | coordinator, accountant, receptionist | Invoice and payment state |
| POST | `/school/students/:id/admission-fee/pay` | coordinator, accountant, receptionist | Record payment; idempotent; activates student |
| POST | `/school/students/:id/admission-fee/waive` | principal, super_admin | Waive with mandatory reason; activates student |
| GET | `/school/students/:id/admission-fee/receipt` | coordinator, accountant, receptionist, parent | Receipt PDF download URL |

### School — Teachers and mapping

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/school/teachers` | coordinator, principal, super_admin | List, joined with HR read façade |
| POST | `/school/teachers` | coordinator, super_admin | Create school profile for an existing employee |
| GET | `/school/teachers/:id` | coordinator, principal, teacher(own) | Profile + shift assignments + mapped students |
| PATCH | `/school/teachers/:id` | coordinator, super_admin | Update school-specific fields |
| PUT | `/school/teachers/:id/shifts` | coordinator, super_admin | Set shift assignment (one or both) |
| GET/POST | `/school/teachers/:id/certifications` | coordinator | Certification records |
| GET | `/school/mappings` | coordinator, principal, teacher(own) | Filter by shift, status, teacher, student |
| POST | `/school/mappings` | coordinator, principal, super_admin | Create mapping — enforces cap and fee gate |
| PATCH | `/school/mappings/:id` | coordinator, principal | End a mapping with reason |
| GET | `/school/mappings/history` | coordinator, principal | Mapping history with effective dates |
| GET | `/school/mappings/eligibility` | coordinator | Which teachers have free shift capacity |

### School — Substitutes

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/school/substitutes` | coordinator, principal | Pending and historical assignments |
| GET | `/school/substitutes/pending` | coordinator, principal | Absences/leaves with no substitute yet |
| POST | `/school/substitutes` | coordinator, principal | Assign substitute for a date range |
| PATCH | `/school/substitutes/:id` | coordinator, principal | Change substitute or shorten range |
| DELETE | `/school/substitutes/:id` | coordinator, principal | Cancel with reason |

### School — Attendance

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/school/attendance` | coordinator, teacher(scoped) | By date + shift, returns roster with existing marks |
| POST | `/school/attendance/bulk` | coordinator, teacher | Bulk submit for a date + shift |
| PATCH | `/school/attendance/:id` | coordinator | Direct correction inside the freeze window |
| POST | `/school/attendance/:id/amendment` | teacher, coordinator | Request correction after freeze |
| PATCH | `/school/attendance/amendments/:id/decide` | coordinator, principal | Approve/reject amendment |
| GET | `/school/attendance/monthly-summary` | coordinator, principal, teacher(scoped) | Percentages excluding holidays and excused leave |
| GET | `/school/attendance/working-days` | authenticated | Working-day count for a range |

---

## 6. Business rules and invariants

### Admission fee and student status

| # | Rule | Error |
|---|---|---|
| S-01 | Enrolling a student always creates exactly one `admission_fees` row, amount resolved from `admission_fee_settings` (per-category first, global fallback), status `pending`, and sets student status `pending_admission_fee`. All in one transaction. | — |
| S-02 | While status is `pending_admission_fee`: no teacher mapping, no timetable scheduling, no portal access. Enforced in `TeacherMappingService`, `PortalAccessPolicy`, and at the attendance roster query. | `ADMISSION_FEE_PENDING` 422 |
| S-03 | Recording a payment equal to the full outstanding amount sets fee `paid`, sets `paid_date`, generates a receipt number, and transitions the student to `active` — atomically. | — |
| S-04 | Partial admission-fee payment is rejected. The admission fee is all-or-nothing; partial payment support exists only for tuition and activity fees. | `PARTIAL_PAYMENT_NOT_ALLOWED` 422 |
| S-05 | Payment on an already `paid` or `waived` fee, or on an already `active` student, is rejected. | `CONFLICT` 409 |
| S-06 | Waiver requires `principal` or `super_admin`, a non-empty reason, and records `waiver_approved_by`. It transitions the student to `active` and posts a write-off, not a receipt. | `FORBIDDEN` 403 / `VALIDATION_ERROR` 400 |
| S-07 | Only `StudentStatusService` may write `students.status`. Every write appends `student_status_history`. Enforced by making the column update private to that service and asserted by a Semgrep rule. | — |
| S-08 | Valid transitions: `pending_admission_fee → active`; `active → on_leave \| inactive \| graduated \| transferred \| withdrawn`; `on_leave → active \| inactive`; `inactive → active`. Terminal states are `graduated`, `transferred`, `withdrawn`. Any other transition is rejected unless it is a principal manual override with a reason. | `INVALID_STATUS_TRANSITION` 409 |
| S-09 | Re-enrollment creates a new `student_enrollments` row for the new academic year and never mutates history. | — |

### Shift cap and mapping

| # | Rule | Error |
|---|---|---|
| M-01 | A teacher assigned to exactly one shift may hold **at most one** active mapping, and it must be in that shift. | `SHIFT_CAP_EXCEEDED` 409 |
| M-02 | A teacher assigned to both shifts may hold **at most two** active mappings: exactly one in Morning and exactly one in Day. | `SHIFT_CAP_EXCEEDED` 409 |
| M-03 | A mapping's `shift_id` must be a shift the teacher is actively assigned to. | `TEACHER_NOT_IN_SHIFT` 409 |
| M-04 | A mapping's `shift_id` must equal the student's currently enrolled shift. | `SHIFT_MISMATCH` 409 |
| M-05 | Only students with status `active` are mappable. | `ADMISSION_FEE_PENDING` 422 (when pending) / `STUDENT_NOT_ACTIVE` 422 |
| M-06 | A student may have only one active primary mapping at a time. Re-mapping ends the previous one with an `ended_reason` and an `end_date`. | `STUDENT_ALREADY_MAPPED` 409 |
| M-07 | Mapping creation runs under `SELECT ... FOR UPDATE` on the teacher's active mappings so two concurrent requests cannot both pass the cap check. The partial unique index is the final backstop. | `SHIFT_CAP_EXCEEDED` 409 |
| M-08 | Removing a shift from a teacher who has an active mapping in it is rejected until the mapping is ended. | `MAPPING_EXISTS` 409 |

### Substitute workflow

| # | Rule | Error |
|---|---|---|
| B-01 | `hr.attendance.absent` for an employee who is a mapped teacher creates a `substitute_assignments` row with `status = pending`, `trigger_type = absence`, covering that single date. | — |
| B-02 | `hr.leave.approved` for a mapped teacher creates one pending row per affected student covering the full leave date range, `trigger_type = leave`. | — |
| B-03 | Both triggers are idempotent — replaying the event does not duplicate rows. Keyed on `(student_id, trigger_type, trigger_reference_id)`. | — |
| B-04 | Assigning a substitute requires the substitute to be an `active` teacher who is not themselves absent or on approved leave for any date in the range. | `SUBSTITUTE_UNAVAILABLE` 409 |
| B-05 | The shift cap does **not** apply to substitutes. A substitute may cover multiple students across both shifts for the assignment window. | — |
| B-06 | A substitute assignment is strictly time-bound. A nightly job sets `status = auto_reverted` for assignments whose `end_date` has passed; the primary mapping is never modified, so no restore step is needed. | — |
| B-07 | If leave is cancelled or attendance corrected from absent, any pending substitute row for that trigger is cancelled automatically. | — |
| B-08 | A daily job emits `substitute.unassigned` for any pending row whose `start_date` is today or tomorrow, alerting the coordinator (feature 1.4). | — |
| B-09 | Every substitute action writes an audit trail entry containing reason, substitute, date range, and assigning user. | — |

### Attendance

| # | Rule | Error |
|---|---|---|
| A-01 | A date that is a holiday for the school department cannot be marked. The roster endpoint returns `isHoliday: true` and the bulk submit rejects it. | `DATE_IS_HOLIDAY` 422 |
| A-02 | Attendance cannot be marked for a future date. | `FUTURE_DATE` 422 |
| A-03 | Attendance cannot be marked before the student's enrollment date or after a terminal-status date. | `OUT_OF_ENROLLMENT_RANGE` 422 |
| A-04 | Only the mapped primary teacher, the currently assigned substitute, or a coordinator may mark a student's attendance. | `FORBIDDEN` 403 |
| A-05 | Records older than `attendance_settings.freeze_after_days` are immutable via `PATCH`; they require the amendment workflow. | `ATTENDANCE_FROZEN` 409 |
| A-06 | Attendance percentage = present-equivalent days ÷ working days, where working days exclude holidays and approved-leave days, and `half_day` counts as 0.5. `excused_leave` and `medical` are excluded from both numerator and denominator. | — |
| A-07 | Bulk submit is transactional and idempotent per `(student_id, date)` — resubmitting updates rather than duplicating. | — |
| A-08 | Marking `absent` for a student with no approved leave queues an unauthorized-absence alert to the guardian when the setting is enabled. | — |

### HR leave

| # | Rule | Error |
|---|---|---|
| L-01 | Application validates: `start_date ≤ end_date`, no overlap with an existing pending/approved request, sufficient balance after subtracting `pending_days`. | `INSUFFICIENT_LEAVE_BALANCE` 422 / `OVERLAPPING_LEAVE` 409 |
| L-02 | Requested days exclude holidays and weekly off-days from the count. | — |
| L-03 | Sick leave exceeding `requires_medical_certificate_after_days` demands an attachment. | `MEDICAL_CERTIFICATE_REQUIRED` 422 |
| L-04 | Submission soft-holds the days in `leave_balances.pending_days`; approval moves them to `consumed_days`; rejection or cancellation releases them. All within one transaction. | — |
| L-05 | Approval is multi-level. The request is only `approved` when the final configured level approves. Each step is recorded. | — |
| L-06 | Rejection requires a reason. | `VALIDATION_ERROR` 400 |
| L-07 | Approving leave writes `hr_attendance` rows with status `leave` for each working day in the range. | — |
| L-08 | Cancelling an approved future leave restores the balance and deletes the generated attendance rows. Cancelling a partially-elapsed leave restores only future days. | — |

---

## 7. Domain events

**Emitted**

| Event | Payload |
|---|---|
| `admission_fee.paid` | `{ studentId, admissionFeeId, amount, method, receiptNumber, paidDate, recordedBy }` |
| `admission_fee.waived` | `{ studentId, admissionFeeId, amount, reason, approvedBy }` |
| `student.enrolled` | `{ studentId, studentCode, academicYearId, shiftId }` |
| `student.activated` | `{ studentId, previousStatus, trigger }` |
| `student.status_changed` | `{ studentId, fromStatus, toStatus, reason, isManualOverride }` |
| `hr.attendance.absent` | `{ employeeId, date, markedBy }` |
| `hr.leave.approved` | `{ leaveRequestId, employeeId, leaveTypeCode, startDate, endDate, approvedBy }` |
| `hr.leave.rejected` | `{ leaveRequestId, employeeId, reason }` |
| `hr.leave.cancelled` | `{ leaveRequestId, employeeId, startDate, endDate }` |
| `holiday.changed` | `{ year }` — cache invalidation |
| `substitute.assigned` | `{ substituteAssignmentId, studentId, substituteTeacherId, startDate, endDate }` |
| `substitute.unassigned` | `{ studentIds[], teacherId, date, triggerType }` |
| `student.attendance.unauthorized_absence` | `{ studentId, date }` |

**Consumed**

| Event | Handler | Action |
|---|---|---|
| `admission_fee.paid` / `.waived` | `AdmissionFeePaidListener` | Transition student to `active`; call `LedgerPort.post()`; call `NotificationPort.notify()` |
| `hr.attendance.absent` | `HrAbsenceListener` | Create pending substitute rows |
| `hr.leave.approved` | `HrAbsenceListener` | Create pending substitute rows for the range |
| `hr.leave.cancelled` | `HrAbsenceListener` | Cancel pending substitute rows |
| `holiday.changed` | `WorkingDaysService` | Invalidate `holidays:{year}` Redis key |

### Ledger postings emitted through `LedgerPort`

| Trigger | Debit | Credit | Cost center |
|---|---|---|---|
| Admission fee invoice generated | `1200 Accounts Receivable — Students` | `4001 Admission Fee Income` | school |
| Admission fee paid (cash) | `1010 Cash in Hand` | `1200 Accounts Receivable — Students` | school |
| Admission fee paid (bank/online) | `1020 Bank` | `1200 Accounts Receivable — Students` | school |
| Admission fee waived | `5090 Fee Waiver Expense` | `1200 Accounts Receivable — Students` | school |

Account codes are placeholders resolved from a `posting_rules` reference table seeded in Phase 4; in Phase 1 they are written as codes into `pending_ledger_postings` and validated on replay.

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `substitute-auto-revert` | Daily 00:15 | Mark elapsed substitute assignments `auto_reverted` |
| `substitute-unassigned-alert` | Daily 06:00 | Emit `substitute.unassigned` for today/tomorrow gaps |
| `unauthorized-absence-alert` | Daily 11:00 | Notify guardians of same-day unexplained absences |
| `attendance-freeze` | Daily 01:00 | Compute and cache the freeze cutoff date |
| `leave-balance-accrual` | Yearly 1 Jan 00:30 | Roll balances forward, apply carry-forward caps |
| `probation-due-alert` | Weekly Mon 08:00 | Flag employees whose probation ends within 14 days |

Queue added: `school-ops`.

---

## 9. Configuration and secrets

No new secrets. New settings, all stored in `organization_settings` or `attendance_settings` rather than env:

- `attendance_settings.freeze_after_days` (default 7)
- `attendance_settings.allow_teacher_marking` (default true)
- `attendance_settings.unauthorized_absence_alert_enabled` (default true)
- Weekly off-days list, added to `organization_settings.working_week JSONB` (default Friday–Saturday, configurable)

---

## 10. Tests owed by this phase

### Factories added

`employeeFactory`, `leaveTypeFactory`, `leaveRequestFactory`, `holidayFactory`, `academicYearFactory`, `shiftFactory`, `studentFactory` (with `activeStudent` / `pendingFeeStudent` traits), `guardianFactory`, `admissionFeeFactory`, `teacherFactory`, `mappingFactory`, `substituteFactory`, `attendanceFactory`.

The `studentFactory` from TDD 18.11.1 is the canonical starting point.

### Unit tests — `StudentService` / `StudentStatusService`

- Enrollment creates the fee record with the category-specific amount, falling back to global.
- Enrollment sets `pending_admission_fee` and emits `student.enrolled`.
- Every legal status transition succeeds; every illegal one throws `INVALID_STATUS_TRANSITION`.
- Manual override without a reason is rejected; with a reason it succeeds and is flagged `is_manual_override`.
- Soft delete excludes the student from default queries but preserves attendance history.
- Re-enrollment creates a second enrollment row and leaves the first intact.

### Unit tests — `AdmissionFeeService`

Directly mirrors TDD 18.4.2:

- Full payment activates the student, emits `admission_fee.paid`, and calls `LedgerPort.post()` exactly once.
- Payment on an already-active student throws `ConflictException`.
- Amount less than the fee throws `UnprocessableEntityException`.
- Amount greater than the fee is rejected.
- Waiver by a non-principal throws `ForbiddenException`.
- Waiver without a reason throws `BadRequestException`.
- Waiver posts a write-off, not a receipt.
- Receipt number is generated from `NumberingService` and is unique.

### Unit tests — `TeacherMappingService`

Directly mirrors TDD 18.4.3:

- Blocks a second mapping in the same shift → `SHIFT_CAP_EXCEEDED`.
- Allows Morning + Day for a dual-shift teacher.
- Blocks a third mapping for a dual-shift teacher.
- Blocks mapping to a shift the teacher is not assigned to.
- Blocks mapping when the student's shift differs from the mapping shift.
- Blocks mapping a `pending_admission_fee` student → `ADMISSION_FEE_PENDING`.
- Blocks mapping a student who already has an active mapping.
- Ending a mapping frees the shift slot for a new mapping.

### Unit tests — `SubstituteService`

- Absence event creates one pending row per mapped student.
- Leave-approved event creates rows spanning every date in the range.
- Replaying the same event creates no duplicates.
- Assigning a substitute who is themselves on leave is rejected.
- One substitute can be assigned to three students across two shifts without error.
- Leave cancellation cancels pending rows.
- Auto-revert job flips only elapsed assignments.

### Unit tests — `SchoolAttendanceService` and `WorkingDaysService`

- Holiday date rejected.
- Future date rejected.
- Marking outside enrollment range rejected.
- Unmapped teacher forbidden; mapped teacher allowed; assigned substitute allowed for the covered dates only.
- Frozen record rejected on PATCH but accepted via amendment.
- Percentage maths: with 22 calendar days, 2 holidays, 1 approved leave, 1 half-day, 2 absences → asserts the exact expected percentage.
- Working-day count excludes holidays and configured weekly off-days.
- Bulk submit is idempotent.

### Unit tests — HR services

- `LeaveRequestService`: overlap detection, balance sufficiency including `pending_days`, holiday-excluded day count, medical certificate threshold, multi-level progression, rejection reason requirement, cancellation restoring balance.
- `LeaveBalanceService`: accrual, carry-forward cap, concurrent application safety.
- `HrAttendanceService`: bulk submit, late-minute computation against shift grace, anomaly detection, absent event emission.
- `EmployeeLifecycleService`: probation confirmation, transfer writing history, exit flow.
- `HrEmployeeReadService`: returns only the narrow DTO; does not leak salary.

### Integration tests

| Suite | Assertions |
|---|---|
| `student-enrollment.integration.spec.ts` | Mirrors TDD 18.6.2 exactly — `POST /school/students` returns `pending_admission_fee` and creates the fee row; `POST admission-fee/pay` flips status to `active` and writes a `pending_ledger_postings` row (Phase 4 later asserts the journal itself) |
| `admission-gate.integration.spec.ts` | Mapping attempt on a pending student returns 422 with `ADMISSION_FEE_PENDING`; after payment the same call returns 201 |
| `shift-cap.integration.spec.ts` | Real DB concurrency test: fire 10 parallel mapping requests for the same teacher/shift, assert exactly one 201 and nine 409s |
| `substitute-flow.integration.spec.ts` | Approve teacher leave via the HR endpoint → assert pending substitute rows exist for each mapped student across the full range → assign → assert `assigned` → advance clock → run revert job → assert `auto_reverted` |
| `attendance.integration.spec.ts` | Bulk submit, holiday rejection, freeze behaviour, monthly summary numbers verified against a hand-computed fixture |
| `leave.integration.spec.ts` | Balance held on submit, consumed on final approval, released on rejection; `hr_attendance` rows created on approval and removed on cancellation |
| `holiday-cache.integration.spec.ts` | Creating a holiday invalidates the Redis key and changes the next working-day computation |
| `hr-boundary.integration.spec.ts` | A `coordinator` token can read teacher names via `/school/teachers` but receives 403 on `/hr/employees` |
| `rbac-phase1.integration.spec.ts` | Extends the Phase 0 matrix test with the new School and HR rows |

Endpoint coverage: 100% of section 5.

### Performance tests

- `k6/scripts/student-list-load.js` — `GET /school/students` paginated, 50 VU × 10 min, p95 < 300 ms.
- `k6/scripts/attendance-bulk-submit.js` — `POST /school/attendance/bulk` with a 40-student payload, 30 VU × 5 min, p95 < 600 ms.

### Mutation testing

`StudentStatusService`, `AdmissionFeeService`, `TeacherMappingService`, `SubstituteService`, `SchoolAttendanceService`, `WorkingDaysService`, `LeaveRequestService` must all reach ≥ 75%. These are the highest-value mutation targets in the system because their conditionals encode the business rules.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] Every rule in section 6 has a passing negative-path test asserting its specific error code. Traceability table committed at `test/traceability/phase1.md`.
- [ ] The shift-cap concurrency test passes 20 consecutive runs with no flake.
- [ ] The admission-fee gate is enforced at all three touchpoints (mapping, portal access policy, attendance roster) and each has a test.
- [ ] `pending_ledger_postings` contains a correct row for every admission fee payment and waiver, with a debit/credit pair that balances.
- [ ] `HrEmployeeReadService` is the only path from School to HR data — verified by a Semgrep rule banning `prisma.employees` usage outside `modules/hr`.
- [ ] Monthly attendance summary for a hand-built fixture month matches a manually computed expected value documented in the test.
- [ ] Seed script produces a demo dataset: 2 academic years, 2 shifts, 10 holidays, 25 employees, 12 teachers with mixed shift assignments, 30 students across all statuses.
