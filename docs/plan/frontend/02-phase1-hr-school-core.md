# Frontend Phase 1 — HR & School Core

| Field | Value |
|---|---|
| Duration | 6 weeks |
| Prerequisites | Frontend Phase 0; Backend Phase 1 contract published |
| Feature list coverage | 1.1, 1.2, 1.3, 1.4, 1.5, 1.9, 1.10 (academic year), 3.1, 3.2, 3.3 |
| Backend counterpart | [backend/02-phase1-hr-school-core.md](../backend/02-phase1-hr-school-core.md) |

---

## 1. Objective and scope

Deliver the daily-use screens: student enrollment with the admission-fee gate made visually unmistakable, the shift-capped teacher mapping interface, the substitute workflow, and the attendance marking grid that staff will use every single day.

Two interfaces in this phase carry disproportionate weight. The **attendance grid** is used more than any other screen in the system and must be fast, keyboard-driven, and forgiving. The **mapping interface** encodes a rule (the shift cap) that users will otherwise get wrong repeatedly, so it must prevent the error rather than report it.

**In scope**

- Academic year and term management; shift configuration and the shift-wise schedule view
- Student list, enrollment wizard, profile with tabs, guardians, documents, status management, re-enrollment
- Admission fee payment and waiver screens with receipt download
- Teacher list and profile, shift assignment, certifications
- Student–teacher mapping with live capacity feedback and mapping history
- Substitute assignment queue and assignment dialog
- Student attendance grid, monthly summary, amendment workflow
- HR: employee list, onboarding wizard, profile tabs, documents, contracts, lifecycle actions
- HR attendance marking and monthly summary
- Leave types, leave application, approval queue, balances, leave calendar
- Holiday master with a calendar view

**Out of scope**

- IEP, progress reports, tuition fees, activities, parent portal — Phase 2
- Payroll, gratuity, encashment, performance, recruitment, training, benefits — Phase 5

---

## 2. Prerequisites

- Frontend Phase 0 shell, `DataTable`, `EntitySelect`, `FileUpload`, `StatusBadge`, permission map.
- Backend Phase 1 contract: `HrEmployeeReadService`-backed teacher endpoints, mapping eligibility endpoint, attendance roster endpoint.

The **mapping eligibility endpoint** (`GET /school/mappings/eligibility`) is the contract that makes the shift-cap UI possible. It must be available before this phase's mapping work begins.

---

## 3. Routes and page tree

```
app/(app)/
├── school/
│   ├── academic-years/
│   │   ├── page.tsx                        # list, set current
│   │   └── [id]/page.tsx                   # detail + terms
│   ├── shifts/
│   │   ├── page.tsx                        # list + configure
│   │   └── [id]/schedule/page.tsx          # shift-wise daily schedule
│   ├── students/
│   │   ├── page.tsx                        # list with filters
│   │   ├── new/page.tsx                    # enrollment wizard
│   │   └── [id]/
│   │       ├── page.tsx                    # overview tab
│   │       ├── guardians/page.tsx
│   │       ├── documents/page.tsx
│   │       ├── admission-fee/page.tsx
│   │       ├── attendance/page.tsx
│   │       └── status-history/page.tsx
│   ├── teachers/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/
│   │       ├── page.tsx                    # profile (HR data read-only)
│   │       ├── students/page.tsx           # mapped students
│   │       └── certifications/page.tsx
│   ├── mappings/
│   │   ├── page.tsx                        # active mappings + capacity board
│   │   └── history/page.tsx
│   ├── substitutes/
│   │   ├── page.tsx                        # pending queue + assigned list
│   │   └── history/page.tsx
│   ├── attendance/
│   │   ├── page.tsx                        # marking grid
│   │   ├── summary/page.tsx                # monthly summary
│   │   └── amendments/page.tsx             # amendment queue
│   └── settings/attendance/page.tsx
└── hr/
    ├── employees/
    │   ├── page.tsx
    │   ├── new/page.tsx                    # onboarding wizard
    │   └── [id]/
    │       ├── page.tsx
    │       ├── documents/page.tsx
    │       ├── contracts/page.tsx
    │       ├── attendance/page.tsx
    │       ├── leave/page.tsx
    │       ├── history/page.tsx
    │       └── exit/page.tsx
    ├── attendance/
    │   ├── page.tsx                        # daily marking
    │   ├── summary/page.tsx
    │   └── anomalies/page.tsx
    ├── leave/
    │   ├── page.tsx                        # my leave + apply
    │   ├── approvals/page.tsx              # approval queue
    │   ├── balances/page.tsx
    │   ├── calendar/page.tsx
    │   └── types/page.tsx
    └── holidays/page.tsx
```

Navigation entries added to the Phase 0 map under School and HR, each permission-gated.

---

## 4. Component inventory

### School components

| Component | Notes |
|---|---|
| `StudentEnrollmentWizard` | Four steps: student details → guardians → documents → admission fee summary. Step validation blocks forward navigation; a progress indicator shows completion; state survives accidental navigation via a draft in `sessionStorage`. |
| `StudentStatusBadge` | Wraps `StatusBadge` for the seven student statuses. `pending_admission_fee` renders in amber with the label "Pending Admission Fee" — never an ambiguous icon. |
| `AdmissionFeeBanner` | **The single most important component in this phase.** A persistent amber banner on every page of a pending student, stating the outstanding amount and listing exactly what is blocked ("Teacher mapping, timetable scheduling, and parent portal access are unavailable until the admission fee is cleared"), with a "Record Payment" action for permitted roles. |
| `AdmissionFeePaymentDialog` | Amount pre-filled and read-only (the backend rejects partial payment, so the UI must not invite it), method selector, reference field, optional bank-slip upload, confirmation summary. |
| `AdmissionFeeWaiverDialog` | Visible only to principal and super_admin. Mandatory reason with a minimum length, and an explicit warning that this activates the student without payment. |
| `StudentProfileHeader` | Photo, name, code, status badge, shift, mapped teacher, quick actions. Shows the medical alert flag icon from Phase 2 onward. |
| `GuardianForm` / `GuardianList` | Multiple guardians, primary designation, emergency priority ordering with drag or explicit numbering, portal access toggle. |
| `StudentStatusDialog` | Manual override. Shows the valid target statuses only, requires a reason, and states that the change is recorded permanently. |
| `TeacherProfileCard` | HR-sourced fields rendered read-only with an explanatory hint ("Managed in HR — edit in the employee record") and a link. This is how the UI communicates the single-source-of-truth design rather than leaving users confused about why a field is greyed out. |
| `TeacherShiftAssignment` | Morning / Day checkboxes with current mapping counts per shift, and a clear warning when unchecking a shift that has an active mapping. |
| `ShiftCapacityBoard` | Grid of teachers × shifts showing occupied and free slots with the mapped student name. The primary way a coordinator decides who to map, and the reason the shift cap stops being a mystery. |
| `MappingDialog` | Teacher `EntitySelect` **filtered to teachers with free capacity in the student's shift**, so the invalid choice is not offered. Shows the student's shift, the teacher's current mappings, and a confirmation summary. If the API still returns `SHIFT_CAP_EXCEEDED` (a race), the dialog shows the mapped error message and refreshes the eligibility list. |
| `MappingHistoryTimeline` | Effective dates, reasons, and who made each change. |
| `SubstituteQueue` | Pending rows grouped by absent teacher, showing affected students, date range, trigger (absence or leave), and urgency (today, tomorrow, later) with visual priority. |
| `SubstituteAssignDialog` | Substitute `EntitySelect` excluding teachers who are absent or on leave in the range, with a note that the shift cap does not apply to substitutes — otherwise coordinators assume the same restriction. |
| `AttendanceGrid` | See below. |
| `AttendanceSummaryTable` | Per student per month: working days, present, absent, late, half-day, excused, medical, percentage. Percentage colour-coded with a text label. A tooltip explains the calculation, because users otherwise dispute the number. |
| `AmendmentRequestDialog` / `AmendmentQueue` | Post-freeze correction request and the coordinator's review queue with before/after. |
| `ShiftScheduleView` | Shift-wise daily view: enrolled students, mapped teachers, substitutes in effect. |

### `AttendanceGrid` — detailed requirements

Used daily by teachers and coordinators, often on a tablet.

- Loads the roster for a chosen date and shift in one request, including any existing marks.
- Row per student: photo thumbnail, name, code, a segmented status control (Present / Absent / Late / Half Day / Excused / Medical), and an optional remark field.
- **Bulk actions:** "mark all present" as the primary action, since present is the overwhelming default. Then individual exceptions are set.
- **Keyboard flow:** arrow keys move between rows, number keys 1–6 set a status, Enter moves to the next student. A teacher can mark 40 students without touching the mouse.
- **Holiday handling:** when the date is a holiday, the grid is replaced by an informational panel naming the holiday. No partially-disabled grid that invites confusion.
- **Future date:** the date picker prevents future selection.
- **Freeze:** dates past the freeze window render read-only with a "Request Amendment" action per row.
- **Save:** a single bulk submit with a per-row result. Partial failures are shown inline against the affected students, and successfully saved rows are not resubmitted on retry.
- **Unsaved-changes guard** on navigation.
- **Offline tolerance:** marks are held in local state and only sent on submit, so a dropped connection mid-marking does not lose work. The full offline queue arrives in Phase 9; this phase ensures the data is not lost from memory prematurely.
- **Accessibility:** the grid is a real table with row headers; the status control is a radio group per row with an accessible name including the student's name ("Status for Amina Rahman"); saving announces "Attendance saved for 40 students" via `aria-live`.

### HR components

| Component | Notes |
|---|---|
| `EmployeeOnboardingWizard` | Personal → employment → salary basics → documents. Salary is a permission-gated step visible only to hr_officer and super_admin. |
| `EmployeeProfileTabs` | Overview, documents, contracts, attendance, leave, history, exit. |
| `EmploymentStatusBadge` | Six statuses with clear labels. |
| `ContractExpiryIndicator` | Days remaining with amber under 30 and red when expired. |
| `HrAttendanceGrid` | Same interaction model as the school grid, with check-in/check-out times, overtime, and late minutes. Consistency here is deliberate — staff who learn one grid know the other. |
| `LeaveApplicationForm` | Type selector showing the live balance for the selected type, date range with an automatic working-day count that excludes holidays, half-day toggle, reason, conditional medical-certificate upload that appears when the day count crosses the type's threshold. |
| `LeaveBalanceCards` | Per type: entitled, carried forward, consumed, pending, available. Pending is shown distinctly so users understand why their available balance is lower than expected. |
| `LeaveApprovalQueue` | Grouped by urgency, showing the applicant, type, range, balance impact, and any therapy or teaching conflicts flagged by the backend. |
| `LeaveApprovalDialog` | Approve or reject with a mandatory reason on reject, and a warning listing affected students or therapy sessions. |
| `LeaveCalendar` | Team or department month view of approved leave, with holidays overlaid. |
| `HolidayCalendar` | Year calendar with month grid, type colour coding, bulk import, and per-department applicability. |
| `AnomalyList` | Repeated lateness and unexplained absences with a drill-down to the employee's attendance. |

---

## 5. Server state

### Query key additions

```typescript
school: {
  academicYears: { all: [...], detail: (id) => [...], terms: (id) => [...] },
  shifts:        { all: [...], schedule: (id, date) => [...] },
  students:      {
    all: ['school','students'],
    list: (f) => ['school','students','list',f],
    detail: (id) => ['school','students','detail',id],
    guardians: (id) => [...], documents: (id) => [...],
    admissionFee: (id) => [...], statusHistory: (id) => [...],
    attendance: (id, month) => [...],
  },
  teachers:      { all: [...], detail: (id) => [...], students: (id) => [...] },
  mappings:      { list: (f) => [...], eligibility: (shiftId) => [...], history: (f) => [...] },
  substitutes:   { pending: [...], list: (f) => [...] },
  attendance:    { roster: (date, shiftId) => [...], summary: (f) => [...], amendments: (f) => [...] },
},
hr: {
  employees:   { all: [...], list: (f) => [...], detail: (id) => [...], history: (id) => [...] },
  attendance:  { list: (f) => [...], summary: (f) => [...], anomalies: (f) => [...] },
  leave:       { types: [...], requests: (f) => [...], balances: (empId, year) => [...], calendar: (f) => [...] },
  holidays:    { list: (year) => [...] },
}
```

### Cross-module invalidation

This is where invalidation gets non-obvious, because backend events change data the user was not directly editing. Each of these is declared explicitly:

| Mutation | Invalidates |
|---|---|
| Record admission fee payment | `students.detail`, `students.list`, `students.admissionFee`, `students.statusHistory`, `mappings.eligibility` (the student becomes mappable) |
| Waive admission fee | Same as payment |
| Create mapping | `mappings.list`, `mappings.eligibility`, `students.detail`, `teachers.students`, `attendance.roster` |
| End mapping | Same |
| Approve HR leave | `hr.leave.requests`, `hr.leave.balances`, `hr.attendance.list`, **`school.substitutes.pending`** (the backend creates substitute rows), `hr.leave.calendar` |
| Cancel HR leave | Same, plus substitute cancellation |
| Mark HR attendance absent | `hr.attendance.list`, **`school.substitutes.pending`** |
| Assign substitute | `substitutes.pending`, `substitutes.list`, `attendance.roster` |
| Submit attendance | `attendance.roster`, `attendance.summary`, `students.attendance` |
| Create or delete holiday | `hr.holidays`, `attendance.roster` (holiday status changes), `hr.leave.balances` (day counts change) |

The two marked in bold are the ones a developer will miss without this table: approving leave in HR must refresh the School substitute queue, or the coordinator will not see the new pending assignment until a manual reload.

### Stale time choices

| Data | staleTime | Reason |
|---|---|---|
| Academic years, shifts, leave types, holidays | 15 min | Reference data, changes rarely |
| Student and employee lists | 60 s | |
| Mapping eligibility | 0 | Capacity changes under you; a stale eligibility list produces a confusing 409 |
| Attendance roster | 0 | Another teacher may be marking concurrently |
| Leave balances | 0 | Balance is the basis of the submit decision |

---

## 6. Client state

- `filterStore` gains persisted filters for the student list (status, shift, academic year, disability category), employee list (department, type, status), and attendance grid (last used date and shift, so a teacher returning lands where they left).
- `attendanceDraftStore` — a small Zustand slice holding in-progress attendance marks keyed by `(date, shiftId)`, persisted to `sessionStorage`. This is what makes an accidental refresh mid-marking non-destructive, and it is the foundation the Phase 9 offline queue builds on.
- `wizardStore` — draft state for the enrollment and onboarding wizards, cleared on successful submit.

---

## 7. Forms and validation

| Form | Notable rules |
|---|---|
| Student enrollment | Name required; DOB required and must produce an age between 2 and 25 with a warning outside 3–18; gender required; disability category from the configured list; severity required; shift required; academic year defaults to current; at least one guardian with a phone; admission date not in the future |
| Guardian | Name, relation, phone required; email format when present; exactly one primary guardian enforced across the set; emergency priority unique |
| Admission fee payment | Amount locked to the outstanding figure; method required; reference required for non-cash; date not in the future |
| Admission fee waiver | Reason minimum 20 characters — a short reason like "ok" is worthless in an audit |
| Student status override | Target status from the valid transitions only; reason minimum 20 characters |
| Teacher creation | Employee selected from `EntitySelect` filtered to `department = school` and not already a teacher; at least one specialization area; at least one shift |
| Mapping | Student and teacher required; shift derived from the student and displayed read-only; reason optional but encouraged |
| Substitute assignment | Substitute required; date range within the trigger's range; reason required |
| Attendance bulk submit | Every student has a status; date not a holiday and not future; remark max 200 characters |
| Amendment request | Requested status differs from current; reason minimum 20 characters |
| Employee onboarding | Name, DOB, gender, joining date required; department and designation required; employment type required; probation end after joining date; basic salary positive (permission-gated); national ID format validated |
| Leave application | Type required; range valid; computed days must not exceed the available balance, with the shortfall stated; reason required; medical certificate required conditionally |
| Leave approval | Reject requires a reason of at least 10 characters |
| Holiday | Name and date required; duplicate date and type combination rejected client-side before submit |

**A recurring pattern worth stating once:** wherever the backend enforces a minimum reason length for an audited action (waiver, status override, rejection, amendment), the client enforces the same minimum with a character counter. This is not duplication for its own sake — it prevents a user writing a one-word reason, submitting, and losing the form contents to a 400.

---

## 8. RBAC visibility

| Element | Visible to |
|---|---|
| School navigation section | Anyone with `school:read` |
| Student create / edit | coordinator, receptionist, super_admin |
| Student delete | principal, super_admin |
| Status override | principal, super_admin |
| Admission fee payment | coordinator, accountant, receptionist |
| Admission fee waiver | principal, super_admin |
| Mapping create / end | coordinator, principal, super_admin |
| Substitute assign | coordinator, principal |
| Attendance marking | mapped teacher, assigned substitute, coordinator |
| Attendance amendment decision | coordinator, principal |
| Academic year / shift configuration | super_admin, principal (year), coordinator (shift) |
| HR navigation section | hr_officer, super_admin, principal (read) |
| Employee create / edit | hr_officer, super_admin |
| Salary fields on the employee form | hr_officer, super_admin only |
| Leave approval | hr_officer, principal |
| Leave application | every authenticated staff user, for themselves |
| Holiday management | hr_officer, super_admin |

**Scoped visibility.** A `teacher` role sees the student list filtered to their mapped students and the attendance grid only for their shift. The filtering is server-side; the UI additionally omits the shift selector for a single-shift teacher rather than showing a selector with one option.

---

## 9. Accessibility and responsive requirements

| Item | Requirement |
|---|---|
| Attendance grid keyboard flow | Arrows to move, 1–6 to set status, Enter to advance. Documented in an on-screen keyboard-shortcut hint that is itself keyboard reachable. |
| Attendance grid semantics | Real table; row header is the student name; each status control is a radio group with an accessible name including the student's name |
| Save announcement | `aria-live` announces the count saved and any failures |
| Admission fee banner | `role="status"`, not `role="alert"` — it is persistent information, not an interruption |
| Shift capacity board | Not colour-only: each cell states "Free" or the mapped student's name as text |
| Attendance percentage | Colour plus a text label ("92% — Good"), never colour alone |
| Wizards | Step position announced ("Step 2 of 4: Guardians"); errors summarised and focused |
| Leave balance cards | Each figure has a visible label; the pending figure is explained in text, not only a tooltip |
| Mobile attendance | Per-student vertical cards with a full-width segmented control; the bulk "mark all present" action is a sticky top button |
| Mobile capacity board | Becomes a per-teacher accordion listing shifts |
| Mobile wizards | Single column with a sticky footer action bar |
| Holiday calendar | Keyboard navigable month grid with dates announced including holiday names |
| Date pickers | Fully keyboard operable with typed date entry as an alternative |

---

## 10. Tests owed by this phase

### Component tests

| Target | Scenarios |
|---|---|
| `AttendanceGrid` | Renders roster; mark-all-present sets every row; individual override; keyboard flow sets statuses across five rows; holiday date renders the info panel instead of the grid; future date blocked; frozen date read-only with amendment action; partial save failure shows per-row errors and does not resubmit successes; unsaved-changes guard; announcement fires; axe clean; mobile card layout at 360px |
| `AdmissionFeeBanner` | Renders for pending students with the outstanding amount and blocked-actions list; hidden for active students; payment action visible only to permitted roles |
| `AdmissionFeePaymentDialog` | Amount locked; non-cash requires a reference; success closes and triggers invalidation; a 422 renders the mapped message |
| `AdmissionFeeWaiverDialog` | Hidden for non-principal roles; short reason blocked with a character counter; success path |
| `MappingDialog` | Teacher list contains only eligible teachers; an ineligible teacher is absent from the options; a `SHIFT_CAP_EXCEEDED` response renders the mapped message and refetches eligibility; student shift shown read-only |
| `ShiftCapacityBoard` | Free and occupied slots render with text labels; a dual-shift teacher shows both rows; axe clean |
| `SubstituteQueue` | Groups by teacher; urgency ordering; assign action opens the dialog; empty state when nothing is pending |
| `SubstituteAssignDialog` | Excludes unavailable teachers; the shift-cap-not-applicable note is present |
| `StudentEnrollmentWizard` | Step validation blocks forward navigation; back preserves entered data; draft survives a remount; final submit sends the full payload; the fee summary step shows the resolved amount |
| `StudentStatusDialog` | Only valid target statuses offered; short reason blocked |
| `TeacherProfileCard` | HR fields read-only with the explanatory hint and link |
| `LeaveApplicationForm` | Balance displayed for the selected type; day count excludes holidays; exceeding balance blocks submit with the shortfall stated; medical certificate field appears past the threshold; half-day adjusts the count |
| `LeaveBalanceCards` | Pending shown distinctly; available computed correctly |
| `LeaveApprovalDialog` | Reject requires a reason; conflict warnings render |
| `HolidayCalendar` | Type colour coding with text labels; duplicate date rejected client-side; keyboard navigation |
| `HrAttendanceGrid` | Same interaction assertions as the school grid, plus late-minute display and overtime entry |
| `AttendanceSummaryTable` | Percentage matches a hand-computed fixture; tooltip explains the calculation; colour plus text label |
| `EmployeeOnboardingWizard` | Salary step hidden for non-permitted roles; probation date validation |

### Hook tests

- Every mutation hook's invalidation set asserted against the table in section 5, using a spy on `queryClient.invalidateQueries`. This is the cheapest way to catch the leave-approval-to-substitute-queue miss.
- Scoped list hooks: a teacher token produces a request with the scope parameter; a coordinator's does not.

### E2E scenarios

| ID | Scenario |
|---|---|
Local IDs use an `FE-` prefix so they never collide with the TDD's own scenario IDs. The `covers` column names the TDD scenario each one executes; the complete mapping for all 40 TDD scenarios lives in [11-test-automation.md](11-test-automation.md) §7.

| ID | Covers TDD | Scenario |
|---|---|---|
| `FE-SCH-E2E-01` | SCH-E2E-01, SCH-E2E-02 | Enroll a student → status shows Pending Admission Fee → the banner lists blocked actions → record payment → status becomes Active → the banner disappears |
| `FE-SCH-E2E-02` | SCH-E2E-01 | Attempt to map a pending-fee student → the student is absent from the mapping candidate list, and a direct attempt shows the mapped 422 message |
| `FE-SCH-E2E-03` | SCH-E2E-04, SCH-E2E-05 | Map a teacher to a student in Morning → attempt a second Morning mapping → blocked with the shift-cap message → map successfully in Day |
| `FE-SCH-E2E-04` | SCH-E2E-06, SCH-E2E-07 | Mark HR attendance absent for a mapped teacher → the substitute queue shows the affected students → assign a substitute → the substitute appears on the attendance roster for those dates, and the primary mapping is restored after the leave period |
| `FE-SCH-E2E-05` | SCH-E2E-08 | Mark attendance for a full shift using only the keyboard → save → the monthly summary reflects the marks |
| `FE-SCH-E2E-06` | SCH-E2E-09 | Attempt attendance on a holiday → the info panel appears, no grid is shown, and the monthly percentage excludes the date |
| `FE-SCH-E2E-07` | — | Attempt attendance on a frozen date → read-only → request an amendment → coordinator approves → the record updates |
| `FE-SCH-E2E-08` | — | Principal overrides a student status with a reason → the status history timeline shows the override flagged as manual |
| `FE-SCH-E2E-09` | SCH-E2E-03 | Waive an admission fee as principal → the student activates and the fee shows as waived with the reason |
| `FE-HR-E2E-01` | HR-E2E-06 (leave portion) | Apply for leave → balance held → HR approves → principal approves → balance consumed → attendance rows show Leave |
| `FE-HR-E2E-02` | HR-E2E-02 | Approve leave for a teacher → the School substitute queue updates without a manual reload |
| `FE-HR-E2E-03` | HR-E2E-07 | Reject leave with a reason → the applicant sees the reason on their leave page and the balance is unchanged |
| `FE-HR-E2E-04` | HR-E2E-01 | Onboard an employee → create a school teacher profile from that employee → HR fields render read-only on the teacher page |
| `FE-HR-E2E-05` | — | Add a holiday → the attendance grid for that date shows the holiday panel and the leave day count changes |
| `RBAC-E2E-02` | — | Teacher role: sees only mapped students; cannot access `/school/mappings`; cannot open the waiver dialog; can mark attendance for their shift only |
| `A11Y-E2E-02` | — | Keyboard-only: navigate to the attendance grid, mark a full roster, and save without using a mouse |

### Accessibility tests

- `jest-axe` on every component in section 4.
- Full-page axe scan on: student list, student detail, enrollment wizard (each step), attendance grid (populated, holiday, frozen), mapping page, capacity board, substitute queue, employee list, employee detail, leave application, leave approval queue, leave calendar, holiday calendar.
- Manual screen reader pass on the attendance grid, documented in the phase's test notes. This screen is complex enough that automated checks are insufficient.

### Visual regression

Baselines for: student list (all statuses represented), student detail with and without the admission fee banner, enrollment wizard steps, attendance grid (empty roster, fully marked, holiday, frozen), capacity board (empty, partial, full), substitute queue, leave balance cards, leave calendar, holiday calendar, employee detail tabs, and mobile viewports of the attendance grid and student list.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] The admission fee gate is communicated on every page of a pending student, and the mapping candidate list excludes pending students — both proven by E2E.
- [ ] The mapping dialog never offers an ineligible teacher, and a race-condition 409 is handled gracefully with a refetch.
- [ ] The attendance grid is fully operable by keyboard, verified by an E2E test that uses no mouse input.
- [ ] The attendance grid handles holiday, future, frozen, and partial-failure cases with distinct, tested UI.
- [ ] A refresh mid-marking does not lose entered attendance.
- [ ] Every mutation's invalidation set matches section 5, asserted by hook tests — including leave approval refreshing the substitute queue.
- [ ] Attendance percentage displayed matches the backend's hand-computed fixture value.
- [ ] Every audited-reason field enforces the same minimum length as the backend.
- [ ] Teacher-scoped views verified by E2E for the student list, attendance grid, and mapping access.
- [ ] Zero axe violations on all 14 scanned pages; the attendance grid screen reader pass documented.
- [ ] Mobile layouts verified at 360px for the attendance grid, student list, and both wizards.
