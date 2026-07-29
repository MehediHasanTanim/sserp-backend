# Backend Phase 2 — School Advanced & Parent Portal

| Field | Value |
|---|---|
| Duration | 5 weeks |
| Prerequisites | Phase 0, Phase 1 merged |
| Feature list coverage | 1.6 IEP, 1.7 Progress Reports, 1.8 Fee Management, 1.10 (curriculum), 1.11 Health, 1.12 Behavioral, 1.13 Outdoor Activities, 10 Parent & Guardian Portal |
| TDD sections | 6.2 (iep, activities, leave requests), 7.3, 9.2, 11.4 |

---

## 1. Objective and scope

Complete the School module and open the system to parents. This phase introduces the first workflow-gated write access for external users, the first PDF generation pipeline, and the recurring monthly billing cycle.

**In scope**

- Curriculum and skill domains per disability category
- IEP plans with versioning, goals per developmental domain, progress tracking, quarterly reviews, parent acknowledgment, PDF generation
- Monthly progress reports and quarterly IEP programme reports with a draft → review → approve workflow
- Tuition fee structures, categories, monthly invoice generation, discounts, scholarships, partial payments, waivers, reminders, receipts
- Student health and medical records with alert flags
- Behavioral incident tracking and support plans
- Outdoor activities: definition, parent opt-in, waitlist, per-student fee, activity attendance, cancellation
- Parent portal: scoped authentication, read models, IEP view and acknowledgment, advance leave requests, invoice and payment visibility, two-way messaging with the coordinator, guardian detail change requests

**Out of scope**

- Therapy session visibility in the portal — the endpoint is defined here but returns an empty list until Phase 3
- Online payment gateway — the fee payment record accepts an `online` method with a manual reference; gateway integration is a Phase 9 optional item
- Real ledger posting — via `LedgerPort` outbox

---

## 2. Prerequisites

- Phase 1 students, guardians, shifts, academic years, attendance, holidays.
- Phase 0 files module (MinIO) and `NumberingService` for invoice and receipt numbers.
- `users.guardian_id` foreign key constraint is added in this phase's first migration.

---

## 3. Prisma schema additions

### Curriculum

#### `skill_domains`
`id`, `name` (Communication, Social, Cognitive, Motor, Self-care, Behavioral), `description`, `sequence`, `is_active`. Seeded with the six from feature 1.6.

#### `curricula`
`id`, `academic_year_id`, `disability_category`, `name`, `description`, `is_active`.

#### `learning_objectives`
`id`, `curriculum_id`, `skill_domain_id`, `description`, `sequence`.

### IEP

#### `iep_plans`
Per TDD 6.2 plus `previous_version_id` (self FK), `created_by_teacher_id`, `approved_by`, `approved_at`, `published_at`, `document_attachment_id`, `review_frequency_months` (default 3).

Partial unique index: only one `active` plan per student.

#### `iep_goals`
Per TDD 6.2 plus `baseline_description`, `measurement_criteria`, `progress_percentage INTEGER`, `sequence`, `learning_objective_id` (nullable link to curriculum).

#### `iep_goal_progress_entries`
`id`, `goal_id`, `entry_date`, `from_status`, `to_status`, `progress_percentage`, `narrative`, `recorded_by`. Provides the trend data for progress charts and the audit of who changed a goal status when.

#### `iep_reviews`
`id`, `iep_id`, `scheduled_date`, `actual_date`, `review_type` (`quarterly`|`annual`|`ad_hoc`), `status` (`scheduled`|`completed`|`missed`), `attendees JSONB`, `outcome_summary`, `next_review_date`, `conducted_by`.

#### `iep_acknowledgments`
`id`, `iep_id`, `guardian_id`, `acknowledged_at`, `ip_address`, `user_agent`, `signature_text`. Separate table so multiple guardians can each acknowledge and history survives IEP versioning.

### Progress reports

#### `report_templates`
`id`, `name`, `report_type` (`monthly_progress`|`quarterly_iep`), `disability_category` (nullable = applies to all), `sections JSONB`, `rating_scale JSONB`, `is_active`. Backs "templates configurable per disability category" (1.7).

#### `progress_reports`
`id`, `student_id`, `template_id`, `report_type`, `period_start`, `period_end`, `academic_year_id`, `status` (`draft`|`submitted`|`approved`|`rejected`|`published`), `narrative_sections JSONB`, `domain_ratings JSONB`, `submitted_by`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_comment`, `published_at`, `document_attachment_id`. Unique `(student_id, report_type, period_start)`.

#### `progress_report_goal_links`
`id`, `progress_report_id`, `iep_goal_id`, `progress_note`, `rating`. Implements "link IEP goals to monthly progress reports" (1.6).

#### `progress_report_evidence`
`id`, `progress_report_id`, `attachment_id`, `caption`.

### Fees

#### `fee_categories`
`id`, `name`, `description`, `is_active`. e.g. Standard, Concession Tier 1, Scholarship.

#### `fee_heads`
`id`, `code`, `name`, `head_type` (`tuition`|`transport`|`material`|`other`), `is_recurring`, `is_active`.

#### `fee_structures`
`id`, `academic_year_id`, `fee_category_id`, `fee_head_id`, `amount INTEGER`, `frequency` (`monthly`|`term`|`annual`|`one_time`), `effective_from`, `effective_to`. Unique `(academic_year_id, fee_category_id, fee_head_id, effective_from)`.

#### `student_fee_assignments`
`id`, `student_id`, `fee_category_id`, `effective_from`, `effective_to`. Determines which structure applies to a student.

#### `student_discounts`
`id`, `student_id`, `discount_type` (`percentage`|`fixed`), `value INTEGER`, `fee_head_id` (nullable = all heads), `reason`, `status` (`pending`|`approved`|`rejected`), `approved_by`, `approved_at`, `effective_from`, `effective_to`.

#### `scholarships`
`id`, `student_id`, `name`, `sponsor`, `coverage_type` (`percentage`|`fixed`), `value INTEGER`, `start_date`, `end_date`, `status`, `notes`.

#### `fee_invoices`
`id`, `invoice_number` (unique), `student_id`, `academic_year_id`, `invoice_type` (`monthly`|`activity`|`adhoc`), `period_month`, `period_year`, `activity_id` (nullable), `issue_date`, `due_date`, `gross_amount`, `discount_amount`, `waived_amount`, `net_amount`, `paid_amount`, `outstanding_amount`, `status` (`draft`|`issued`|`partially_paid`|`paid`|`waived`|`cancelled`), `cancelled_reason`. Unique `(student_id, invoice_type, period_year, period_month)` where `invoice_type = 'monthly'`.

#### `fee_invoice_lines`
`id`, `invoice_id`, `fee_head_id`, `description`, `amount`, `discount_amount`, `net_amount`.

#### `fee_payments`
`id`, `receipt_number` (unique), `invoice_id`, `student_id`, `amount`, `method` (`cash`|`bank_transfer`|`cheque`|`online`), `reference`, `payment_date`, `received_by`, `attachment_id`, `status` (`recorded`|`reversed`), `reversal_reason`.

#### `fee_waivers`
`id`, `invoice_id`, `amount`, `reason`, `requested_by`, `approved_by`, `approved_at`, `status`.

### Health and behaviour

#### `student_medical_records`
RLS-protected (Phase 9). `id`, `student_id`, `conditions JSONB`, `allergies JSONB`, `medications JSONB`, `emergency_protocol TEXT`, `blood_group`, `physician_name`, `physician_phone`, `has_alert_flag BOOLEAN`, `alert_summary VARCHAR(300)`, `updated_by`.

#### `student_immunizations`
`id`, `student_id`, `vaccine_name`, `dose_number`, `administered_date`, `next_due_date`, `attachment_id`.

#### `medical_incidents`
`id`, `student_id`, `incident_datetime`, `incident_type` (`injury`|`seizure`|`health_episode`|`other`), `description`, `action_taken`, `severity` (`low`|`medium`|`high`), `reported_by`, `guardian_notified_at`, `attachment_ids UUID[]`.

#### `behavioral_incidents`
`id`, `student_id`, `incident_datetime`, `behavior_type`, `antecedent`, `description`, `consequence`, `persons_involved JSONB`, `intervention_applied`, `duration_minutes`, `recorded_by`, `linked_iep_goal_id` (nullable).

#### `behavior_support_plans`
`id`, `student_id`, `start_date`, `review_date`, `target_behaviors JSONB`, `strategies JSONB`, `status` (`active`|`archived`), `created_by`.

### Outdoor activities

#### `activity_types`
`id`, `name` (field trip, sports session, swimming, nature walk, community outing), `default_fee_amount`, `is_active`.

#### `outdoor_activities`
Per TDD 6.2 plus `activity_type_id`, `start_time`, `end_time`, `duration_minutes`, `waitlist_enabled`, `cancellation_reason`, `post_summary TEXT`, `participant_count`, `fee_collected_amount`.

#### `activity_supervisors`
`id`, `activity_id`, `teacher_id`, `role` (`lead`|`assistant`).

#### `activity_enrollments`
Per TDD 6.2 plus `consent_recorded_at`, `consent_channel` (`portal`|`coordinator_manual`), `declined_reason`, `enrollment_state` (`confirmed`|`waitlisted`|`declined`|`withdrawn`), `waitlist_position`, `invoice_id`, `withdrawn_at`.

#### `activity_attendance`
`id`, `activity_id`, `student_id`, `status` (`present`|`absent`|`withdrew_last_minute`), `marked_by`, `remarks`. **Deliberately separate from `student_attendance`** so activity attendance never affects school attendance percentages (feature 1.13.4).

#### `activity_media`
`id`, `activity_id`, `attachment_id`, `caption`.

### Parent portal

#### `student_leave_requests`
Per TDD 6.2 plus `total_days`, `leave_type` (`medical`|`family`|`travel`|`other`), `reviewed_at`, `notified_at`.

#### `guardian_change_requests`
`id`, `guardian_id`, `requested_changes JSONB`, `status` (`pending`|`approved`|`rejected`), `requested_by`, `reviewed_by`, `review_note`. Backs "change guardian contact details pending admin approval" (10).

#### `portal_messages`
`id`, `thread_id`, `student_id`, `sender_user_id`, `sender_type` (`guardian`|`staff`), `body`, `attachment_id`, `read_at`, `created_at`. Two-way messaging with limited scope (10).

#### `portal_message_threads`
`id`, `student_id`, `subject`, `status` (`open`|`closed`), `last_message_at`, `assigned_staff_user_id`.

### Indexes added

```
iep_plans (student_id, status), (next_review_date)
iep_goals (iep_id, status)
iep_goal_progress_entries (goal_id, entry_date)
progress_reports (student_id, report_type, period_start), (status)
fee_invoices (student_id, status), (due_date, status), (period_year, period_month)
fee_payments (invoice_id), (payment_date)
activity_enrollments (activity_id, enrollment_state), (student_id)
student_leave_requests (student_id, status), (status, start_date)
behavioral_incidents (student_id, incident_datetime)
medical_incidents (student_id, incident_datetime)
```

---

## 4. Module and file structure

```
src/modules/school/         (extended)
├── controllers/
│   ├── curriculum.controller.ts
│   ├── iep.controller.ts
│   ├── iep-review.controller.ts
│   ├── progress-report.controller.ts
│   ├── fee-structure.controller.ts
│   ├── fee-invoice.controller.ts
│   ├── fee-payment.controller.ts
│   ├── student-health.controller.ts
│   ├── behavioral.controller.ts
│   ├── activity.controller.ts
│   └── student-leave.controller.ts
├── services/
│   ├── curriculum.service.ts
│   ├── iep.service.ts                    # versioning, publish, acknowledge
│   ├── iep-goal.service.ts
│   ├── iep-review.service.ts
│   ├── progress-report.service.ts        # draft → submit → approve → publish
│   ├── fee-structure.service.ts
│   ├── fee-invoice.service.ts            # monthly generation, discount resolution
│   ├── fee-payment.service.ts            # partial payments, receipts, reversal
│   ├── fee-reminder.service.ts
│   ├── student-health.service.ts
│   ├── behavioral.service.ts
│   ├── activity.service.ts
│   ├── activity-enrollment.service.ts    # opt-in, capacity, waitlist
│   ├── activity-fee.service.ts
│   ├── activity-attendance.service.ts
│   └── student-leave.service.ts
├── jobs/
│   ├── monthly-invoice-generation.job.ts
│   ├── fee-reminder.job.ts
│   ├── iep-review-reminder.job.ts
│   ├── activity-optin-deadline.job.ts
│   └── activity-fee-reminder.job.ts
└── pdf/
    ├── iep-document.template.hbs
    ├── progress-report.template.hbs
    ├── fee-invoice.template.hbs
    └── fee-receipt.template.hbs

src/modules/portal/
├── portal.module.ts
├── controllers/
│   ├── portal-profile.controller.ts
│   ├── portal-attendance.controller.ts
│   ├── portal-iep.controller.ts
│   ├── portal-reports.controller.ts
│   ├── portal-fees.controller.ts
│   ├── portal-leave.controller.ts
│   ├── portal-activities.controller.ts
│   ├── portal-messages.controller.ts
│   └── portal-therapy.controller.ts      # returns [] until Phase 3
├── services/
│   ├── portal-scope.service.ts           # resolves guardian → student IDs
│   └── portal-read.service.ts
├── guards/portal-scope.guard.ts
└── dto/

src/modules/files/pdf/
├── pdf-renderer.service.ts               # Puppeteer pool + Handlebars
└── pdf.queue.ts
```

---

## 5. API endpoints

### Curriculum

| Method | Endpoint | Roles |
|---|---|---|
| GET/POST/PATCH | `/school/skill-domains` | super_admin, coordinator |
| GET/POST/PATCH | `/school/curricula` | super_admin, coordinator |
| GET/POST/PATCH/DELETE | `/school/curricula/:id/objectives` | super_admin, coordinator |

### IEP

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/school/students/:id/iep` | coordinator, teacher(scoped), principal(R), parent(scoped R) | All plans, newest first |
| GET | `/school/iep/:id` | scoped | Plan with goals and progress |
| POST | `/school/students/:id/iep` | coordinator, teacher | Create draft plan (v1) |
| POST | `/school/iep/:id/revise` | coordinator, teacher | Create v(n+1) copying goals, archive previous |
| PATCH | `/school/iep/:id` | coordinator, teacher | Edit draft only |
| POST | `/school/iep/:id/publish` | coordinator | Draft → active; emits `iep.published` |
| POST | `/school/iep/:id/archive` | coordinator | Archive |
| GET/POST | `/school/iep/:id/goals` | coordinator, teacher | Goal CRUD |
| PATCH | `/school/iep/goals/:goalId` | coordinator, teacher(own goals) | Edit goal |
| POST | `/school/iep/goals/:goalId/progress` | teacher(responsible), coordinator | Record progress entry |
| GET | `/school/iep/goals/:goalId/progress` | scoped | Progress timeline |
| GET/POST | `/school/iep/:id/reviews` | coordinator | Schedule / list reviews |
| PATCH | `/school/iep/reviews/:reviewId/complete` | coordinator | Record outcome, set next review |
| POST | `/school/iep/:id/document` | coordinator | Queue PDF generation |
| GET | `/school/iep/:id/document` | scoped incl. parent | Presigned download URL |

### Progress reports

| Method | Endpoint | Roles |
|---|---|---|
| GET/POST/PATCH | `/school/report-templates` | super_admin, coordinator |
| GET | `/school/students/:id/progress-reports` | coordinator, teacher(scoped), parent(published only) |
| POST | `/school/students/:id/progress-reports` | teacher, coordinator |
| PATCH | `/school/progress-reports/:id` | author (draft only) |
| POST | `/school/progress-reports/:id/submit` | teacher |
| POST | `/school/progress-reports/:id/approve` | coordinator |
| POST | `/school/progress-reports/:id/reject` | coordinator |
| POST | `/school/progress-reports/:id/publish` | coordinator |
| GET | `/school/progress-reports/:id/document` | scoped incl. parent |
| GET | `/school/students/:id/progress-trend` | coordinator, teacher, parent |
| POST | `/school/progress-reports/:id/evidence` | teacher, coordinator |

### Fees

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/school/fee-categories`, `/school/fee-heads`, `/school/fee-structures` | super_admin, accountant, principal |
| PUT | `/school/students/:id/fee-category` | accountant, coordinator |
| GET/POST | `/school/students/:id/discounts` | accountant, coordinator |
| POST | `/school/discounts/:id/approve` | principal |
| GET/POST | `/school/students/:id/scholarships` | accountant, principal |
| POST | `/school/fee-invoices/generate-monthly` | accountant, super_admin | Idempotent bulk generation for a month |
| GET | `/school/fee-invoices` | accountant, coordinator, receptionist, principal(R) |
| GET | `/school/fee-invoices/:id` | scoped incl. parent |
| POST | `/school/fee-invoices/:id/cancel` | accountant, principal |
| POST | `/school/fee-invoices/:id/payments` | accountant, receptionist, coordinator | Partial allowed |
| POST | `/school/fee-payments/:id/reverse` | accountant, principal |
| POST | `/school/fee-invoices/:id/waive` | principal |
| GET | `/school/fee-invoices/:id/receipt/:paymentId` | scoped incl. parent |
| GET | `/school/students/:id/fee-summary` | scoped incl. parent | Outstanding, history |
| POST | `/school/fee-invoices/send-reminders` | accountant | Manual reminder trigger |

### Health and behaviour

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/PUT | `/school/students/:id/medical-record` | coordinator, mapped teacher(R), principal(R) |
| GET/POST | `/school/students/:id/immunizations` | coordinator |
| GET/POST | `/school/students/:id/medical-incidents` | coordinator, mapped teacher |
| GET | `/school/students/:id/medical-alerts` | mapped teacher, substitute, coordinator | Alert flag summary |
| GET/POST | `/school/students/:id/behavioral-incidents` | coordinator, mapped teacher |
| GET/POST/PATCH | `/school/students/:id/behavior-support-plan` | coordinator |
| GET | `/school/students/:id/behavioral-trend` | coordinator, mapped teacher |

### Outdoor activities

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/school/activity-types` | super_admin, coordinator |
| GET | `/school/activities` | coordinator, teacher(R), receptionist, accountant, parent(scoped R) |
| POST | `/school/activities` | coordinator |
| PATCH | `/school/activities/:id` | coordinator |
| POST | `/school/activities/:id/cancel` | coordinator, principal |
| POST | `/school/activities/:id/invite` | coordinator | Send opt-in invitations |
| GET | `/school/activities/:id/enrollments` | coordinator, accountant | Confirmed / pending / declined / waitlisted |
| POST | `/school/activities/:id/enrollments` | coordinator | Manual consent on behalf of guardian |
| POST | `/school/activities/:id/enrollments/:studentId/withdraw` | coordinator | Withdraw, promote waitlist |
| GET/POST | `/school/activities/:id/attendance` | coordinator, supervising teacher |
| GET/POST | `/school/activities/:id/media` | coordinator |
| PATCH | `/school/activities/:id/summary` | coordinator | Post-activity summary |
| GET | `/school/activities/calendar` | coordinator, teacher, parent | Calendar feed |

### Student leave requests (staff side)

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/school/student-leave-requests` | coordinator, principal | Consolidated queue |
| GET | `/school/student-leave-requests/:id` | coordinator, principal |
| POST | `/school/student-leave-requests/:id/approve` | coordinator, principal |
| POST | `/school/student-leave-requests/:id/reject` | coordinator, principal | Reason mandatory |

### Parent portal

All routes below are guarded by `PortalScopeGuard` and available only to the `parent` role.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/portal/children` | Students linked to the authenticated guardian |
| GET | `/portal/children/:studentId` | Profile summary, enrolled programmes, medical alert flag |
| GET | `/portal/children/:studentId/attendance` | Monthly attendance with percentage |
| GET | `/portal/children/:studentId/iep` | Active IEP: domains, goals, statuses, target dates, responsible teacher |
| GET | `/portal/children/:studentId/iep/history` | Previous versions, review dates and outcomes |
| GET | `/portal/iep/:iepId/document` | IEP PDF download URL |
| POST | `/portal/iep/:iepId/acknowledge` | Digital acknowledgment with signature text |
| GET | `/portal/children/:studentId/progress-reports` | Published reports only |
| GET | `/portal/children/:studentId/fees` | Invoices, payments, outstanding |
| GET | `/portal/invoices/:invoiceId/document` | Invoice PDF |
| GET | `/portal/children/:studentId/leave-requests` | Own request history |
| POST | `/portal/children/:studentId/leave-requests` | Submit advance leave request |
| GET | `/portal/children/:studentId/activities` | Activities with opt-in state |
| POST | `/portal/activities/:activityId/respond` | Accept or decline |
| GET | `/portal/children/:studentId/therapy-schedule` | Empty until Phase 3 |
| GET/POST | `/portal/messages` | Threads and messages with the coordinator |
| POST | `/portal/guardian-change-request` | Request contact detail change |
| GET | `/portal/notifications` | Reuses the Phase 0 notifications controller with portal scope |

---

## 6. Business rules and invariants

### IEP

| # | Rule | Error |
|---|---|---|
| I-01 | A student may have at most one `active` IEP. Publishing a new version archives the previous one in the same transaction. | `ACTIVE_IEP_EXISTS` 409 |
| I-02 | Only `draft` plans are editable. Editing an `active` plan requires `POST /revise`, which creates v(n+1) with copied goals. | `IEP_NOT_EDITABLE` 409 |
| I-03 | `version` increments monotonically per student and is never reused. | — |
| I-04 | Publishing requires at least one goal, and every goal must have a domain, description, target date, and responsible teacher. | `IEP_INCOMPLETE` 422 |
| I-05 | A goal's `responsible_teacher_id` must be an active teacher. | `VALIDATION_ERROR` 400 |
| I-06 | Only the responsible teacher or a coordinator may record goal progress. | `FORBIDDEN` 403 |
| I-07 | Every goal status change writes an `iep_goal_progress_entries` row. Goal status is never silently overwritten. | — |
| I-08 | Parents see goal progress **only for published/active plans**, satisfying "visible to parents in real time after coordinator approval" (feature 10). Draft plans are invisible to the portal. | `NOT_FOUND` 404 |
| I-09 | Acknowledgment is idempotent per `(iep_id, guardian_id)`; a repeat call returns the original timestamp. | — |
| I-10 | Publishing sets `next_review_date = published_at + review_frequency_months` and creates a `scheduled` review row. | — |
| I-11 | Completing a review requires an outcome summary and sets the next review date. | `VALIDATION_ERROR` 400 |

### Progress reports

| # | Rule | Error |
|---|---|---|
| P-01 | Workflow is strictly `draft → submitted → approved → published`, or `submitted → rejected → draft`. No skipping. | `INVALID_REPORT_TRANSITION` 409 |
| P-02 | Only the authoring teacher may submit; only a coordinator may approve, reject, or publish. | `FORBIDDEN` 403 |
| P-03 | Rejection requires a comment. | `VALIDATION_ERROR` 400 |
| P-04 | One report per `(student, type, period)`. | `REPORT_EXISTS` 409 |
| P-05 | Publishing queues PDF generation and emits `progress_report.approved`; the parent notification fires only after the PDF exists. | — |
| P-06 | Template selection resolves by the student's disability category first, then the catch-all template. | `NO_TEMPLATE` 422 |
| P-07 | A monthly report must link at least one IEP goal when the student has an active IEP. | `GOAL_LINK_REQUIRED` 422 |

### Fees

| # | Rule | Error |
|---|---|---|
| F-01 | Monthly generation is idempotent per `(student, year, month)`. Re-running skips existing invoices and reports them as skipped. | — |
| F-02 | Only `active` students receive monthly invoices. Students `on_leave`, `inactive`, or in a terminal status are skipped, with the reason recorded in the run summary. | — |
| F-03 | Invoice amount = sum of applicable `fee_structures` lines for the student's fee category, minus approved discounts, minus scholarship coverage. Discounts apply per fee head where specified. | — |
| F-04 | A discount above a configurable threshold requires principal approval before it affects invoicing. Unapproved discounts are ignored during generation. | — |
| F-05 | Partial payments are allowed. `paid_amount` and `outstanding_amount` are recomputed atomically; status moves `issued → partially_paid → paid`. | — |
| F-06 | Overpayment is rejected. | `OVERPAYMENT` 422 |
| F-07 | Payment on a `cancelled` or `waived` invoice is rejected. | `CONFLICT` 409 |
| F-08 | Receipt numbers come from `NumberingService` and are unique and gap-free. | — |
| F-09 | Payment reversal requires principal or accountant, a reason, and posts a reversing ledger entry — it never deletes the original payment row. | — |
| F-10 | Waiver requires principal and a reason; `waived_amount` reduces `outstanding_amount` and posts a waiver expense. | `FORBIDDEN` 403 |
| F-11 | Every invoice issue, payment, reversal, and waiver produces a `LedgerPort.post()` call within the same transaction. | — |
| F-12 | Invoice cancellation is permitted only when `paid_amount = 0`. | `INVOICE_HAS_PAYMENTS` 409 |

### Outdoor activities

| # | Rule | Error |
|---|---|---|
| O-01 | Participation is consent-driven only. A student joins the participant list **only** when `consent_status = confirmed`. There is no default-in behaviour. | — |
| O-02 | Confirmations are accepted only while `now ≤ opt_in_deadline`. A job closes registration at the deadline. | `OPTIN_CLOSED` 409 |
| O-03 | Confirmed count may never exceed `capacity`. Beyond capacity, confirmations become `waitlisted` with a sequential `waitlist_position` — assigned under a row lock so positions are unique. | — |
| O-04 | Withdrawal or decline of a confirmed student promotes the lowest-position waitlisted student to `confirmed`, generates their invoice, and notifies their guardian. Atomic. | — |
| O-05 | Confirmation generates exactly one activity invoice for that student, at the activity fee (falling back to the activity type's default). | — |
| O-06 | Activity fees support partial payment and waiver with principal approval, reusing the fee payment engine. | — |
| O-07 | Withdrawal after invoicing leaves the invoice intact unless a coordinator explicitly cancels it; refunds go through payment reversal. | — |
| O-08 | Activity attendance writes only to `activity_attendance` and never touches `student_attendance`. Asserted by test. | — |
| O-09 | Cancelling an activity sets all enrollments to `withdrawn`, cancels unpaid invoices, flags paid ones for refund, and emits `activity.cancelled` for guardian notification. | — |
| O-10 | Only students with status `active` may be enrolled. | `STUDENT_NOT_ACTIVE` 422 |

### Student leave requests

| # | Rule | Error |
|---|---|---|
| SL-01 | Only a guardian of the student may submit; enforced by `PortalScopeGuard`, not by a body field. | `FORBIDDEN` 403 |
| SL-02 | `start_date ≤ end_date`; the range must not overlap an existing pending or approved request. | `OVERLAPPING_LEAVE` 409 |
| SL-03 | Advance leave means `start_date ≥ today`. Backdated requests are rejected; retrospective absence handling is the coordinator's attendance amendment path. | `BACKDATED_REQUEST` 422 |
| SL-04 | Rejection requires a reason. | `VALIDATION_ERROR` 400 |
| SL-05 | Approval emits `student_leave.approved`, and the attendance listener writes `excused_leave` for every working day in the range, skipping holidays and overwriting only `absent` or unmarked days — never overwriting a recorded `present`. | — |
| SL-06 | `excused_leave` days are excluded from the unauthorized-absence count and from the attendance percentage denominator. | — |
| SL-07 | Submission emits a notification to coordinator and principal; the decision emits one to the guardian. | — |

### Portal access

| # | Rule | Error |
|---|---|---|
| PT-01 | A parent access token carries a `scope.studentIds[]` claim resolved at login from `student_guardians`. Every portal query filters by it server-side; the path parameter is validated against the claim, never trusted. | `FORBIDDEN` 403 |
| PT-02 | Portal access is denied for students whose status is `pending_admission_fee` (feature 1.2). | `ADMISSION_FEE_PENDING` 422 |
| PT-03 | Portal writes are limited to exactly four operations: leave request, IEP acknowledgment, activity opt-in response, guardian change request, plus message posting. Everything else is read-only. | `FORBIDDEN` 403 |
| PT-04 | Guardian detail changes are never applied directly; they create a `guardian_change_requests` row for admin approval. | — |
| PT-05 | A guardian sees only `published` progress reports and `active`/`archived` IEP versions — never drafts. | — |
| PT-06 | Portal message threads are scoped to one student and visible only to that student's guardians and staff. | — |

---

## 7. Domain events

**Emitted:** `iep.published`, `iep.revised`, `iep.acknowledged`, `iep.review.due`, `progress_report.submitted`, `progress_report.approved`, `progress_report.published`, `fee.invoice.generated`, `fee.payment.received`, `fee.payment.reversed`, `fee.invoice.waived`, `fee.overdue`, `activity.created`, `activity.optin.invited`, `activity.optin.confirmed`, `activity.optin.declined`, `activity.waitlist.promoted`, `activity.cancelled`, `student_leave.submitted`, `student_leave.approved`, `student_leave.rejected`, `guardian_change.requested`, `portal.message.posted`, `medical_incident.recorded`.

**Consumed**

| Event | Handler | Action |
|---|---|---|
| `student_leave.approved` | `AttendanceExcusedLeaveListener` | Write `excused_leave` rows for the range |
| `activity.optin.confirmed` | `ActivityFeeListener` | Generate the student's activity invoice |
| `activity.cancelled` | `ActivityCancellationListener` | Withdraw enrollments, cancel unpaid invoices |
| `progress_report.published` | `PdfQueueListener` | Enqueue PDF render, then notify parent |
| `iep.published` | `IepPdfListener` | Enqueue IEP PDF render, notify parent |

### Ledger postings added

| Trigger | Debit | Credit |
|---|---|---|
| Monthly invoice issued | `1200 AR — Students` | `4002 Tuition Fee Income` (per fee head) |
| Activity invoice issued | `1200 AR — Students` | `4005 Activity Fee Income` |
| Fee payment received | `1010 Cash` / `1020 Bank` | `1200 AR — Students` |
| Payment reversed | `1200 AR — Students` | `1010 Cash` / `1020 Bank` |
| Fee waived | `5090 Fee Waiver Expense` | `1200 AR — Students` |
| Discount applied | `5091 Fee Discount` | `1200 AR — Students` |

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `monthly-invoice-generation` | 1st of month 02:00 | Generate invoices for all active students; idempotent; produces a run summary record |
| `fee-reminder` | Daily 09:00 | Notify guardians of invoices overdue by 3, 7, 15, 30 days |
| `admission-fee-pending-reminder` | Daily 09:15 | Reminder until admission fee cleared (feature 11.2) |
| `iep-review-reminder` | Daily 07:00 | Alert teacher and coordinator 14 and 3 days before `next_review_date`; mark missed reviews |
| `activity-optin-deadline` | Hourly | Close registration at deadline, finalise participant list, notify coordinator |
| `activity-fee-reminder` | Daily 09:30 | Unpaid activity fee alerts before the activity date |
| `pdf-render` | Queue-driven | Puppeteer render jobs for IEP, reports, invoices, receipts |

Queues added: `pdf`, `billing`.

### PDF rendering approach

A single `PdfRendererService` holds a Puppeteer browser pool (max 2 pages concurrently, configurable) inside the **worker** container only — never in the API process. Templates are Handlebars files with the org logo and timezone-formatted dates injected. Rendered output goes to the appropriate MinIO bucket; the attachment id is written back to the source row. Requests taking longer than 5 seconds are already asynchronous by construction since all PDF generation is queue-based.

---

## 9. Configuration and secrets

New settings (DB-backed, not env):

- `organization_settings.fee_due_day_of_month` (default 10)
- `organization_settings.fee_reminder_days` (default `[3,7,15,30]`)
- `organization_settings.discount_approval_threshold_percent` (default 10)
- `organization_settings.portal_message_enabled` (default true)
- `report_templates` seeded with one monthly and one quarterly catch-all template

New env: `PUPPETEER_EXECUTABLE_PATH`, `PDF_CONCURRENCY` (default 2).

---

## 10. Tests owed by this phase

### Factories added

`skillDomainFactory`, `iepPlanFactory`, `iepGoalFactory`, `iepReviewFactory`, `reportTemplateFactory`, `progressReportFactory`, `feeHeadFactory`, `feeStructureFactory`, `feeInvoiceFactory`, `feePaymentFactory`, `discountFactory`, `activityFactory`, `activityEnrollmentFactory`, `studentLeaveRequestFactory`, `medicalRecordFactory`, `behavioralIncidentFactory`.

### Unit tests — `IEPService` / `IEPGoalService`

- Publishing archives the previous active plan; two active plans are impossible.
- Revise copies goals and increments version.
- Editing an active plan throws.
- Publishing without goals, or with a goal missing a responsible teacher, throws `IEP_INCOMPLETE`.
- Progress recorded by a non-responsible teacher throws `FORBIDDEN`.
- Every status change appends a progress entry.
- Acknowledgment is idempotent.
- Publish sets `next_review_date` correctly across a month boundary and creates the scheduled review.

### Unit tests — `ProgressReportService`

- Each legal transition succeeds; each illegal one throws `INVALID_REPORT_TRANSITION`.
- Teacher cannot approve own report.
- Rejection without a comment throws.
- Duplicate period throws `REPORT_EXISTS`.
- Template resolution prefers the disability-specific template.
- Publish enqueues a PDF job and does not notify before the PDF completes.

### Unit tests — `FeeInvoiceService` / `FeePaymentService`

- Amount computation: base + multiple heads − percentage discount − scholarship, asserted to the paisa with a table-driven test of at least eight combinations.
- Unapproved discount ignored.
- Non-active students skipped, with reasons.
- Re-run generates nothing new.
- Partial payment sequence 300 + 200 on a 500 invoice → `partially_paid` then `paid`.
- Overpayment rejected.
- Payment on waived/cancelled invoice rejected.
- Reversal creates a reversing ledger call and leaves the payment row present with `status = reversed`.
- Waiver by non-principal rejected.
- Every mutation results in exactly the expected number of `LedgerPort.post()` calls with balancing debit/credit.

### Unit tests — `ActivityEnrollmentService`

- Confirmation below capacity → `confirmed` and an invoice generated.
- Confirmation at capacity → `waitlisted` with position 1, then 2.
- Withdrawal promotes position 1 and generates that student's invoice.
- Confirmation after the deadline throws `OPTIN_CLOSED`.
- Non-active student rejected.
- Activity cancellation withdraws everyone and cancels unpaid invoices.
- Activity attendance write does not create any `student_attendance` row (explicit assertion).

### Unit tests — `StudentLeaveService`

- Overlap rejected.
- Backdated rejected.
- Approval marks only working days as `excused_leave`, skipping holidays.
- Approval does not overwrite an existing `present` mark.
- Rejection without a reason throws.

### Unit tests — `PortalScopeService`

- Guardian with two children resolves both ids.
- Access to a third student's id throws `FORBIDDEN`.
- A student in `pending_admission_fee` is excluded from the scope.
- Draft IEP and unpublished reports are filtered out of portal reads.

### Integration tests

| Suite | Assertions |
|---|---|
| `iep-lifecycle.integration.spec.ts` | Create → add goals across 3 domains → publish → parent token reads goals → acknowledge → coordinator sees timestamp → revise → v2 active and v1 archived |
| `progress-report-workflow.integration.spec.ts` | Full draft→submit→reject→resubmit→approve→publish chain with role switching; parent sees only the published one |
| `fee-monthly-generation.integration.spec.ts` | Seed 20 students of mixed status and category; run generation; assert exact invoice count, amounts, and skip reasons; re-run and assert zero new invoices |
| `fee-partial-payment.integration.spec.ts` | Three partial payments settle an invoice; a fourth is rejected; receipt numbers are sequential and unique |
| `activity-waitlist.integration.spec.ts` | Capacity 3, six concurrent opt-ins → exactly 3 confirmed, 3 waitlisted with distinct positions; withdraw one → correct promotion and invoice |
| `activity-attendance-isolation.integration.spec.ts` | Mark full activity attendance, then assert the student's school attendance percentage is unchanged |
| `student-leave-to-attendance.integration.spec.ts` | Parent submits, coordinator approves, attendance rows appear as `excused_leave`, monthly percentage excludes them, unauthorized-absence count unchanged |
| `portal-scope.integration.spec.ts` | Parent A cannot read Parent B's child at any of the 15 portal endpoints — table-driven across every route |
| `portal-readonly.integration.spec.ts` | Parent token receives 403 on every non-portal write endpoint (table-driven over the full route list from the OpenAPI document) |
| `pdf-generation.integration.spec.ts` | Publish an IEP, drain the pdf queue, assert a MinIO object exists in `iep-documents` and the download URL resolves with content-type `application/pdf` |
| `ledger-outbox.integration.spec.ts` | After a month of simulated billing activity, every `pending_ledger_postings` row has a balancing counterpart and the sum of debits equals the sum of credits |

### Performance tests

- `k6/scripts/fee-invoice-generation.js` — generation for 500 students completes within the async budget and produces no duplicates.
- Portal read endpoints included in `k6/scripts/dashboard-kpi-load.js` (Phase 7) but smoke-tested here at 20 VU.

### Mutation testing

`IEPService`, `ProgressReportService`, `FeeInvoiceService`, `FeePaymentService`, `ActivityEnrollmentService`, `StudentLeaveService`, `PortalScopeService` at ≥ 75%.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] Table-driven portal isolation test covers every portal route and every non-portal write route.
- [ ] Fee computation test table covers at least eight discount/scholarship/multi-head combinations with paisa-exact expectations.
- [ ] Activity attendance isolation proven by test.
- [ ] Waitlist position uniqueness holds under 20 concurrent opt-ins.
- [ ] A generated IEP PDF and a progress report PDF are rendered in CI (headless Chromium in the test container) and asserted non-empty with the correct MIME type.
- [ ] `excused_leave` days are excluded from both the attendance percentage denominator and the unauthorized-absence count, with a hand-computed fixture.
- [ ] The debit/credit sum invariant over the whole `pending_ledger_postings` table holds after the full integration suite runs.
