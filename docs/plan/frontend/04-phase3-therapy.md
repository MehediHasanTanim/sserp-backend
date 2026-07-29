# Frontend Phase 3 — Therapy Module (Individual & Group)

| Field | Value |
|---|---|
| Duration | 6 weeks |
| Prerequisites | Frontend Phase 0, 1; Backend Phase 3 contract published |
| Feature list coverage | 2.1–2.12 (all therapy sections including group therapy) |
| Backend counterpart | [backend/04-phase3-therapy.md](../backend/04-phase3-therapy.md) |

---

## 1. Objective and scope

Build the therapy centre interface. The dominant piece of work is the **scheduling calendar**: a FullCalendar-based view that must display individual and group sessions together, support drag-and-drop rescheduling with conflict feedback, handle recurrence, render in under one second with 200 events on a constrained connection, and be usable without a mouse.

Everything else in this phase orbits that calendar. The three scheduling entry points from feature 2.5 (main scheduling page, patient profile, therapist profile) all open the same session dialog, so the dialog is built once and reused.

**In scope**

- Therapist list and profile, specializations, availability editor, licenses with expiry indicators
- Patient registration (external and from an active student), medical history, consents, referrals, discharge
- The unified therapy calendar with day, week, and month views and therapist, patient, group, and type filters
- Session scheduling dialog with live conflict detection, from all three entry points
- Recurrence builder with an occurrence preview and conflict reporting
- Session lifecycle actions, drag-and-drop reschedule, cancellation for single occurrences and series
- Session notes editor with finalisation and supervisor co-sign
- Treatment plans with goals, versioning, per-session goal progress
- Waiting list with slot offers
- Group management: creation, member enrollment with per-patient conflict feedback, waitlist, group scheduling, per-patient attendance, group billing summary
- Therapy fee structures, invoices, payments, refunds, discounts
- Portal therapy schedule view (completing the Phase 2 placeholder)

**Out of scope**

- Therapy reports and dashboards — Phase 7

---

## 2. Prerequisites

- Phase 1 employee and student data.
- Backend Phase 3 contract, in particular `GET /therapy/schedule` (the unified feed) and `POST /therapy/sessions/check-conflicts` (the dry-run check that powers live feedback in the dialog).

The dry-run conflict endpoint is what allows the scheduling dialog to warn before submit rather than after. It must exist before the dialog work starts.

---

## 3. Routes and page tree

```
app/(app)/therapy/
├── schedule/
│   └── page.tsx                          # THE calendar — day/week/month + filters
├── therapists/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx                      # profile (HR fields read-only)
│       ├── schedule/page.tsx             # therapist calendar
│       ├── availability/page.tsx
│       ├── licenses/page.tsx
│       └── summary/page.tsx
├── patients/
│   ├── page.tsx
│   ├── new/page.tsx                      # external registration
│   ├── from-student/page.tsx             # link an active student
│   └── [id]/
│       ├── page.tsx                      # profile
│       ├── schedule/page.tsx             # patient calendar (individual + group)
│       ├── medical-history/page.tsx
│       ├── consents/page.tsx
│       ├── referrals/page.tsx
│       ├── treatment-plans/
│       │   ├── page.tsx
│       │   ├── new/page.tsx
│       │   └── [planId]/page.tsx
│       ├── progress/page.tsx
│       └── billing/page.tsx
├── sessions/
│   └── [id]/
│       ├── page.tsx                      # session detail
│       └── notes/page.tsx
├── groups/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx                      # detail: therapist, capacity, schedule
│       ├── members/page.tsx              # enrollment + waitlist
│       ├── sessions/page.tsx
│       ├── sessions/[sessionId]/attendance/page.tsx
│       ├── billing/page.tsx
│       └── history/page.tsx
├── waiting-list/page.tsx
└── billing/
    ├── page.tsx                          # invoice list
    ├── fee-structures/page.tsx
    ├── invoices/[id]/page.tsx
    └── refunds/page.tsx

app/(portal)/portal/[studentId]/therapy/page.tsx   # now populated
```

---

## 4. Component inventory

### The calendar

| Component | Notes |
|---|---|
| `TherapyCalendar` | FullCalendar wrapper, dynamically imported so its weight is not in the initial bundle. Day, week, and month views. Events coloured by therapy type with a legend, and **visually distinguished by mode** — group sessions carry a participant-count chip, individual sessions do not — because a colour-only distinction between the two is the single most likely source of scheduling mistakes. Status affects styling: cancelled sessions are struck through, completed are muted, no-show is marked. Drag-and-drop reschedule for permitted roles, with an immediate conflict check on drop and a revert-with-explanation when the check fails. Click opens the session detail sheet. |
| `CalendarFilterBar` | Therapist, patient, group, therapy type, mode, and status filters, persisted in `filterStore`. The active filter set is shown as removable chips so a user is never confused about why the calendar looks empty. |
| `CalendarLegend` | Type colours with text labels and the mode distinction explained. |
| `CalendarAccessibleList` | The keyboard and screen-reader alternative to the calendar grid: a chronological list of the same events with full detail, toggled by a "view as list" control that is always visible, not hidden behind a settings menu. FullCalendar's grid is not adequately accessible on its own, so this is a required companion rather than an optional extra. |
| `SessionDetailSheet` | Slide-over with session details, the patient or group, status, and the actions available for the caller's role and the session's state. |

### Scheduling

| Component | Notes |
|---|---|
| `SessionScheduleDialog` | The single scheduling interface used from all three entry points. Fields: mode (individual or group), therapy type, patient or group, therapist, date, start time, duration, room, pre-session instructions. Behaviour: selecting a therapy type filters the therapist list to those holding that specialization; selecting a therapist shows their availability for the chosen day inline; changing any of date, time, duration, therapist, or room triggers a debounced dry-run conflict check whose result renders in a dedicated panel. Submit is blocked while a blocking conflict exists, and warnings are shown but do not block. Pre-filled context depends on the entry point: from a patient profile the patient is fixed, from a therapist profile the therapist is fixed, from the calendar the clicked slot pre-fills date and time. |
| `ConflictPanel` | Renders `blocking[]` and `warnings[]` distinctly. Each blocking item names the conflicting session with its time and a link to view it — a bare "conflict detected" message forces the user to go hunting. Warnings (outside availability, holiday, under-minimum group capacity) are advisory with a clear label. The leave conflict includes a coordinator-only override toggle that requires a reason. |
| `AssessmentSessionFields` | Conditional fields for the assessment type: a free-text patient name is offered as an alternative to selecting a registered patient, with an explanation of when to use it. |
| `RecurrenceBuilder` | Pattern (daily, weekly, biweekly, monthly), days-of-week selector for weekly and biweekly, day-of-month for monthly, and an end condition as a radio group (end date, occurrence count, or indefinite) so the mutually-exclusive nature is structurally obvious rather than enforced only by validation. Below it, an **occurrence preview** listing the generated dates with a per-date conflict indicator, and a summary ("18 sessions will be created, 2 skipped due to conflicts"). The user sees exactly what will happen before committing. |
| `SeriesEditDialog` | When editing a recurring session, asks explicitly: this occurrence only, this and all future occurrences, or the whole series. Three plainly-worded options — never an ambiguous "edit series" checkbox. |
| `SeriesCancelDialog` | The same three-way choice for cancellation, with a count of affected sessions and a note that completed sessions are unaffected. |
| `RescheduleConfirmDialog` | Shown after a drag-and-drop: old time, new time, conflict result, confirm or revert. A drag that silently succeeds or silently reverts is disorienting. |

### Sessions and documentation

| Component | Notes |
|---|---|
| `SessionStatusBadge` | Five statuses with text labels. |
| `SessionActionBar` | Start, Complete, Cancel, No-show, Reschedule — filtered by the caller's role and the current status, absent rather than disabled when unavailable. |
| `SessionNotesEditor` | Narrative, observations, interventions used (structured multi-select plus free text), homework assigned. Autosaves the draft. Finalise action with a confirmation explaining that the narrative locks. For group sessions, a group-level narrative plus per-patient note tabs restricted to present and late patients. |
| `SupervisorCoSignPanel` | Visible to a supervising therapist on a finalised note: review, comment, co-sign. |
| `SessionGoalProgressPanel` | Lists the patient's active treatment goals with a measured-value input and a narrative per goal, submitted as a batch from within the session context — which is where the therapist actually is when they have the information. |
| `SessionAttachments` | Upload with captions, per-patient scoping for group sessions. |

### Patients and therapists

| Component | Notes |
|---|---|
| `PatientRegistrationForm` | External registration with all required guardian and emergency fields. |
| `StudentToPatientDialog` | `EntitySelect` over `GET /therapy/patients/eligible-students`, which returns only active students not already patients. A pending-fee student is simply absent from the list, with an explanatory hint below the field so a coordinator searching for a name they cannot find understands why. |
| `PatientProfileHeader` | Photo, name, code, source indicator (student-linked or external), active therapy types, discharge status. For student-linked patients, demographic fields render read-only with a link to the student record, matching the teacher-profile pattern from Phase 1. |
| `PatientDischargeDialog` | Reason required; blocked with a clear listing when future sessions exist, plus a link to cancel them. |
| `MedicalHistoryForm` / `ConsentList` / `ReferralForm` | Structured repeatable entries; consent expiry indicators; referral chain display for multi-therapy referrals. |
| `TherapistForm` | Employee `EntitySelect` filtered to `department = therapy`; multi-specialization selector where `supports_group` is displayed as a derived, non-editable property with an explanation. |
| `AvailabilityEditor` | Weekly grid of time ranges per day, supporting split shifts, with effective dating. |
| `LicenseTable` | Expiry indicators: amber under 30 days, red when expired, with the status stated as text. |
| `TherapistSummaryCards` | Sessions conducted, cancellation rate, patients served, utilisation. |

### Treatment plans

| Component | Notes |
|---|---|
| `TreatmentPlanEditor` | Short-term and long-term goals with baseline and target measurements, units, and target dates. Same autosave pattern as the IEP builder. |
| `TreatmentGoalCard` | Goal with current measured value, target, progress, and status. |
| `TreatmentGoalProgressChart` | Measured value over time against the target, with an accessible table alternative. |
| `PlanVersionSelector` | Same pattern as the IEP version selector. |
| `PlanShareDialog` | Share with the guardian, generating the document and confirming the recipient. |

### Groups

| Component | Notes |
|---|---|
| `GroupForm` | Name, therapy type restricted to the four groupable types with the restriction explained, therapist filtered to those supporting group delivery for that type, capacity min and max, default duration. |
| `GroupCapacityIndicator` | "6 of 8 members · 2 waitlisted" as text with a bar as reinforcement. Under-minimum shows an advisory label. |
| `GroupMemberEnrollDialog` | Multi-select patient picker. On submit, renders a **per-patient outcome list**: enrolled, waitlisted with position, or rejected with the conflicting session named. Partial success is the normal case here, so the UI treats it as such rather than as an error. |
| `GroupMemberList` | Active members, waitlist in position order, and exited members with dates and reasons in a separate collapsed section. |
| `GroupMemberExitDialog` | Reason and effective date; states that the first waitlisted patient will be promoted and names them. |
| `GroupSessionScheduleDialog` | Reuses `SessionScheduleDialog` in group mode with the recurrence builder; shows the member list that will be attached. |
| `GroupAttendanceGrid` | Per-patient attendance for a group session: status (Present, Absent, Late, Excused), arrival time for late, and an individual note field. A **billing notice** states plainly that absent patients are still billed while excused patients are not — this is a rule guardians and staff will otherwise dispute, so the UI states it at the point of entry. |
| `GroupBillingSummary` | Per-patient billing state: invoiced, paid, outstanding, discounted. Makes the per-patient independence of group billing visible, which is the concept most likely to be misunderstood. |
| `GroupHistoryTimeline` | Membership, therapist, and schedule changes with dates and actors. |

### Billing

| Component | Notes |
|---|---|
| `TherapyFeeStructureEditor` | Type × mode × duration grid with optional per-group overrides, effective dating. |
| `TherapyInvoiceList` / `TherapyInvoiceDetail` | Session lines for consolidated invoices; mode and group shown where applicable. |
| `TherapyPaymentDialog` | Reuses the Phase 2 payment dialog pattern, including live outstanding recalculation. |
| `RefundDialog` | Links to the original payment, caps at the paid amount less prior refunds, requires a reason. |
| `PatientBillingSummary` | Across individual and group therapy: billed, paid, outstanding. |

### Waiting list

`WaitingListTable` (priority ordering, preferences displayed), `WaitingListEntryForm`, `SlotOfferDialog` (offer with an expiry countdown), `ConvertToSessionDialog` (opens the scheduling dialog pre-filled from the entry's preferences).

### Portal

`PortalTherapyScheduleView` — upcoming and past sessions for the child, showing therapy type, therapist name, date and time, and the session type (individual or group session). Cancelled sessions are shown with their status so a guardian who received a cancellation notification can confirm it. Clinical notes are never shown.

---

## 5. Server state

### Query keys

```typescript
therapy: {
  schedule:   (p: ScheduleParams) => ['therapy','schedule',p],
  therapists: { all: [...], list: (f) => [...], detail: (id) => [...],
                availability: (id) => [...], licenses: (id) => [...],
                summary: (id, range) => [...], sessions: (id, p) => [...] },
  patients:   { all: [...], list: (f) => [...], detail: (id) => [...],
                eligibleStudents: (q) => [...], medicalHistory: (id) => [...],
                consents: (id) => [...], referrals: (id) => [...],
                sessions: (id, p) => [...], progress: (id) => [...], billing: (id) => [...] },
  sessions:   { detail: (id) => [...], notes: (id) => [...], attachments: (id) => [...] },
  recurrences:{ detail: (id) => [...] },
  groups:     { all: [...], list: (f) => [...], detail: (id) => [...],
                members: (id) => [...], sessions: (id, p) => [...],
                attendance: (id, sid) => [...], billing: (id) => [...], history: (id) => [...] },
  treatmentPlans: { byPatient: (pid) => [...], detail: (id) => [...], goalProgress: (gid) => [...] },
  waitingList: { list: (f) => [...] },
  billing:    { feeStructures: [...], invoices: (f) => [...], invoice: (id) => [...], refunds: (f) => [...] },
}
```

### The schedule query — the performance-critical one

`useTherapySchedule(params)` is the most-called query in the module.

- The query key includes every filter, so switching filters is a separate cache entry and going back is instant.
- `staleTime: 30_000`. Short, because another coordinator may be scheduling concurrently, but not zero, because view switching within a month should not refetch.
- Adjacent-period prefetching: on a month view, the previous and next months are prefetched on idle so navigation feels instantaneous. This is worth the extra bandwidth because calendar navigation is the dominant interaction.
- The request asks only for render-critical fields; session detail is fetched on click by `sessions.detail`.
- Concurrent-modification handling: if a mutation returns a conflict that the client did not predict, the schedule query is invalidated and the calendar refreshes before the error is shown, so the user sees the current truth alongside the message.

### Invalidation

| Mutation | Invalidates |
|---|---|
| Create session | `schedule` (all filter variants — invalidate the `['therapy','schedule']` prefix), `patients.sessions`, `therapists.sessions` |
| Reschedule | Same, plus `sessions.detail` |
| Cancel session | Same, plus `groups.attendance` for a group session |
| Complete session | `schedule`, `sessions.detail`, `billing.invoices`, `patients.billing`, `groups.billing` — completion generates invoices, so billing views must refresh |
| Create recurrence | `schedule` prefix, `recurrences.detail` |
| Cancel series | `schedule` prefix, `recurrences.detail` |
| Enroll group members | `groups.members`, `groups.detail`, `groups.history`, `schedule` (future attendance changes) |
| Exit member | Same, plus `groups.billing` |
| Submit group attendance | `groups.attendance`, `sessions.detail`, and on completion `groups.billing` and `billing.invoices` |
| Record payment / refund | `billing.invoice`, `billing.invoices`, `patients.billing`, `groups.billing` |
| Record goal progress | `treatmentPlans.detail`, `treatmentPlans.goalProgress`, `patients.progress` |
| Approve therapist leave (from HR) | `schedule` prefix — the backend flags conflicting sessions, so the calendar must refresh |

The last row is a cross-module case like the Phase 1 substitute queue: an HR action changes what the therapy calendar should display.

---

## 6. Client state

- `filterStore` gains the calendar filter set and the current view and date, so returning to the calendar restores the exact view the user left.
- `sessionNoteDraftStore` — autosave buffer per session, per patient for group notes.
- `treatmentPlanDraftStore` — same pattern as the IEP draft store.
- `calendarViewStore` — a small slice for view mode and whether the accessible list alternative is active, persisted so a keyboard user's preference sticks.

---

## 7. Forms and validation

| Form | Notable rules |
|---|---|
| Session schedule | Mode required; therapy type required; for non-assessment types a registered patient or group is required; for assessment either a registered patient or a free-text name; therapist required and must hold the specialization; date required; start time required; duration 15–240 minutes in 15-minute steps; end time derived and displayed; room optional but conflict-checked; no blocking conflict may remain unresolved |
| Recurrence | Pattern required; weekly and biweekly require at least one day-of-week; monthly requires a day-of-month 1–31 with a note about month-end clamping; exactly one end condition; occurrence count 1–500; a series exceeding 500 blocked client-side with the limit stated |
| Series edit / cancel scope | An explicit scope choice is required — there is no default, because a wrong default here silently changes many sessions |
| Session notes | Narrative minimum 20 characters to finalise; interventions at least one entry; per-patient group notes only for present or late patients |
| Co-sign | Comment optional; the co-signer must differ from the author, enforced by the UI hiding the action for the author |
| Patient registration | Name, DOB, gender, guardian name, guardian phone required; phone format validated; email format when present |
| Student-to-patient | Student selected from the eligible list only |
| Patient discharge | Reason minimum 20 characters; blocked with a listing when future sessions exist |
| Therapist | Employee required; at least one specialization; license expiry after issue date |
| Availability | End after start; overlapping ranges on the same day rejected with the overlap named |
| Group | Therapy type from the four groupable types; therapist supporting group delivery; capacity min ≤ max and both ≥ 1; default duration 15–240 |
| Group enrollment | At least one patient selected; per-patient outcomes surfaced rather than treated as failure |
| Member exit | Reason required; effective date not before the enrollment date |
| Group attendance | Every member has a status; arrival time required when Late; note only for present or late |
| Treatment plan | Therapy type required; start date required; review date after start; at least one goal to activate |
| Treatment goal | Description minimum 20 characters; target measurement and unit required; target date after the plan start |
| Therapy fee structure | Amount positive; effective dates non-overlapping for the same type, mode, and duration |
| Payment | Same rules as the Phase 2 payment dialog |
| Refund | Amount not exceeding paid less prior refunds; reason minimum 20 characters |
| Waiting list entry | Therapy type required; at least one preference specified |

---

## 8. RBAC visibility

| Element | Visible to |
|---|---|
| Therapy navigation | Anyone with `therapy:read` |
| Therapist create / edit | coordinator, super_admin |
| Availability edit | coordinator, therapist (own) |
| Patient create / edit | coordinator, receptionist |
| Patient discharge | coordinator |
| Session create | coordinator, therapist, receptionist |
| Session start / complete / no-show | the assigned therapist |
| Session cancel | coordinator, the assigned therapist |
| Reschedule (drag-and-drop enabled) | coordinator, the assigned therapist |
| Leave-conflict override | coordinator only, with a reason |
| Session notes author | the assigned therapist only |
| Session notes read | author, supervising therapist, coordinator |
| Co-sign | supervising therapist, not the author |
| Group create / edit / close | coordinator, super_admin |
| Group enrollment / exit | coordinator |
| Group attendance | the group's therapist, coordinator |
| Treatment plan create / edit | therapist |
| Fee structures | accountant, super_admin, principal |
| Invoices and payments | accountant, receptionist, coordinator (read) |
| Refunds | accountant, principal |
| Portal therapy view | parent, own children only |

**Scoped visibility.** A `therapist` role sees the calendar defaulted and locked to their own sessions, the patient list scoped to their patients, and no other therapist's notes. The scoping is server-side; the UI additionally hides the therapist filter for a therapist user rather than presenting a filter they cannot change.

---

## 9. Accessibility and responsive requirements

The calendar is the hardest accessibility problem in the application, so it gets explicit treatment.

| Item | Requirement |
|---|---|
| Calendar alternative view | `CalendarAccessibleList` is a first-class, always-visible toggle — not a hidden fallback. It presents the same events as a chronological list with full detail and working actions. Every calendar acceptance test is run against both views. |
| Calendar grid | Events are focusable with a descriptive accessible name: "Speech therapy, Amina Rahman, 10:00 to 10:45, with Dr. Karim, scheduled". Enter opens the detail sheet. |
| Calendar navigation | Previous, next, today, and view switching are all keyboard reachable and announce the resulting period ("Showing September 2026"). |
| Drag-and-drop | Never the only way to reschedule. Every draggable event has a keyboard-accessible Reschedule action opening a dialog. Drag results are announced. |
| Mode distinction | Group versus individual is conveyed by a text chip and in the accessible name, never by colour alone. |
| Conflict panel | `role="alert"` for blocking conflicts so they are announced immediately; warnings use `role="status"`. Each conflict names the specific clash. |
| Recurrence preview | Rendered as a list with per-date conflict status in text; the summary count is announced when it changes. |
| Series scope choice | A radio group with descriptive labels, no pre-selected default. |
| Group attendance grid | Same keyboard model as the school attendance grid: arrows to move, number keys to set status. The billing notice is a `role="note"` region. |
| Group billing summary | Per-patient state stated in text; the independence of each patient's invoice is explicit in the column headers. |
| Session notes editor | Autosave status in an `aria-live` region; the finalisation consequence stated before the action. |
| Charts | Accessible table alternative for the treatment goal progress chart and therapist summary charts. |
| Mobile calendar | Forced to day view below `md` with swipe and button navigation; week and month are available but with horizontal scroll and a clear affordance. The accessible list view is the default on mobile, since it is genuinely better on a small screen. |
| Mobile scheduling dialog | Full-screen sheet, single column, sticky action bar; the conflict panel is pinned above the actions so it cannot be missed. |
| Mobile group attendance | Per-patient cards with a full-width status control. |

### Calendar performance requirements

The TDD budget is a month view with 200 sessions rendering in under one second on a 2 Mbps connection.

- FullCalendar and its plugins are dynamically imported.
- The schedule request returns only render-critical fields.
- Event rendering uses FullCalendar's `eventContent` with a lightweight custom renderer rather than a heavy React component per event.
- Adjacent-month prefetching on idle.
- The Playwright performance test asserts the render budget with 200 seeded events, and a bundle check asserts the calendar chunk is not in the initial load.

---

## 10. Tests owed by this phase

### Component tests

| Target | Scenarios |
|---|---|
| `TherapyCalendar` | Renders individual and group events with correct mode chips; filters narrow the event set; view switching preserves the date; a cancelled event is styled and labelled; clicking opens the detail sheet; drag-and-drop emits the reschedule intent; a failed reschedule reverts the event and shows the reason; the accessible-list toggle renders equivalent events; keyboard focus moves between events with descriptive names; axe clean in both views |
| `SessionScheduleDialog` | Therapy type filters the therapist list; a therapist without the specialization is absent; changing time triggers a debounced conflict check exactly once; a blocking conflict disables submit and names the clash; a warning does not block; the coordinator-only leave override requires a reason and is absent for other roles; the assessment type reveals the free-text name field; entry-point pre-fill works for all three entry points; end time derived correctly across a midnight boundary |
| `ConflictPanel` | Blocking and warning items rendered distinctly with `role="alert"` and `role="status"`; each blocking item names the conflicting session and links to it; empty state when clear |
| `RecurrenceBuilder` | Weekly with three days produces the expected preview dates; biweekly skips alternate weeks; monthly on day 31 shows clamped dates with the explanation; exactly one end condition enforced structurally; over-500 blocked with the limit stated; the preview marks conflicting dates and the summary count matches |
| `SeriesEditDialog` / `SeriesCancelDialog` | No default scope pre-selected; affected-session count correct per scope; the completed-sessions-unaffected note present |
| `RescheduleConfirmDialog` | Old and new times shown; conflict result rendered; revert restores the original |
| `SessionActionBar` | For each role and each status, exactly the permitted actions render; unavailable actions are absent, not disabled |
| `SessionNotesEditor` | Autosave fires and updates the indicator; finalise requires the minimum narrative and shows the consequence; a finalised note is read-only; group mode shows per-patient tabs only for present and late patients; the author sees no co-sign action |
| `SupervisorCoSignPanel` | Visible to a supervising therapist on a finalised note; absent for the author; absent for a coordinator |
| `SessionGoalProgressPanel` | Lists active goals; batch submit sends all entries; validation per goal |
| `StudentToPatientDialog` | Only eligible students offered; the explanatory hint about pending-fee students is present; a duplicate patient attempt shows the mapped message |
| `PatientProfileHeader` | Student-linked patients show read-only demographics with a link; external patients show editable fields |
| `PatientDischargeDialog` | Blocked with a session listing when future sessions exist; reason required |
| `AvailabilityEditor` | Overlapping ranges rejected with the overlap named; split shifts supported |
| `GroupForm` | Only groupable types offered with the restriction explained; therapists filtered to group-capable; capacity validation |
| `GroupMemberEnrollDialog` | Per-patient outcome list renders enrolled, waitlisted with position, and rejected with the conflicting session named; partial success is not treated as an error |
| `GroupMemberExitDialog` | Names the patient who will be promoted; reason required |
| `GroupAttendanceGrid` | Keyboard status setting; arrival time required for Late; note restricted to present and late; the billing notice is present; a non-member cannot be marked |
| `GroupBillingSummary` | Per-patient independence visible; a discount on one patient leaves the others unchanged in the rendered state |
| `GroupCapacityIndicator` | Text figures correct; under-minimum advisory shown |
| `TreatmentPlanEditor` | Autosave; goal validation; activation requires at least one goal |
| `RefundDialog` | Amount capped correctly; reason required |
| `WaitingListTable` / `SlotOfferDialog` | Priority ordering; offer expiry countdown; convert pre-fills the scheduling dialog |
| `PortalTherapyScheduleView` | Shows individual and group sessions; cancelled sessions shown with status; no clinical notes present anywhere in the rendered output — asserted explicitly |

### Hook tests

- `useTherapySchedule`: query key includes all filters; adjacent-period prefetch fires on idle; a 30-second stale window prevents refetch on view switch within a period.
- Invalidation assertions for every mutation in section 5, including session completion invalidating billing views and HR leave approval invalidating the schedule prefix.
- `useConflictCheck`: debounced, cancels in-flight requests on rapid input, and does not fire on incomplete input.

### E2E scenarios

| ID | Scenario |
|---|---|
| `THR-E2E-01` | Schedule an individual session from the main calendar → it appears in the therapist, patient, and month views (mirrors TDD THR-E2E-01) |
| `THR-E2E-02` | Attempt a session overlapping the therapist's existing session → the conflict panel names the clash and submit is blocked (mirrors THR-E2E-02) |
| `THR-E2E-03` | Create an 8-week weekly recurring series → the preview shows 8 dates → confirm → cancel week 4 only → weeks 1–3 and 5–8 remain scheduled (mirrors THR-E2E-03) |
| `THR-E2E-04` | Complete a session, write and finalise notes, record goal progress → the patient progress view reflects it (mirrors THR-E2E-04) |
| `THR-E2E-05` | Create a group of 4, schedule a weekly session, mark 2 present / 1 absent / 1 late, complete → four invoices exist and the absent patient is billed (mirrors THR-E2E-06) |
| `THR-E2E-06` | A group member is offered an individual session overlapping their group session → blocked with the group session named (mirrors THR-E2E-08) |
| `THR-E2E-07` | Group billing: pay two invoices, discount one → the fourth is unchanged and the summary shows the correct per-patient states (mirrors THR-E2E-07) |
| `THR-E2E-08` | Enroll 6 patients into a capacity-4 group → 4 enrolled, 2 waitlisted with positions → exit one → position 1 promoted |
| `THR-E2E-09` | Schedule an assessment session with a free-text patient name → it appears on the calendar (mirrors THR-E2E-09) |
| `THR-E2E-10` | Cancel a group session → each enrolled patient's guardian has a notification (mirrors THR-E2E-10) |
| `THR-E2E-11` | Drag-and-drop reschedule to a free slot → confirm → the calendar updates; drag to a conflicting slot → revert with an explanation (mirrors THR-E2E-05) |
| `THR-E2E-12` | Register an external patient and schedule their first session |
| `THR-E2E-13` | Attempt to add a pending-fee student as a patient → absent from the eligible list; after the fee is paid → present and addable |
| `THR-E2E-14` | Approve a therapist's leave in HR → the therapy calendar shows the conflicting sessions flagged without a manual reload |
| `THR-E2E-15` | Therapist role: calendar locked to own sessions; cannot open another therapist's notes; cannot access group management |
| `POR-E2E-07` | Parent portal shows the child's upcoming individual and group sessions and no clinical notes |
| `A11Y-E2E-04` | Keyboard-only: navigate the calendar in list view, open a session, reschedule via the dialog, and complete it |
| `PERF-E2E-01` | Month view with 200 seeded sessions renders within the one-second budget |

### Accessibility tests

- `jest-axe` on every component in section 4, including both calendar views.
- Full-page axe scan on: schedule (day, week, month, and list views), session detail, therapist profile, availability editor, patient profile, treatment plan editor, group detail, group members, group attendance, group billing, waiting list, invoice detail, and the portal therapy view.
- Manual screen reader pass on the calendar in both views and on the scheduling dialog with conflicts, documented in the phase notes.
- Every acceptance test that operates on the calendar is run against both the grid and the accessible list view.

### Visual regression

Baselines for: calendar in day, week, and month views with mixed individual and group events; calendar with all statuses represented; the accessible list view; the scheduling dialog clean, with warnings, and with blocking conflicts; the recurrence builder with a preview containing conflicts; the series scope dialogs; group detail at under, at, and over capacity; the group attendance grid; the group billing summary with mixed payment states; the treatment plan editor; and mobile viewports of the calendar (list default), the scheduling dialog, and group attendance.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] The calendar renders individual and group sessions with a text-based mode distinction, never colour alone.
- [ ] `CalendarAccessibleList` is a fully functional equivalent, and every calendar acceptance test passes against both views.
- [ ] Drag-and-drop is never the only reschedule path; a keyboard route exists and is tested.
- [ ] Conflicts are surfaced before submit via the dry-run check, and every blocking conflict names the specific clashing session.
- [ ] The cross-modality conflict (group session blocking an individual session for a member) is proven by E2E.
- [ ] The recurrence preview shows generated dates with per-date conflict status before the user commits.
- [ ] Series edit and cancel always require an explicit scope choice with no default.
- [ ] Group enrollment reports per-patient outcomes and treats partial success as normal.
- [ ] The group billing summary makes per-patient independence visible, and the discount-independence E2E passes.
- [ ] The absent-is-billed rule is stated at the point of attendance entry.
- [ ] The portal therapy view contains no clinical notes — asserted explicitly.
- [ ] The month view with 200 sessions meets the one-second budget, and the calendar chunk is absent from the initial bundle.
- [ ] Zero axe violations on all 13+ scanned pages; the calendar screen reader pass documented.
