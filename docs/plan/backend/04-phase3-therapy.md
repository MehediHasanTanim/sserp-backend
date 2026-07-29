# Backend Phase 3 — Therapy Module (Individual & Group)

| Field | Value |
|---|---|
| Duration | 6 weeks |
| Prerequisites | Phase 0, Phase 1 merged (Phase 2 recommended for portal therapy view) |
| Feature list coverage | 2.1–2.12 (all therapy sections including group therapy) |
| TDD sections | 6.3, 7.3 (Therapy), 8.4, 14.2 (calendar indexes) |

---

## 1. Objective and scope

Deliver the therapy centre: therapists sourced from HR, patients sourced from School students or registered externally, individual and group scheduling with recurrence and three-way conflict detection, session documentation, treatment plans, and per-patient billing for both individual and group modalities.

The hardest parts are **recurrence expansion** and **conflict detection**. Both are specified precisely below because getting them wrong produces silent double-bookings that are expensive to unwind.

**In scope**

- Therapists with multiple specializations, license tracking, availability schedules
- Patients: student-linked and external, medical history, consent forms, insurance
- Individual scheduling from three entry points, recurrence, conflict detection, waiting list
- Session lifecycle, clinical notes, supervisor co-sign, goal progress per session
- Treatment plans with versioning
- Cancellation management for single occurrences and series
- Individual billing: per-session and consolidated monthly invoices, partial payments, refunds
- Group therapy: groups, enrollment with conflict checks, waitlist, group scheduling with recurrence, per-patient attendance, per-patient invoices
- Referral management
- Calendar and list query endpoints supporting therapist, patient, and group views

**Out of scope**

- Therapy reports (Phase 7) — this phase exposes the data; the report endpoints come later
- Real ledger posting (Phase 4) — via `LedgerPort`

---

## 2. Prerequisites

- Phase 1 `employees`, `hr_leave_requests`, `holidays`, `students`.
- `HrEmployeeReadService` for therapist auto-population.
- A `SchoolStudentReadService` façade added in this phase to `modules/school`, exposing `{ id, studentCode, fullName, dateOfBirth, gender, status, disabilityCategory }` for **active students only** — this is the source of the "Student Enrollment (Active only) → Therapy Patient Selection Dropdown" integration.

---

## 3. Prisma schema additions

### Therapists

#### `therapists`
Per TDD 6.3 plus `license_number`, `availability_notes`, `contract_end_date`, `supports_supervision BOOLEAN`, `supervisor_therapist_id` (self FK, nullable).

#### `therapist_specializations`
Per TDD 6.3. Unique `(therapist_id, therapy_type)`. `supports_group` is derived, not user-entered: true for `ot`, `speech`, `music`, `dance`; false for `aba`, `assessment`. Enforced by a DB check constraint plus service-level derivation.

#### `therapist_licenses`
`id`, `therapist_id`, `license_type`, `license_number`, `issuing_authority`, `issued_date`, `expiry_date`, `attachment_id`, `status` (`valid`|`expiring`|`expired`).

#### `therapist_availability`
`id`, `therapist_id`, `day_of_week INTEGER` (0–6), `start_time`, `end_time`, `effective_from`, `effective_to`. Multiple rows per day permitted for split shifts.

### Patients

#### `patients`
Per TDD 6.3 plus `guardian_name`, `guardian_relation`, `guardian_phone`, `guardian_email`, `emergency_contact_name`, `emergency_contact_phone`, `photo_attachment_id`, `insurance_provider`, `insurance_policy_number`, `panel_details JSONB`, `discharge_date`, `discharge_reason`, `deleted_at`.

`patient_code` from `NumberingService`. When `student_id` is set, `full_name`, `date_of_birth`, and `gender` are **read-through** from `SchoolStudentReadService` at query time rather than copied, and the stored columns are left null. Rationale: single source of truth (TDD design principle). For external patients the columns are populated directly.

#### `patient_medical_history`
`id`, `patient_id`, `existing_conditions JSONB`, `medications JSONB`, `allergies JSONB`, `past_therapy_history TEXT`, `updated_by`.

#### `patient_consents`
`id`, `patient_id`, `consent_type` (`therapy`|`media`|`data_sharing`), `attachment_id`, `signed_by`, `signed_date`, `expiry_date`.

#### `referrals`
`id`, `patient_id`, `referral_source` (`self`|`doctor`|`school`|`other`), `referrer_name`, `referrer_contact`, `referral_date`, `referred_for_therapy_types TEXT[]`, `parent_referral_id` (self FK, for the multi-therapy referral chain), `attachment_id`, `notes`.

### Groups

#### `therapy_groups`
Per TDD 6.3 plus `description`, `default_duration_minutes`, `closed_at`, `close_reason`.

#### `group_memberships`
`id`, `group_id`, `patient_id`, `enrollment_date`, `exit_date`, `exit_reason`, `state` (`active`|`waitlisted`|`exited`), `waitlist_position`, `enrolled_by`. Partial unique index `(group_id, patient_id) WHERE state = 'active'`.

#### `group_history`
`id`, `group_id`, `change_type` (`membership_added`|`membership_removed`|`therapist_changed`|`schedule_changed`|`status_changed`), `detail JSONB`, `effective_date`, `changed_by`.

### Scheduling

#### `therapy_recurrences`
Per TDD 6.3 plus `session_mode`, `therapist_id`, `patient_id`, `group_id`, `therapy_type`, `start_time TIME`, `duration_minutes`, `room`, `day_of_month INTEGER` (for monthly), `status` (`active`|`ended`|`cancelled`), `generated_until DATE`, `parent_recurrence_id` (self FK — set when a series is split by an "edit from this date onward" operation).

#### `therapy_sessions`
Per TDD 6.3 plus `duration_minutes_planned`, `duration_minutes_actual`, `notes_instruction TEXT` (pre-session instructions), `cancellation_reason`, `cancelled_by`, `cancelled_at`, `no_show_recorded_by`, `recurrence_occurrence_index INTEGER`, `is_series_exception BOOLEAN`, `created_from` (`main`|`patient_profile`|`therapist_profile`|`group`|`recurrence_job`).

Constraints:
- `CHECK ((session_mode = 'individual' AND group_id IS NULL) OR (session_mode = 'group' AND patient_id IS NULL AND group_id IS NOT NULL))`
- `CHECK (therapy_type <> 'assessment' OR patient_id IS NOT NULL OR assessment_patient_name IS NOT NULL)`
- `CHECK (scheduled_end > scheduled_start)`
- Exclusion constraint for therapist double-booking:
  `EXCLUDE USING gist (therapist_id WITH =, tstzrange(scheduled_start, scheduled_end) WITH &&) WHERE (status IN ('scheduled','in_progress'))`
- Equivalent exclusion constraint on `room` where room is not null.

These GiST exclusion constraints (requiring the `btree_gist` extension) are the database-level guarantee behind conflict detection. The service layer still checks first to produce a friendly `SCHEDULE_CONFLICT` response with the conflicting session's details.

#### `group_session_attendances`
Per TDD 6.3 plus `arrival_time`, `individual_notes TEXT`, `marked_by`, `marked_at`. Unique `(session_id, patient_id)`.

#### `session_notes`
RLS-protected (Phase 9). `id`, `session_id`, `patient_id`, `narrative TEXT`, `observations TEXT`, `interventions_used JSONB`, `homework_assigned TEXT`, `authored_by`, `authored_at`, `supervisor_reviewed_by`, `supervisor_reviewed_at`, `supervisor_comment`, `status` (`draft`|`final`|`co_signed`). One row per patient per session — so a group session has one row per attending patient plus an optional group-level narrative on the session itself.

#### `session_attachments`
`id`, `session_id`, `patient_id` (nullable for group-wide material), `attachment_id`, `caption`.

#### `therapy_waiting_list`
`id`, `patient_id`, `therapy_type`, `preferred_therapist_id`, `preferred_days INTEGER[]`, `preferred_time_from`, `preferred_time_to`, `group_id` (nullable — for group waitlists), `priority INTEGER`, `requested_date`, `status` (`waiting`|`offered`|`scheduled`|`cancelled`), `offered_at`, `offer_expires_at`, `notes`.

### Treatment plans

#### `treatment_plans`
`id`, `patient_id`, `therapy_type`, `version`, `start_date`, `review_date`, `status` (`draft`|`active`|`under_review`|`archived`), `previous_version_id`, `created_by_therapist_id`, `shared_with_guardian_at`, `document_attachment_id`. Partial unique index: one `active` plan per `(patient_id, therapy_type)`.

#### `treatment_goals`
`id`, `treatment_plan_id`, `goal_type` (`short_term`|`long_term`), `description`, `target_behavior`, `baseline_measurement`, `target_measurement`, `measurement_unit`, `target_date`, `status` (`not_started`|`in_progress`|`achieved`|`discontinued`), `sequence`.

#### `treatment_goal_progress`
`id`, `treatment_goal_id`, `session_id`, `measured_value`, `progress_percentage`, `narrative`, `recorded_by`, `recorded_at`. This is the "goal progress update per session" link (2.7, 2.12.6).

### Billing

#### `therapy_fee_structures`
`id`, `therapy_type`, `session_mode` (`individual`|`group`), `duration_minutes`, `group_id` (nullable — per-group override), `amount INTEGER`, `effective_from`, `effective_to`. Resolution order: group-specific → mode + type + duration → mode + type.

#### `therapy_invoices`
Per TDD 6.3 plus `invoice_number` (unique), `session_mode`, `group_id`, `billing_type` (`per_session`|`monthly_consolidated`), `period_month`, `period_year`, `gross_amount`, `discount_amount`, `net_amount`, `paid_amount`, `outstanding_amount`, `cancelled_reason`.

#### `therapy_invoice_lines`
`id`, `invoice_id`, `session_id`, `description`, `amount`, `discount_amount`, `net_amount`. Needed because a consolidated monthly invoice covers many sessions.

#### `therapy_payments`
`id`, `receipt_number` (unique), `invoice_id`, `patient_id`, `amount`, `method`, `reference`, `payment_date`, `received_by`, `status` (`recorded`|`reversed`).

#### `therapy_refunds`
`id`, `patient_id`, `payment_id`, `amount`, `reason`, `refund_date`, `approved_by`, `method`, `status`.

#### `therapy_discounts`
`id`, `patient_id`, `invoice_id` (nullable), `group_id` (nullable), `discount_type`, `value`, `reason`, `approved_by`, `approved_at`. Per feature 2.12.8, a per-patient group discount must not affect other group members — enforced by scoping the discount to `(patient_id, invoice_id)`.

### Indexes added

Per TDD 6.7 plus:

```
therapy_sessions (therapist_id, scheduled_start)
therapy_sessions (patient_id, scheduled_start)
therapy_sessions (group_id, scheduled_start)
therapy_sessions (status, scheduled_start)
therapy_sessions (recurrence_id, recurrence_occurrence_index)
group_session_attendances (session_id), (patient_id)
group_memberships (group_id, state), (patient_id, state)
therapy_invoices (patient_id, status), (period_year, period_month)
therapy_waiting_list (therapy_type, status, priority)
treatment_goals (treatment_plan_id, status)
therapist_licenses (expiry_date, status)
```

---

## 4. Module and file structure

```
src/modules/therapy/
├── therapy.module.ts
├── controllers/
│   ├── therapist.controller.ts
│   ├── therapist-availability.controller.ts
│   ├── patient.controller.ts
│   ├── referral.controller.ts
│   ├── session.controller.ts
│   ├── recurrence.controller.ts
│   ├── group.controller.ts
│   ├── group-session.controller.ts
│   ├── session-note.controller.ts
│   ├── treatment-plan.controller.ts
│   ├── waiting-list.controller.ts
│   ├── therapy-fee.controller.ts
│   ├── therapy-invoice.controller.ts
│   └── schedule-view.controller.ts        # unified calendar/list feed
├── services/
│   ├── therapist.service.ts
│   ├── therapist-license.service.ts
│   ├── patient.service.ts
│   ├── referral.service.ts
│   ├── session.service.ts
│   ├── recurrence.service.ts              # pattern expansion, series edits
│   ├── conflict-detection.service.ts      # THE critical service
│   ├── group.service.ts
│   ├── group-membership.service.ts
│   ├── group-session.service.ts
│   ├── group-attendance.service.ts
│   ├── session-note.service.ts
│   ├── treatment-plan.service.ts
│   ├── waiting-list.service.ts
│   ├── therapy-billing.service.ts
│   ├── therapy-payment.service.ts
│   └── schedule-query.service.ts
├── listeners/
│   ├── hr-leave-conflict.listener.ts      # hr.leave.approved → flag conflicting sessions
│   └── session-completed-billing.listener.ts
├── jobs/
│   ├── recurrence-materialisation.job.ts
│   ├── license-expiry-alert.job.ts
│   ├── monthly-consolidated-invoice.job.ts
│   ├── waiting-list-offer-expiry.job.ts
│   └── no-show-auto-mark.job.ts
└── policies/{patient,session}.policy.ts
```

---

## 5. API endpoints

### Therapists

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/therapy/therapists` | coordinator, principal(R), receptionist, super_admin |
| POST | `/therapy/therapists` | coordinator, super_admin |
| GET | `/therapy/therapists/:id` | coordinator, principal(R), therapist(own) |
| PATCH | `/therapy/therapists/:id` | coordinator, super_admin |
| PUT | `/therapy/therapists/:id/specializations` | coordinator, super_admin |
| GET/PUT | `/therapy/therapists/:id/availability` | coordinator, therapist(own) |
| GET/POST | `/therapy/therapists/:id/licenses` | coordinator, therapist(own) |
| GET | `/therapy/therapists/:id/summary` | coordinator, principal | Sessions conducted, cancellations, patients served |
| GET | `/therapy/therapists/:id/sessions` | coordinator, therapist(own) | Calendar or list, `?view=calendar\|list` |

### Patients

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/therapy/patients` | coordinator, therapist, receptionist, accountant(R) |
| POST | `/therapy/patients` | coordinator, receptionist | External registration |
| POST | `/therapy/patients/from-student` | coordinator, receptionist | Link an active student |
| GET | `/therapy/patients/eligible-students` | coordinator, receptionist | Active students not yet patients |
| GET | `/therapy/patients/:id` | coordinator, therapist(scoped), receptionist |
| PATCH | `/therapy/patients/:id` | coordinator, receptionist |
| POST | `/therapy/patients/:id/discharge` | coordinator | Reason mandatory |
| GET/PUT | `/therapy/patients/:id/medical-history` | coordinator, therapist(scoped) |
| GET/POST | `/therapy/patients/:id/consents` | coordinator, receptionist |
| GET/POST | `/therapy/patients/:id/referrals` | coordinator |
| GET | `/therapy/patients/:id/sessions` | coordinator, therapist(scoped) | `?view=calendar\|list`, includes group sessions |
| GET | `/therapy/patients/:id/progress-summary` | coordinator, therapist(scoped) | Per therapy type |
| GET | `/therapy/patients/:id/billing-summary` | accountant, coordinator | Outstanding balance overview |

### Individual sessions

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/therapy/sessions` | coordinator, therapist(scoped), accountant(R), receptionist | Filters: therapist, patient, group, type, mode, status, date range |
| POST | `/therapy/sessions` | coordinator, therapist, receptionist | Schedule one session |
| POST | `/therapy/sessions/check-conflicts` | same | Dry-run conflict check for the UI |
| GET | `/therapy/sessions/:id` | scoped |
| PATCH | `/therapy/sessions/:id` | coordinator, therapist(own) | Edit single occurrence; marks `is_series_exception` |
| POST | `/therapy/sessions/:id/cancel` | coordinator, therapist(own) | Reason mandatory |
| POST | `/therapy/sessions/:id/start` | therapist(own) | → `in_progress`, sets `actual_start` |
| POST | `/therapy/sessions/:id/complete` | therapist(own) | → `completed`, sets `actual_end`, triggers billing |
| POST | `/therapy/sessions/:id/no-show` | therapist(own), coordinator | → `no_show` |
| POST | `/therapy/sessions/:id/reschedule` | coordinator, therapist(own) | Drag-and-drop target; runs conflict check |

### Recurrence

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| POST | `/therapy/sessions/recurring` | coordinator, therapist | Create series; returns generated occurrences and any conflicts |
| GET | `/therapy/recurrences/:id` | scoped | Series definition + occurrences |
| PATCH | `/therapy/recurrences/:id/from/:sessionId` | coordinator, therapist | Edit series from this occurrence onward (splits the series) |
| POST | `/therapy/recurrences/:id/cancel-from/:sessionId` | coordinator, therapist | Bulk cancel from a point onward |
| POST | `/therapy/recurrences/:id/cancel-all` | coordinator | Cancel all future occurrences |

### Groups

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/therapy/groups` | coordinator, therapist, accountant(R), receptionist |
| POST | `/therapy/groups` | coordinator, super_admin |
| GET | `/therapy/groups/:id` | scoped | Members, therapist, schedule, capacity |
| PATCH | `/therapy/groups/:id` | coordinator |
| POST | `/therapy/groups/:id/close` | coordinator | Reason mandatory |
| GET | `/therapy/groups/:id/members` | coordinator, therapist |
| POST | `/therapy/groups/:id/enroll` | coordinator | Multi-patient enroll with per-patient conflict check |
| POST | `/therapy/groups/:id/members/:patientId/exit` | coordinator | Reason + effective date; promotes waitlist |
| GET | `/therapy/groups/:id/history` | coordinator, principal |
| POST | `/therapy/groups/:id/sessions` | coordinator, therapist | Single or recurring group session |
| GET | `/therapy/groups/:id/sessions` | scoped |
| GET | `/therapy/groups/:id/sessions/:sessionId/attendance` | coordinator, therapist |
| PATCH | `/therapy/groups/:id/sessions/:sessionId/attendance` | therapist(own), coordinator | Per-patient attendance batch |
| GET | `/therapy/groups/:id/billing-summary` | accountant, coordinator | Per-patient billing/collection state |

### Session documentation

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST | `/therapy/sessions/:id/notes` | therapist(own), coordinator(R), supervisor |
| PATCH | `/therapy/session-notes/:noteId` | author (draft only) |
| POST | `/therapy/session-notes/:noteId/finalise` | author |
| POST | `/therapy/session-notes/:noteId/co-sign` | supervisor therapist |
| GET/POST | `/therapy/sessions/:id/attachments` | therapist(own), coordinator |
| POST | `/therapy/sessions/:id/goal-progress` | therapist(own) | Batch progress updates against treatment goals |

### Treatment plans

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/therapy/patients/:id/treatment-plans` | coordinator(R), therapist(scoped), parent(scoped R) |
| POST | `/therapy/patients/:id/treatment-plans` | therapist |
| POST | `/therapy/treatment-plans/:id/revise` | therapist |
| PATCH | `/therapy/treatment-plans/:id` | author (draft only) |
| POST | `/therapy/treatment-plans/:id/activate` | therapist |
| GET/POST/PATCH | `/therapy/treatment-plans/:id/goals` | therapist |
| POST | `/therapy/treatment-plans/:id/share` | therapist, coordinator | Generate report and share with guardian |
| GET | `/therapy/treatment-plans/:id/document` | scoped incl. parent |

### Waiting list

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/therapy/waiting-list` | coordinator, receptionist | Ordered by priority then request date |
| POST | `/therapy/waiting-list` | coordinator, receptionist |
| POST | `/therapy/waiting-list/:id/offer` | coordinator | Offer a slot; sets expiry |
| POST | `/therapy/waiting-list/:id/convert` | coordinator | Convert to a scheduled session |
| DELETE | `/therapy/waiting-list/:id` | coordinator |

### Billing

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/therapy/fee-structures` | accountant, super_admin, principal |
| GET | `/therapy/invoices` | accountant, coordinator, receptionist, principal(R) |
| POST | `/therapy/invoices/generate-monthly` | accountant | Consolidated monthly per patient |
| GET | `/therapy/invoices/:id` | scoped |
| POST | `/therapy/invoices/:id/payments` | accountant, receptionist | Partial allowed |
| POST | `/therapy/payments/:id/reverse` | accountant, principal |
| POST | `/therapy/invoices/:id/discount` | accountant + principal approval |
| POST | `/therapy/refunds` | accountant, principal |
| GET | `/therapy/patients/:id/payment-history` | accountant, coordinator |

### Unified schedule feed

| Method | Endpoint | Description |
|---|---|---|
| GET | `/therapy/schedule` | Single endpoint powering all calendar views. Params: `view=day\|week\|month`, `date`, `therapistId?`, `patientId?`, `groupId?`, `therapyType?`, `status?`, `mode?`. Returns individual and group sessions in one array with a `mode` discriminator and colour-coding hints. This is the endpoint targeted by the TDD's 1-second month-view performance requirement. |

---

## 6. Business rules and invariants

### Therapists

| # | Rule | Error |
|---|---|---|
| T-01 | A therapist record requires an existing HR employee whose `department = 'therapy'`. Name, phone, and designation are read from HR, never stored. | `INVALID_EMPLOYEE` 422 |
| T-02 | One therapist record per employee. | `THERAPIST_EXISTS` 409 |
| T-03 | `supports_group` is derived from `therapy_type`, not accepted from the client. | — |
| T-04 | A therapist with `employment_type = contractual` and a past `contract_end_date` cannot be assigned to new sessions. | `THERAPIST_UNAVAILABLE` 422 |
| T-05 | A daily job sets license `status` to `expiring` at 30 days and `expired` past the date, emitting alerts. | — |

### Patients

| # | Rule | Error |
|---|---|---|
| PA-01 | Enrolling from a student requires the student's status to be `active`. Pending-fee and inactive students are not selectable. | `STUDENT_NOT_ACTIVE` 422 |
| PA-02 | One patient record per student. | `PATIENT_EXISTS` 409 |
| PA-03 | External patient registration requires name, DOB, gender, guardian name, and guardian phone. | `VALIDATION_ERROR` 400 |
| PA-04 | For a student-linked patient, demographic fields are read-through from School. Attempting to `PATCH` them returns an error directing the caller to the student record. | `MANAGED_BY_SCHOOL` 409 |
| PA-05 | Discharge requires a reason and blocks new session scheduling; existing future sessions must be cancelled first. | `FUTURE_SESSIONS_EXIST` 409 |
| PA-06 | `assessment_only` patients may only be scheduled for `assessment` sessions. | `THERAPY_TYPE_NOT_PERMITTED` 422 |

### Scheduling — individual

| # | Rule | Error |
|---|---|---|
| SC-01 | `therapy_type = assessment` accepts a free-text `assessment_patient_name` **or** a registered `patient_id`. All other therapy types require a registered `patient_id` from the dropdown. | `PATIENT_REQUIRED` 422 |
| SC-02 | The assigned therapist must hold the session's `therapy_type` as a specialization. | `SPECIALIZATION_MISMATCH` 422 |
| SC-03 | `scheduled_end = scheduled_start + duration_minutes`; end must be after start; duration must be between 15 and 240 minutes. | `VALIDATION_ERROR` 400 |
| SC-04 | Scheduling on a holiday is a warning, not a block — therapy centres may operate on school holidays. The response includes `warnings[]`. | — |

### Conflict detection

`ConflictDetectionService.check(candidate)` returns a structured result with `blocking[]` and `warnings[]`. Blocking conflicts reject the write with `409 SCHEDULE_CONFLICT` and include the conflicting session's id, time, and label.

| # | Check | Severity | Rule |
|---|---|---|---|
| C-01 | Therapist overlap | Blocking | Any `scheduled` or `in_progress` session for the same therapist whose `[start, end)` overlaps. Group sessions count. |
| C-02 | Room overlap | Blocking | Same, keyed on non-null `room`. |
| C-03 | Patient overlap — individual | Blocking | Any session where the patient is the individual patient. |
| C-04 | Patient overlap — group | Blocking | Any **group** session whose group has this patient as an `active` member and which overlaps. This is the cross-modality check required by feature 2.12.4 and TDD integration row "Group Therapy Conflict Check". |
| C-05 | Therapist approved leave | Blocking | Overlap with an approved `hr_leave_requests` range for the therapist's employee. TDD 2.5.4 says "warn"; we make it blocking with an explicit `force: true` override available to coordinators, recorded in the audit log. Rationale documented in `docs/adr/0003-leave-conflict-blocking.md`. |
| C-06 | Outside therapist availability | Warning | No `therapist_availability` row covering the weekday and time window. |
| C-07 | Therapist contract ended | Blocking | `contract_end_date < session date`. |
| C-08 | Holiday | Warning | Session date is a holiday. |
| C-09 | Capacity | Blocking (group) | Active group membership count exceeds `capacity_max`. |

Interval comparison uses half-open ranges `[start, end)` so a session ending at 10:00 and one starting at 10:00 do **not** conflict. This is asserted by an explicit boundary test.

### Recurrence

| # | Rule | Error |
|---|---|---|
| R-01 | Patterns: `daily`, `weekly` (with `days_of_week`), `biweekly` (with `days_of_week`), `monthly` (with `day_of_month`). | `VALIDATION_ERROR` 400 |
| R-02 | End condition is exactly one of: `recurrence_end` date, `max_sessions` count, or indefinite. Supplying two is rejected. | `VALIDATION_ERROR` 400 |
| R-03 | Indefinite series are **materialised in a rolling 90-day window** by a nightly job, tracked via `generated_until`. Occurrences are never generated unboundedly. A hard cap of 500 occurrences applies to bounded series. | `RECURRENCE_TOO_LARGE` 422 |
| R-04 | Creating a series runs the conflict check per occurrence. Conflicting occurrences are **skipped, not silently double-booked**, and returned in a `skipped[]` array with reasons. The caller decides whether to accept. A `strict: true` flag rejects the whole series if any occurrence conflicts. | `SCHEDULE_CONFLICT` 409 (strict mode) |
| R-05 | Editing a single occurrence sets `is_series_exception = true`; subsequent series-wide edits skip exceptions. | — |
| R-06 | "Edit series from this date onward" ends the current recurrence at the previous occurrence, creates a new recurrence with `parent_recurrence_id` set, and regenerates only future occurrences. Past and completed occurrences are never touched. | — |
| R-07 | Cancelling a series never modifies `completed` occurrences. | — |
| R-08 | Occurrence generation is timezone-safe: local wall-clock time is preserved across DST transitions by generating from local date + time and converting to UTC per occurrence, not by adding fixed 24-hour offsets. | — |

### Sessions and notes

| # | Rule | Error |
|---|---|---|
| SS-01 | Status transitions: `scheduled → in_progress → completed`; `scheduled → cancelled \| no_show`; `in_progress → completed \| cancelled`. Nothing leaves `completed`. | `INVALID_SESSION_TRANSITION` 409 |
| SS-02 | Cancellation requires a reason and records who and when. | `VALIDATION_ERROR` 400 |
| SS-03 | Completing a session records `actual_end` and emits `therapy_session.completed`, triggering invoice generation. | — |
| SS-04 | Only the assigned therapist may author notes for their session; a coordinator may read but not author. | `FORBIDDEN` 403 |
| SS-05 | Notes are editable only while `draft`. Finalising locks the narrative; corrections require an appended amendment note. | `NOTE_FINALISED` 409 |
| SS-06 | Co-signing requires a therapist flagged `supports_supervision` and different from the author. | `INVALID_SUPERVISOR` 422 |
| SS-07 | A group session may carry a group-level narrative plus optional per-patient notes; per-patient notes are permitted only for patients marked `present` or `late`. | `PATIENT_NOT_PRESENT` 422 |
| SS-08 | A job marks sessions still `scheduled` 24 hours after their end time as `no_show`, attributed to the system. | — |

### Groups

| # | Rule | Error |
|---|---|---|
| G-01 | Group `therapy_type` must be one of `ot`, `speech`, `music`, `dance`. `aba` and `assessment` are rejected. | `THERAPY_TYPE_NOT_GROUPABLE` 422 |
| G-02 | The group therapist must hold that specialization with `supports_group = true`. | `SPECIALIZATION_MISMATCH` 422 |
| G-03 | `capacity_min ≤ capacity_max`, both ≥ 1. | `VALIDATION_ERROR` 400 |
| G-04 | Active membership count may not exceed `capacity_max`; beyond it, patients become `waitlisted` with a unique sequential position assigned under a row lock. | — |
| G-05 | Multi-patient enrollment is transactional per patient: each patient is conflict-checked against the group's scheduled sessions, and the response reports per-patient success or rejection. Patients who conflict are not enrolled. | — |
| G-06 | A patient may belong to multiple groups, but not two groups whose sessions overlap. | `SCHEDULE_CONFLICT` 409 |
| G-07 | Exit requires a reason and an effective date, sets `exit_date`, and promotes the first waitlisted patient. | `VALIDATION_ERROR` 400 |
| G-08 | A group with fewer than `capacity_min` active members can still be scheduled but the response returns an `UNDER_MINIMUM_CAPACITY` warning. | — |
| G-09 | Scheduling a group session auto-loads the therapist and all `active` members at schedule time; membership changes after scheduling affect attendance rows for future sessions only. | — |
| G-10 | Every membership, therapist, or schedule change writes a `group_history` row. | — |
| G-11 | Closing a group requires no future scheduled sessions. | `FUTURE_SESSIONS_EXIST` 409 |

### Group attendance

| # | Rule | Error |
|---|---|---|
| GA-01 | Attendance rows are pre-created for all active members when a group session moves to `in_progress`, defaulting to `absent`. | — |
| GA-02 | Statuses: `present`, `absent`, `late`, `excused`. | `VALIDATION_ERROR` 400 |
| GA-03 | Attendance may be submitted only for `in_progress` or `completed` sessions. | `INVALID_SESSION_STATE` 409 |
| GA-04 | Marking a patient who is not an active member of the group is rejected. | `NOT_A_MEMBER` 422 |
| GA-05 | Submitting attendance is idempotent per `(session, patient)`. | — |

### Billing

| # | Rule | Error |
|---|---|---|
| BI-01 | Fee resolution order: group-specific override → `(mode, therapy_type, duration)` → `(mode, therapy_type)`. No match is an error, not a zero-amount invoice. | `NO_FEE_STRUCTURE` 422 |
| BI-02 | Completing an individual session generates one invoice for that patient, unless the patient is on monthly consolidated billing. | — |
| BI-03 | Completing a group session generates **one invoice per enrolled patient** — never a single group invoice. This is the central rule of feature 2.12.8. | — |
| BI-04 | An `absent` patient in a group session **is still billed** (feature 2.12.8 and TDD scenario THR-E2E-06 assert this). An `excused` patient is not billed. | — |
| BI-05 | A `cancelled` session generates no invoice. A `no_show` individual session generates an invoice at the configured no-show rate (default: full rate), controlled by `organization_settings.bill_no_show`. | — |
| BI-06 | Invoice generation is idempotent per `(session_id, patient_id)`. Replaying `therapy_session.completed` creates nothing new. | — |
| BI-07 | Monthly consolidated invoicing groups all of a patient's billable sessions for the month into one invoice with one line per session. Sessions already invoiced per-session are excluded. | — |
| BI-08 | Partial payments allowed; overpayment rejected. | `OVERPAYMENT` 422 |
| BI-09 | A per-patient discount on a group invoice affects only that invoice. A test explicitly asserts sibling invoices are unchanged. | — |
| BI-10 | Refunds require an existing recorded payment, an amount not exceeding the paid amount minus prior refunds, and principal or accountant approval. | `REFUND_EXCEEDS_PAYMENT` 422 |
| BI-11 | Every billing mutation calls `LedgerPort.post()` in the same transaction, with the cost center `therapy`. | — |

---

## 7. Domain events

**Emitted:** `therapy_session.scheduled`, `therapy_session.rescheduled`, `therapy_session.cancelled`, `therapy_session.completed`, `therapy_session.no_show`, `group_session.scheduled`, `group_session.cancelled`, `group_session.completed`, `group.member.enrolled`, `group.member.exited`, `group.waitlist.promoted`, `therapy_invoice.generated`, `therapy.payment.received`, `therapy.refund.issued`, `therapist.license.expiring`, `therapist.license.expired`, `waiting_list.slot_offered`, `treatment_plan.activated`, `treatment_plan.shared`.

**Consumed**

| Event | Handler | Action |
|---|---|---|
| `hr.leave.approved` | `HrLeaveConflictListener` | Find the therapist's overlapping `scheduled` sessions, flag them, notify the coordinator with a list |
| `hr.leave.cancelled` | `HrLeaveConflictListener` | Clear the flags |
| `therapy_session.completed` | `SessionCompletedBillingListener` | Generate invoice(s) |
| `group_session.completed` | `SessionCompletedBillingListener` | Generate one invoice per billable patient |
| `therapy_session.cancelled` | `NotificationPort` consumer | Guardian notification per affected patient (all group members for a group session) |

### Ledger postings added

| Trigger | Debit | Credit | Cost center |
|---|---|---|---|
| Therapy invoice issued | `1210 AR — Patients` | `4010 Therapy Income — {type}` | therapy |
| Group therapy invoice issued | `1210 AR — Patients` | `4011 Group Therapy Income — {type}` | therapy |
| Payment received | `1010 Cash` / `1020 Bank` | `1210 AR — Patients` | therapy |
| Refund issued | `1210 AR — Patients` | `1010 Cash` / `1020 Bank` | therapy |
| Discount | `5092 Therapy Discount` | `1210 AR — Patients` | therapy |

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `recurrence-materialisation` | Daily 00:45 | Extend indefinite series to a rolling 90-day horizon |
| `license-expiry-alert` | Daily 07:30 | Set license status, emit 30-day and expiry alerts |
| `no-show-auto-mark` | Hourly | Mark stale `scheduled` sessions as `no_show` |
| `monthly-consolidated-invoice` | 1st of month 02:30 | Generate consolidated invoices for opted-in patients |
| `waiting-list-offer-expiry` | Hourly | Expire unaccepted offers, re-queue the patient |
| `session-reminder` | Daily 18:00 | Next-day session reminders to guardians |

Queue added: `therapy-ops`.

---

## 9. Configuration and secrets

New settings:

- `organization_settings.bill_no_show` (default true)
- `organization_settings.recurrence_horizon_days` (default 90)
- `organization_settings.recurrence_max_occurrences` (default 500)
- `organization_settings.waiting_list_offer_ttl_hours` (default 48)
- `organization_settings.therapy_rooms JSONB` — the room list used for conflict detection and dropdowns

Postgres extension required: `btree_gist` for the exclusion constraints.

---

## 10. Tests owed by this phase

### Factories added

`therapistFactory` (with per-specialization traits), `therapistAvailabilityFactory`, `licenseFactory`, `patientFactory` (`externalPatient`, `studentLinkedPatient`, `assessmentOnlyPatient` traits), `groupFactory`, `membershipFactory`, `sessionFactory` (`individualSession`, `groupSession`, `assessmentSession`), `recurrenceFactory`, `sessionNoteFactory`, `treatmentPlanFactory`, `treatmentGoalFactory`, `therapyFeeStructureFactory`, `therapyInvoiceFactory`, `waitingListFactory`.

### Unit tests — `ConflictDetectionService`

This service gets the most thorough test suite in the phase. Table-driven across all nine checks, plus:

- Boundary: a session ending exactly when another starts produces **no** conflict.
- One-minute overlap produces a conflict.
- Fully contained, partially overlapping, and identical intervals all conflict.
- A cancelled session never conflicts.
- A completed session never conflicts.
- Group session blocks an individual session for a member patient (C-04) — the cross-modality case.
- Group session does **not** block an individual session for a non-member.
- Exited group members are not blocked.
- Approved leave blocks; pending leave does not; rejected leave does not.
- `force: true` bypasses C-05 only, not C-01 or C-02.
- Availability gap produces a warning, not a block.
- Room conflict ignored when both sessions have a null room.

### Unit tests — `RecurrenceService`

- Weekly with `days_of_week = [1,3,5]` over 4 weeks generates exactly 12 occurrences on correct dates.
- Biweekly skips alternate weeks correctly.
- Monthly on day 31 handles February and 30-day months by clamping to the last day, documented and asserted.
- `max_sessions = 5` stops at 5 regardless of the end date.
- Both `recurrence_end` and `max_sessions` supplied → rejected.
- Indefinite series generates exactly the horizon window and sets `generated_until`.
- Series exceeding 500 occurrences rejected.
- Conflicting occurrences skipped with reasons in non-strict mode; whole series rejected in strict mode.
- Edit-from-onward splits the series, preserves past occurrences, and links via `parent_recurrence_id`.
- Single-occurrence edit sets `is_series_exception` and survives a later series-wide edit.
- Cancel-from-onward leaves completed occurrences untouched.
- DST: a weekly 09:00 series spanning a DST transition keeps local 09:00 for every occurrence.

### Unit tests — `GroupMembershipService` / `GroupSessionService` / `GroupAttendanceService`

- Non-groupable therapy type rejected.
- Therapist without `supports_group` rejected.
- Enrollment at capacity waitlists with sequential positions.
- Multi-patient enrollment returns per-patient outcomes; a conflicting patient is excluded while others succeed.
- Patient in two groups with overlapping sessions rejected.
- Exit promotes the first waitlisted patient and emits the event.
- Attendance rows pre-created on session start.
- Marking a non-member rejected.
- Attendance submission idempotent.
- Per-patient note on an absent patient rejected.

### Unit tests — `TherapyBillingService`

- Fee resolution follows the three-level order; a missing structure throws.
- Individual session completion produces exactly one invoice.
- Group session with 4 members produces exactly 4 invoices with equal amounts.
- Absent patient billed; excused patient not billed.
- Cancelled session produces zero invoices.
- No-show billed per the setting, both true and false.
- Replay produces no duplicates.
- Monthly consolidation groups the right sessions and excludes already-invoiced ones.
- A discount on patient B's group invoice leaves patients A, C, D unchanged — explicit sibling assertion.
- Refund exceeding the paid amount rejected.
- Ledger call count and debit/credit balance asserted for each path.

### Unit tests — `SessionService`, `TreatmentPlanService`, `PatientService`, `WaitingListService`

- Session transitions legal and illegal.
- Assessment session accepts free-text name; speech session does not.
- Specialization mismatch rejected.
- Note finalisation locks edits; co-sign requires a different supervising therapist.
- Treatment plan: one active per `(patient, therapy_type)`; revise increments version.
- Patient from a non-active student rejected; duplicate patient rejected; demographic PATCH on a linked patient rejected.
- Discharge with future sessions rejected.
- Waiting list ordering by priority then date; offer expiry re-queues.

### Integration tests

| Suite | Assertions |
|---|---|
| `session-conflict.integration.spec.ts` | Real GiST exclusion constraint verified: two overlapping inserts for one therapist — second fails at the DB level even if the service check is bypassed |
| `recurrence-series.integration.spec.ts` | Create an 8-week weekly series, cancel week 4 only, assert weeks 1–3 and 5–8 remain `scheduled` (mirrors TDD THR-E2E-03) |
| `group-lifecycle.integration.spec.ts` | Create a music group, enroll 4 patients, schedule weekly sessions, complete one, mark 2 present / 1 absent / 1 late, assert 4 invoices with the absent patient billed (mirrors THR-E2E-06) |
| `group-individual-conflict.integration.spec.ts` | Enroll patient in a group with a Tuesday 10:00 session, attempt an individual session at Tuesday 10:30, assert 409 naming the group session (mirrors THR-E2E-08) |
| `group-billing-independence.integration.spec.ts` | 4 group invoices, pay 2, discount 1, assert the fourth is untouched and the group billing summary reports 2 paid / 1 discounted / 1 pending (mirrors THR-E2E-07) |
| `therapist-leave-conflict.integration.spec.ts` | Approve therapist leave in HR, assert overlapping sessions are flagged and the coordinator has a notification |
| `patient-from-student.integration.spec.ts` | Pending-fee student rejected; after fee payment the same student is selectable; demographic read-through returns the school's values |
| `assessment-session.integration.spec.ts` | Free-text assessment session saves and appears in the schedule feed (mirrors THR-E2E-09) |
| `schedule-feed.integration.spec.ts` | `/therapy/schedule` returns individual and group sessions together for therapist, patient, and group filters, with correct mode discriminators |
| `session-notes-rbac.integration.spec.ts` | Therapist A cannot author or read notes on therapist B's session; coordinator can read but not author |
| `cancellation-notification.integration.spec.ts` | Cancelling a group session creates one notification row per enrolled patient's guardian (mirrors THR-E2E-10) |
| `therapy-ledger-outbox.integration.spec.ts` | Debits equal credits across all therapy postings after a simulated month |

Endpoint coverage: 100% of section 5.

### Performance tests

- `k6/scripts/therapy-calendar-load.js` — exactly the TDD 18.8.2 script: `GET /therapy/schedule?view=month` with 200 seeded sessions, 50 VU × 10 min, p95 < 1,000 ms.
- `k6/scripts/group-session-schedule.js` — `POST /therapy/groups/:id/sessions` recurring, 20 VU × 5 min.

### Mutation testing

`ConflictDetectionService`, `RecurrenceService`, `GroupMembershipService`, `TherapyBillingService`, `SessionService` at ≥ 75%. `ConflictDetectionService` should target ≥ 85% given its density of conditionals.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] The GiST exclusion constraints are proven to reject overlaps at the database level, independent of the service check.
- [ ] Half-open interval semantics asserted by an explicit boundary test.
- [ ] Cross-modality conflict (group blocks individual for a member) proven in both unit and integration tests.
- [ ] A group session with N members always produces exactly N invoices — asserted for N = 1, 4, and `capacity_max`.
- [ ] Per-patient discount independence proven.
- [ ] DST correctness proven for a weekly series spanning a transition.
- [ ] Indefinite recurrence never generates beyond the horizon; verified by asserting the occurrence count after two consecutive job runs.
- [ ] `/therapy/schedule` month view with 200 sessions returns under 1 second at p95 in the k6 run.
- [ ] `SchoolStudentReadService` is the only path from Therapy to student data — enforced by a Semgrep rule.
- [ ] Portal therapy endpoint from Phase 2 now returns real individual and group sessions.
