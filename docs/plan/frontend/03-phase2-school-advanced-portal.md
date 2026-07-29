# Frontend Phase 2 — School Advanced & Parent Portal

| Field | Value |
|---|---|
| Duration | 5 weeks |
| Prerequisites | Frontend Phase 0, 1; Backend Phase 2 contract published |
| Feature list coverage | 1.6 IEP, 1.7 Progress Reports, 1.8 Fee Management, 1.10 curriculum, 1.11 Health, 1.12 Behavioral, 1.13 Outdoor Activities, 10 Parent Portal |
| Backend counterpart | [backend/03-phase2-school-advanced.md](../backend/03-phase2-school-advanced.md) |

---

## 1. Objective and scope

Complete the School module and build the parent portal — the system's only external-facing surface and therefore the one with the strictest constraints on what may be shown and done.

Three pieces of work in this phase are unusually demanding. The **IEP builder** is a nested, domain-organised editor that teachers use for careful, considered work. The **fee management screens** handle money with partial payments and require exactness. The **parent portal** is a separate shell for non-technical users on mobile devices with limited bandwidth, and it must never leak another family's data.

**In scope**

- Curriculum and skill domain configuration
- IEP builder, goal management, progress tracking, review scheduling, versioning, PDF download
- Progress report editor with a draft → submit → approve → publish workflow and a trend view
- Fee structures, categories, discounts, scholarships; monthly invoice generation run; invoice detail; partial payment recording; waivers; receipts; defaulter list
- Student health records, immunizations, medical incidents, alert flags
- Behavioral incident logging, support plans, trend view
- Outdoor activities: creation, opt-in invitation, enrollment board with waitlist, activity attendance, media, cancellation
- Student leave request queue for staff
- The complete parent portal

**Out of scope**

- Therapy schedule in the portal — the tab exists and shows an empty state until Phase 3
- Online payment — the portal shows amounts due and payment instructions; no gateway UI

---

## 2. Prerequisites

- Phase 1 student and guardian data; `FileUpload`; `TabbedDetailLayout`.
- Backend Phase 2 contract including the portal endpoints and the PDF document endpoints.

---

## 3. Routes and page tree

```
app/(app)/school/                          (additions)
├── curriculum/
│   ├── page.tsx                           # skill domains + curricula
│   └── [id]/page.tsx                      # learning objectives
├── students/[id]/
│   ├── iep/
│   │   ├── page.tsx                       # plan list + active plan summary
│   │   ├── new/page.tsx                   # IEP builder
│   │   └── [iepId]/
│   │       ├── page.tsx                   # plan detail with goals
│   │       ├── edit/page.tsx              # builder in edit mode (draft only)
│   │       └── reviews/page.tsx
│   ├── progress-reports/
│   │   ├── page.tsx
│   │   ├── new/page.tsx                   # report editor
│   │   └── [reportId]/page.tsx
│   ├── health/page.tsx                    # medical record + immunizations + incidents
│   ├── behavioral/page.tsx                # incidents + support plan + trend
│   └── fees/page.tsx                      # invoices + payments + summary
├── fees/
│   ├── page.tsx                           # invoice list across students
│   ├── structures/page.tsx                # categories, heads, structures
│   ├── generate/page.tsx                  # monthly generation run
│   ├── defaulters/page.tsx
│   ├── discounts/page.tsx                 # discount + scholarship approval queue
│   └── invoices/[id]/page.tsx
├── activities/
│   ├── page.tsx                           # list + calendar toggle
│   ├── new/page.tsx
│   ├── types/page.tsx
│   └── [id]/
│       ├── page.tsx                       # detail + supervisors
│       ├── enrollments/page.tsx           # opt-in board
│       ├── attendance/page.tsx
│       └── media/page.tsx
├── student-leave-requests/page.tsx        # staff review queue
├── progress-reports/page.tsx              # cross-student status board
└── report-templates/page.tsx

app/(portal)/portal/
├── page.tsx                               # child selector + summary cards
├── [studentId]/
│   ├── page.tsx                           # child overview
│   ├── attendance/page.tsx
│   ├── iep/page.tsx
│   ├── progress-reports/page.tsx
│   ├── fees/page.tsx
│   ├── leave/
│   │   ├── page.tsx                       # history
│   │   └── new/page.tsx                   # request form
│   ├── activities/page.tsx
│   └── therapy/page.tsx                   # empty state until Phase 3
├── messages/page.tsx
├── notifications/page.tsx
└── profile/page.tsx                       # guardian details + change request
```

---

## 4. Component inventory

### IEP

| Component | Notes |
|---|---|
| `IEPBuilder` | The phase's most complex form. Goals grouped by skill domain in collapsible sections, each goal with description, baseline, measurement criteria, target date, responsible teacher, and optional curriculum objective link. Add, remove, and reorder goals within a domain. Autosaves the draft every 30 seconds and on blur, with a visible "saved at HH:mm" indicator, because losing 20 minutes of careful goal-writing is unacceptable. |
| `IEPGoalCard` | Displays a goal with its status, progress percentage, target date, and responsible teacher. Inline status update for the responsible teacher. Overdue target dates flagged. |
| `IEPGoalProgressDialog` | Status change plus progress percentage plus a narrative note. Shows the previous entries so the teacher writes in context. |
| `IEPGoalProgressChart` | Recharts line chart of progress percentage over time per goal, with status change markers. |
| `IEPDomainSummary` | Per domain: goal count by status and an achievement rate. |
| `IEPVersionSelector` | Dropdown of versions with dates, marking the active one. Selecting an archived version renders it read-only with a clear banner. |
| `IEPPublishDialog` | Pre-publish checklist showing what is missing (goals without a responsible teacher, missing target dates) so the user fixes it before submitting rather than reading a 422. |
| `IEPReviewScheduler` / `IEPReviewCompleteDialog` | Schedule and record reviews with attendees and an outcome summary. |
| `IEPAcknowledgmentStatus` | Shows which guardians have acknowledged and when. |

### Progress reports

| Component | Notes |
|---|---|
| `ProgressReportEditor` | Template-driven: narrative sections and domain ratings rendered from the selected template's schema. Linked IEP goals with a per-goal progress note. Evidence attachments. Autosave on draft. |
| `ReportWorkflowBar` | Shows the current stage with the available transitions for the caller's role, so a teacher sees "Submit" and a coordinator sees "Approve / Reject". A transition the user cannot perform is not rendered as a disabled button — it is absent, which avoids the "why is this greyed out" question. |
| `ReportStatusBoard` | Cross-student board grouped by stage with counts, used by coordinators to chase outstanding reports. |
| `ProgressTrendChart` | Domain ratings over successive periods. |
| `ReportRejectDialog` | Mandatory comment with a character counter. |

### Fees

| Component | Notes |
|---|---|
| `FeeStructureEditor` | Category × fee head grid with amounts and frequencies, effective dating. |
| `InvoiceGenerationRun` | Month selector, a pre-run preview showing how many students will be invoiced and how many will be skipped **with the reasons grouped**, then a confirm action. After running, a result summary with generated, skipped, and failed counts and a downloadable detail. Re-running shows that nothing new was generated rather than appearing to do nothing. |
| `InvoiceDetail` | Header with student, period, and status; line items with gross, discount, and net; payment history; outstanding figure emphasised; actions gated by role. |
| `PaymentRecordDialog` | Amount defaulting to the outstanding figure but **editable** (partial payments are allowed here, unlike the admission fee), method, reference, date, optional attachment. Shows the resulting outstanding balance live as the amount is typed. |
| `PaymentReversalDialog` | Mandatory reason, with an explicit statement that a reversing ledger entry will be posted and the original payment retained. |
| `FeeWaiverDialog` | Principal only, mandatory reason, amount up to the outstanding figure. |
| `DiscountRequestForm` / `DiscountApprovalQueue` | Percentage or fixed, per fee head or all, effective dating; approval queue for the principal showing the financial impact. |
| `ScholarshipForm` | Sponsor, coverage, period. |
| `FeeSummaryCard` | Per student: total billed, paid, outstanding, waived, next due date. Used on the student profile and in the portal. |
| `DefaulterTable` | Overdue invoices with aging buckets, contact details, and a bulk reminder action. |
| `ReceiptDownloadButton` | Requests the presigned URL and opens it; handles the not-yet-generated case with a wait state rather than a broken link. |

### Health and behaviour

| Component | Notes |
|---|---|
| `MedicalRecordForm` | Conditions, allergies, medications as repeatable entries; emergency protocol; physician contact; the alert flag with a short summary. Permission-gated: a mapped teacher reads, a coordinator writes. |
| `MedicalAlertBadge` | A prominent, always-visible indicator on the student profile header and in the attendance grid row when a student has an alert. Text plus icon, never colour alone. This is a safety feature: a substitute teacher must see it immediately. |
| `ImmunizationTable` | Vaccine, dose, dates, next due with an overdue indicator. |
| `MedicalIncidentForm` / `MedicalIncidentList` | Date/time, type, description, action taken, severity, guardian-notified timestamp, attachments. |
| `BehavioralIncidentForm` | Structured antecedent–behavior–consequence entry with intervention and duration, optionally linked to an IEP goal. |
| `BehavioralTrendChart` | Incident frequency by type over time. |
| `BehaviorSupportPlanEditor` | Target behaviours and strategies as repeatable structured entries, with a review date. |

### Activities

| Component | Notes |
|---|---|
| `ActivityForm` | Type, name, date, times, venue, capacity, fee, opt-in deadline, supervisors, waitlist toggle. |
| `ActivityCalendar` | FullCalendar month view of activities with capacity indicators. Lazy-loaded. |
| `OptInBoard` | The enrollment interface: four columns (Confirmed, Waitlisted, Declined, No Response) with counts against capacity, a per-student consent channel indicator, and actions to record consent on behalf of a guardian or withdraw. The waitlist column shows positions explicitly. |
| `CapacityIndicator` | "12 of 15 confirmed · 3 waitlisted" as text, with a progress bar as secondary reinforcement. |
| `ActivityInviteDialog` | Select students or all eligible, with a preview of who will be invited. |
| `ActivityAttendanceGrid` | Same interaction model as the school attendance grid, with a prominent notice that this does not affect school attendance — the single most likely user misunderstanding in this feature. |
| `ActivityCancelDialog` | Mandatory reason, plus a summary of the consequences (enrollments withdrawn, unpaid invoices cancelled, paid invoices flagged for refund, guardians notified). |
| `ActivityMediaGallery` | Upload and caption photos with a lightbox view. |
| `ActivitySummaryForm` | Post-activity narrative, participant count, fee collected. |

### Parent portal

The portal has its own component set because its audience and constraints differ. Larger touch targets, plainer language, no dense tables.

| Component | Notes |
|---|---|
| `ChildSelector` | Prominent switcher when a guardian has multiple children; a single-child guardian sees no selector at all. |
| `PortalSummaryCards` | Attendance this month, outstanding fees, active IEP goal count, upcoming activities, next therapy session (from Phase 3). |
| `PortalAttendanceCalendar` | Month grid with per-day status, a percentage summary, and a legend using text labels. |
| `PortalIEPView` | Read-only, grouped by domain, showing goal descriptions, statuses, target dates, and the responsible teacher's name. Progress shown as a labelled bar. Plain language throughout — no internal jargon. |
| `PortalIEPAcknowledgeDialog` | Explains what acknowledgment means, requires typing the guardian's name as a signature, and shows the resulting timestamp. |
| `PortalProgressReportList` | Published reports only, with a download action. |
| `PortalFeeView` | Invoice list with status, outstanding total prominent, payment history, receipt downloads, and payment instructions text configured by the organisation. |
| `PortalLeaveRequestForm` | Date range with a minimum of today, leave type, reason, optional attachment. Shows the total days that will be requested. |
| `PortalLeaveHistory` | Requests with status and, on rejection, the reason shown plainly. |
| `PortalActivityCard` | Activity details, fee, deadline with a countdown, and Accept / Decline actions. After the deadline the actions are replaced by an explanatory message rather than disabled buttons. |
| `PortalMessageThread` | Simple two-way message view with the coordinator, attachment support. |
| `PortalGuardianProfileForm` | Editable fields that submit a change request, with a clear statement that changes require school approval and a pending-request indicator. |
| `PortalBottomNav` | Mobile-first bottom navigation: Home, Attendance, IEP, Fees, More. |

---

## 5. Server state

### Query keys

```typescript
school: {
  curriculum: { domains: [...], list: (f) => [...], objectives: (id) => [...] },
  iep: {
    byStudent: (sid) => ['school','iep','student',sid],
    detail:    (id)  => ['school','iep','detail',id],
    goalProgress: (goalId) => [...],
    reviews:   (id) => [...],
  },
  progressReports: {
    byStudent: (sid) => [...], detail: (id) => [...],
    board: (f) => [...], trend: (sid) => [...], templates: [...],
  },
  fees: {
    structures: (f) => [...], categories: [...], heads: [...],
    invoices: (f) => [...], invoice: (id) => [...],
    byStudent: (sid) => [...], summary: (sid) => [...],
    defaulters: (f) => [...], discounts: (f) => [...],
  },
  health:     { record: (sid) => [...], immunizations: (sid) => [...], incidents: (sid) => [...], alerts: (sid) => [...] },
  behavioral: { incidents: (sid) => [...], plan: (sid) => [...], trend: (sid) => [...] },
  activities: {
    list: (f) => [...], detail: (id) => [...], types: [...],
    enrollments: (id) => [...], attendance: (id) => [...], calendar: (range) => [...],
  },
  studentLeave: { queue: (f) => [...], detail: (id) => [...] },
},
portal: {
  children: ['portal','children'],
  child:       (sid) => ['portal','child',sid],
  attendance:  (sid, month) => [...],
  iep:         (sid) => [...],
  iepHistory:  (sid) => [...],
  reports:     (sid) => [...],
  fees:        (sid) => [...],
  leave:       (sid) => [...],
  activities:  (sid) => [...],
  therapy:     (sid) => [...],
  messages:    [...],
}
```

### Invalidation

| Mutation | Invalidates |
|---|---|
| Publish IEP | `iep.byStudent`, `iep.detail`, `portal.iep` (a parent may be viewing), `students.detail` |
| Record goal progress | `iep.detail`, `iep.goalProgress`, `portal.iep` |
| Acknowledge IEP (portal) | `portal.iep`, `iep.detail` |
| Publish progress report | `progressReports.*`, `portal.reports` |
| Generate monthly invoices | `fees.invoices`, `fees.byStudent` (all), `fees.defaulters`, `portal.fees` |
| Record payment | `fees.invoice`, `fees.invoices`, `fees.byStudent`, `fees.summary`, `fees.defaulters`, `portal.fees` |
| Reverse payment / waive | Same as record payment |
| Approve discount | `fees.discounts`, `fees.byStudent` |
| Confirm activity opt-in (either side) | `activities.enrollments`, `activities.detail`, `fees.byStudent` (an invoice is generated), `portal.activities` |
| Withdraw enrollment | Same, because a waitlist promotion changes another student's state and generates their invoice |
| Cancel activity | `activities.*`, `fees.invoices`, `portal.activities` |
| Approve student leave | `studentLeave.queue`, `attendance.roster`, `attendance.summary`, `portal.leave`, `portal.attendance` |
| Submit portal leave request | `portal.leave`, `studentLeave.queue` |
| Guardian change request | `portal.profile` |

The activity withdrawal case is worth flagging: withdrawing one student promotes another, so the invalidation must cover the enrollment board and the fee data of a student the user did not touch.

### Polling and staleness

- The `OptInBoard` uses a 30-second refetch interval while open, because multiple parents respond concurrently and a stale board leads a coordinator to over-confirm past capacity.
- Portal queries use a 5-minute `staleTime`; parents do not need second-level freshness and bandwidth is constrained.
- Fee invoice detail uses `staleTime: 0` — money must not be stale when someone is about to record a payment against it.

---

## 6. Client state

- `iepDraftStore` — autosave buffer for the IEP builder keyed by plan id, persisted to `sessionStorage`, with a `lastSavedAt` timestamp surfaced in the UI.
- `reportDraftStore` — the same for the progress report editor.
- `filterStore` additions for the invoice list, defaulter list, activity list, and report board.
- `portalStore` — the selected child id, persisted so a returning guardian lands on the same child.

---

## 7. Forms and validation

| Form | Notable rules |
|---|---|
| IEP plan | Academic year required; start date required; end date after start; review frequency 1–12 months |
| IEP goal | Skill domain required; description minimum 20 characters; target date after the plan start and on or before the plan end; responsible teacher required and must be active; measurement criteria required |
| IEP publish | Client-side pre-check mirroring the server's completeness rules, surfaced as a checklist rather than a submit error |
| Goal progress | Status required; percentage 0–100 and consistent with the status (achieved implies 100, warned if not); narrative minimum 10 characters |
| Progress report | Every template-required section completed; at least one linked IEP goal when the student has an active plan; period does not overlap an existing report of the same type |
| Report rejection | Comment minimum 20 characters |
| Fee structure | Amount positive; effective dates non-overlapping for the same category and head combination |
| Payment | Amount positive and not exceeding outstanding, with the resulting balance shown live; method required; reference required for non-cash; date not in the future |
| Waiver | Amount not exceeding outstanding; reason minimum 20 characters |
| Discount | Percentage 0–100 or a fixed amount not exceeding the applicable fee; reason required; effective dating |
| Activity | Date not in the past; opt-in deadline before the activity date; capacity ≥ 1; fee non-negative; at least one supervisor |
| Activity cancellation | Reason minimum 20 characters |
| Medical record | Alert summary required when the alert flag is set, maximum 300 characters |
| Medical incident | Date/time not in the future; severity required; action taken required |
| Behavioral incident | Antecedent, behaviour, and consequence all required; duration positive when provided |
| Portal leave request | Start date on or after today; end date on or after start; type required; reason minimum 10 characters; the computed day count displayed before submit |
| Portal IEP acknowledgment | Typed signature must match the guardian's name on record, case-insensitively |
| Guardian change request | At least one field changed from the current value |

---

## 8. RBAC visibility

| Element | Visible to |
|---|---|
| IEP create / edit / goals | coordinator, teacher (own students) |
| IEP publish / archive | coordinator |
| IEP read | coordinator, mapped teacher, principal, parent (published only) |
| Progress report create / submit | teacher, coordinator |
| Progress report approve / reject / publish | coordinator |
| Fee structures and categories | super_admin, accountant, principal |
| Invoice generation | accountant, super_admin |
| Payment recording | accountant, receptionist, coordinator |
| Payment reversal | accountant, principal |
| Fee waiver | principal |
| Discount approval | principal |
| Medical record write | coordinator |
| Medical record read | coordinator, mapped teacher, assigned substitute, principal |
| Medical alert badge | coordinator, mapped teacher, assigned substitute — it must reach whoever is with the child |
| Behavioral incidents | coordinator, mapped teacher |
| Activity create / edit / cancel | coordinator |
| Activity consent on behalf of a guardian | coordinator |
| Activity attendance | coordinator, supervising teacher |
| Student leave decision | coordinator, principal |
| Entire portal | `parent` role only |

### Portal isolation — the hard requirement

The portal is the only place where a data-scoping mistake exposes one family's information to another. The frontend's obligations:

- Every portal query takes the student id from `portalStore`, which is populated **only** from `GET /portal/children`. A student id is never taken from a URL parameter without validating it against that list.
- A URL containing an unauthorised student id renders a not-found state, not an error dump, and does not issue the data request.
- Middleware prevents a parent token from reaching any `(app)` route.
- No portal component imports from a staff module, enforced by an ESLint boundary rule. This prevents accidentally rendering a staff component that fetches unscoped data.

---

## 9. Accessibility and responsive requirements

| Item | Requirement |
|---|---|
| IEP builder | Domain sections are proper landmarks with headings; adding a goal moves focus into the new goal's first field; removing a goal announces the removal; autosave status is in an `aria-live="polite"` region |
| Goal cards | Status conveyed by text plus icon; overdue target dates stated in text |
| Progress charts | Every Recharts chart has an accessible table alternative reachable by a "view as table" toggle — a chart alone is not accessible and this is required across the whole app from here on |
| Workflow bar | Current stage announced; available actions clearly labelled with the outcome ("Submit for coordinator review") |
| Payment dialog | The live outstanding balance is announced on change so a screen reader user knows the effect of the amount they typed |
| Medical alert badge | Text label plus icon; present in the accessible name of the student row in tables |
| Opt-in board | Column counts in headings; each student row states its state in text; waitlist position stated numerically |
| Activity attendance | The "does not affect school attendance" notice is a `role="note"` region, present for screen readers, not a visual-only badge |
| Portal | Minimum 44×44px touch targets; base font 16px; plain language reviewed against a reading-level check; bottom navigation with clear labels and icons |
| Portal IEP | Goals as a definition-list structure; progress bars carry `aria-valuenow` and a text percentage |
| Portal acknowledgment | The consequence of acknowledging is stated before the signature field, not after |
| Portal calendar | Each day cell's accessible name includes the date and the attendance status |
| Mobile IEP builder | Domains as an accordion; one goal editor at a time |
| Mobile opt-in board | Columns become a filterable single list with a state selector |
| Mobile invoice detail | Line items as stacked cards; the outstanding figure pinned |

---

## 10. Tests owed by this phase

### Component tests

| Target | Scenarios |
|---|---|
| `IEPBuilder` | Add goals across three domains; validation blocks a goal without a responsible teacher; autosave fires on blur and after 30 s (fake timers) and updates the saved indicator; draft restores after remount; reorder within a domain; remove announces; axe clean |
| `IEPPublishDialog` | Checklist lists exactly the missing items; publish disabled until complete; success path |
| `IEPGoalProgressDialog` | Status/percentage consistency warning; previous entries shown; non-responsible teacher sees no inline action |
| `IEPVersionSelector` | Archived version renders read-only with a banner; active version editable when draft |
| `ProgressReportEditor` | Template-driven sections render from the schema; required sections enforced; goal link required when an active IEP exists; autosave |
| `ReportWorkflowBar` | A teacher sees Submit only; a coordinator sees Approve and Reject; no disabled phantom buttons |
| `InvoiceGenerationRun` | Preview shows counts and grouped skip reasons; confirm triggers the run; result summary renders; a re-run shows zero generated with an explanatory message |
| `PaymentRecordDialog` | Live outstanding recalculation as the amount changes; overpayment blocked client-side with the maximum stated; non-cash requires a reference; a 422 renders the mapped message |
| `PaymentReversalDialog` | Reason required; the consequence statement is present |
| `FeeWaiverDialog` | Principal only; amount capped at outstanding |
| `DefaulterTable` | Aging buckets correct; bulk reminder selection |
| `OptInBoard` | Four columns with correct counts; capacity indicator text; waitlist positions sequential; withdraw promotes and the board updates; polling refetches |
| `ActivityAttendanceGrid` | The school-attendance-unaffected notice is present; marking works; axe clean |
| `ActivityCancelDialog` | Consequence summary present; reason required |
| `MedicalAlertBadge` | Renders with text and icon; appears in the student row accessible name; absent when no alert |
| `MedicalRecordForm` | Alert summary required when flagged; repeatable entries add and remove; read-only for a teacher role |
| `BehavioralIncidentForm` | All three ABC fields required |
| `ProgressTrendChart` / `BehavioralTrendChart` / `IEPGoalProgressChart` | Render with data; empty state with no data; the table alternative toggle renders equivalent values |
| `ChildSelector` | Multiple children render a selector; a single child renders none; selection persists |
| `PortalIEPView` | Renders published goals grouped by domain; a draft plan is never rendered; progress bars have accessible values |
| `PortalIEPAcknowledgeDialog` | Signature must match the guardian name; consequence text present; success shows the timestamp |
| `PortalFeeView` | Outstanding prominent; receipt download; payment instructions rendered |
| `PortalLeaveRequestForm` | Past dates blocked; day count displayed; overlap error mapped |
| `PortalActivityCard` | Countdown to deadline; after the deadline actions are replaced by a message |
| `PortalGuardianProfileForm` | Submits a change request, not a direct update; the approval-required notice is present; pending indicator shows |

### Hook tests

- Invalidation assertions for every mutation in section 5, especially: activity withdrawal invalidating another student's fee data, and student leave approval invalidating both staff attendance and portal attendance.
- `usePortalScope`: a student id absent from `GET /portal/children` never produces a data request.

### E2E scenarios

| ID | Covers TDD | Scenario |
|---|---|---|
| `FE-IEP-E2E-01` | SCH-E2E-10, SCH-E2E-11 | Create an IEP with goals in three domains → update one goal to In Progress → publish → a parent logs in and sees the goals with their progress → digitally acknowledges → the coordinator sees the acknowledgment timestamp |
| `FE-IEP-E2E-02` | — | Revise a published IEP → v2 is active and v1 is archived and read-only |
| `FE-IEP-E2E-03` | — | Attempt to publish an incomplete IEP → the checklist blocks it → complete the missing items → publish succeeds |
| `FE-IEP-E2E-04` | SCH-E2E-10 | Record goal progress as the responsible teacher → the parent portal reflects the new status |
| `FE-RPT-E2E-01` | SCH-E2E-15 | Teacher drafts and submits a monthly progress report → coordinator rejects with a comment → teacher revises and resubmits → coordinator approves and publishes → the parent is notified and downloads the PDF from the portal |
| `FE-FEE-E2E-01` | — | Generate monthly invoices → the preview and result counts match → re-run generates nothing new |
| `FE-FEE-E2E-02` | — | Record three partial payments settling an invoice → the status progresses Issued → Partially Paid → Paid → a fourth payment is rejected with the mapped message |
| `FE-FEE-E2E-03` | — | Waive an invoice as principal → the outstanding drops and the portal reflects it |
| `FE-FEE-E2E-04` | — | Reverse a payment → the original payment remains visible marked reversed and the outstanding increases |
| `FE-ACT-E2E-01` | SCH-E2E-14 | Create an outdoor activity with capacity 3 → invite 6 students → 3 parents opt in from the portal and fee payment is recorded → the next 3 are waitlisted with positions → one confirmed student withdraws → position 1 is promoted and their invoice is generated |
| `FE-ACT-E2E-02` | — | Mark activity attendance for all participants → the student's school attendance percentage is unchanged |
| `FE-ACT-E2E-03` | — | Cancel an activity → all enrollments withdraw, unpaid invoices cancel, and parents see the cancellation |
| `FE-ACT-E2E-04` | — | A parent responds after the deadline → the actions are replaced by an explanatory message |
| `FE-POR-E2E-01` | SCH-E2E-11 | Parent portal: view attendance, IEP, progress reports, and fees for their child |
| `FE-POR-E2E-02` | SCH-E2E-12, SCH-E2E-13 | Parent submits an advance leave request for three days → the coordinator receives the alert → coordinator approves → the approved dates are auto-marked Excused Leave and the percentage denominator excludes them |
| `FE-POR-E2E-03` | — | **Isolation:** Parent A navigates to a URL containing Parent B's child id → a not-found state renders and no data request is issued |
| `FE-POR-E2E-04` | — | Parent attempts a staff route → redirected to the portal |
| `FE-POR-E2E-05` | — | Parent submits a guardian detail change → an admin sees the pending request → approves → the portal shows the updated value |
| `FE-POR-E2E-06` | — | Portal on a 360px viewport: bottom navigation, child switching, and a leave request submitted entirely on mobile |
| `A11Y-E2E-03` | — | Keyboard-only: build an IEP with two goals and publish it |

### Accessibility tests

- `jest-axe` on every component in section 4.
- Full-page axe scan on: IEP builder, IEP detail, progress report editor, invoice list, invoice detail, defaulter list, discount queue, activity detail, opt-in board, activity attendance, health page, behavioral page, and every portal page.
- The chart table-alternative toggle asserted present and equivalent for all three charts.
- Portal reading-level check documented.

### Visual regression

Baselines for: IEP builder (empty, populated, validation errors), IEP detail with progress, published vs archived version banner, progress report editor, workflow bar in each role's view, invoice generation preview and result, invoice detail in each status, payment dialog, opt-in board (under capacity, at capacity, with waitlist), activity attendance grid, medical alert badge in context, and every portal page at both mobile and desktop widths.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] Portal isolation proven: `POR-E2E-03` passes, and the ESLint boundary rule prevents portal components importing staff modules.
- [ ] No draft IEP or unpublished report is reachable from any portal view — asserted by component and E2E tests.
- [ ] The IEP builder autosaves and recovers a draft after a simulated crash.
- [ ] The IEP publish checklist prevents the incomplete-publish 422 from ever reaching the user in normal use.
- [ ] Partial payment flow works end to end with live outstanding recalculation and correct rejection of overpayment.
- [ ] Waitlist promotion is visible on the board without a manual reload, and the promoted student's invoice appears.
- [ ] The activity-attendance-does-not-affect-school-attendance notice is present and the E2E assertion passes.
- [ ] The medical alert badge is visible to mapped teachers and substitutes on the profile header and in attendance rows.
- [ ] Every chart has a working accessible table alternative.
- [ ] Zero axe violations on all 20+ scanned pages.
- [ ] The full portal is usable at 360px, verified by `POR-E2E-06`.
