# Special School & Therapy Center — Management Software
## Complete Feature List

---

## TABLE OF CONTENTS

1. School Module
2. Therapy Module
3. HR Module
4. Accounts / Ledger Module
5. Finance Module
6. Inventory Module
7. Procurement Module
8. Report Module
9. System Administration Module *(Added)*
10. Parent & Guardian Portal *(Added)*
11. Communication & Notification Module *(Added)*
12. Dashboard & Analytics Module *(Added)*

---

## 1. SCHOOL MODULE

### 1.1 Shift Management
- Define and configure two shifts: **Morning** and **Day**
- Set shift timings, working hours, and break periods per shift
- Assign students and teachers to a specific shift
- View shift-wise daily schedule
- Shift-wise capacity limits

### 1.2 Student Enrollment & Profile
- Enroll new students with a unique student ID
- Capture personal details: name, date of birth, gender, nationality, religion
- Record disability category / diagnosis (e.g., Autism, Down Syndrome, Cerebral Palsy)
- Disability severity level and support needs
- Guardian / parent details: name, relation, contact number, email, occupation
- Emergency contact information (primary and secondary)
- Student photo upload
- Previous school / therapy history
- Upload and manage supporting documents (birth certificate, disability certificate, doctor reports, previous IEP records)
- Assign student to a shift
- Academic year / enrollment year tracking
- Re-enrollment support across academic years

#### Admission Fee Collection
- Define a one-time admission fee amount (configurable globally or per student category)
- Admission fee invoice generated automatically upon enrollment submission
- Record admission fee payment: cash, bank transfer, cheque, online
- Official admission fee receipt generation
- Admission fee waiver with principal approval and reason logging
- Integration with Accounts module for ledger posting

#### Student Status & Activation Rule
- **Newly enrolled students are set to "Pending Admission Fee" status by default**
- Student status is **not activated** until the admission fee is fully cleared (or a waiver is approved)
- Once admission fee is cleared / waived, status automatically transitions to **Active**
- No teacher assignment, timetable scheduling, or portal access is permitted while status is "Pending Admission Fee"
- Full student status lifecycle: **Pending Admission Fee → Active → On Leave / Inactive → Graduated / Transferred / Withdrawn**
- Manual status override by principal with mandatory reason (for exceptional cases)

### 1.3 Teacher Enrollment & Profile
- Link teacher to Employee ID from HR module (no duplicate entry)
- Auto-populate teacher profile from HR records (name, contact, designation)
- Additional school-specific fields: specialization areas, teaching methodology, years of experience with special needs students
- Teaching certifications and qualifications
- **Shift Assignment:** A teacher may be assigned to one or both shifts (Morning and/or Day)
  - A teacher assigned to a single shift is responsible for a maximum of **1 student** in that shift
  - A teacher assigned to **both shifts** is responsible for a maximum of **2 students** — exactly **1 student from the Morning shift** and **1 student from the Day shift**
  - The system enforces this cap and prevents over-assignment
- Teacher status: Active, On Leave, Resigned, Transferred

### 1.4 Student–Teacher Mapping
- **Primary mapping model — one student per teacher per shift:**
  - A teacher assigned to a **single shift** is mapped to exactly **1 student** in that shift
  - A teacher assigned to **both shifts** is mapped to a maximum of **2 students** — **1 student from the Morning shift + 1 student from the Day shift**
  - The system enforces this rule and blocks any mapping that would violate the shift-student cap
- View all current student–teacher mappings (filterable by shift)
- Mapping history with effective dates and shift context
- Only students with **Active** status (admission fee cleared) are eligible for teacher mapping

- **Substitute Teacher Assignment:**
  - **Triggers:** substitute workflow is triggered when a teacher is either:
    - Marked **absent** via HR Attendance module, **or**
    - Has an **approved leave** recorded via HR Leave module for that day / date range
  - System auto-detects both absence and approved leave and flags affected students for substitute assignment
  - Principal / coordinator can assign a substitute teacher for the specific day(s) of absence or leave
  - In substitute scenarios only, a substitute teacher may be temporarily mapped to multiple students across shifts for those days
  - Substitute assignment is strictly time-bound — limited to the duration of the primary teacher's absence or approved leave period
  - System auto-reverts to primary teacher mapping when the absence or leave period ends
  - Audit trail of all substitute assignments: reason, substitute teacher, date range, who assigned
- Alert / notification to coordinator when a teacher is absent or on approved leave with no substitute yet assigned

### 1.5 Attendance Management
- Daily attendance marking per student, shift-wise
- Attendance can be marked by teacher or coordinator
- Present / Absent / Late / Half-Day / Medical Leave statuses
- **Holiday Integration:** Holidays defined in HR module are automatically excluded from student attendance counts and reports
- Monthly attendance summary per student
- Attendance percentage calculation (excluding holidays)
- Unauthorized absence alerts to parents / guardians
- Attendance correction / amendment with approval
- Bulk attendance entry
- Attendance freeze after a set number of days (configurable)
- Export attendance data

### 1.6 IEP (Individualized Education Program) Management *(Added)*
- Create IEP for each student with start and review dates
- Define long-term goals and short-term measurable objectives per developmental domain (Communication, Social, Cognitive, Motor, Self-care, Behavioral)
- Assign responsible teacher for each IEP goal
- Track goal progress: Not Started, In Progress, Achieved, Discontinued
- Schedule quarterly IEP review meetings
- Record IEP review outcomes and update goals
- Generate IEP document (printable / exportable PDF)
- IEP history and version control
- Link IEP goals to monthly progress reports
- Parent acknowledgment / signature capture for IEP

### 1.7 Progress Reports
- **Monthly Progress Report:** Narrative and rating-based progress across developmental areas linked to IEP goals
- **Quarterly IEP Programme Report:** Formal review against quarterly IEP goals
- Teacher submits draft report; coordinator reviews and approves
- Report templates configurable per disability category
- Generate printable / shareable reports (PDF)
- Progress trend charts per student over time
- Attach supporting evidence (photos, work samples) to reports
- Report history archive per student
- Notify parents when a new report is available

### 1.8 Fee Management
- Define fee structure: monthly tuition, admission fee, transport, material fees
- Fee category assignment per student (may vary by programme / disability level)
- Monthly invoice generation
- Discount / concession management with approval
- Scholarship tracking
- Record payments (cash, bank transfer, cheque, online)
- Outstanding balance tracking
- Automated fee reminders to parents
- Official fee receipt generation
- Partial payment support
- Fee waiver with principal approval and reason logging
- Integration with Accounts module for ledger postings
- Fee collection summary reports

### 1.9 Holiday Management *(Managed via HR Module; integrated into School)*
- School calendar displays all HR-defined holidays
- Holidays are excluded from student attendance calculations
- Working days count used in attendance percentage
- Special school events / activity days managed separately

### 1.10 Academic Year & Curriculum Management *(Added)*
- Define academic year start and end dates
- Term / semester configuration within the academic year
- Curriculum / skill domain definition per disability category
- Learning objectives mapped to domains
- Carry-forward of active students to next academic year

### 1.11 Student Health & Medical Records *(Added)*
- Record known medical conditions, allergies, medications
- Emergency medical protocol per student
- Immunization records
- Medical incident log (injuries, seizures, health episodes on school premises)
- Upload medical documents / prescriptions
- Medical alert flags visible to assigned teacher

### 1.12 Student Behavioral Tracking *(Added)*
- Log behavioral incidents: type, date, time, description, persons involved
- Behavioral support plan linked to student profile
- Track behavioral trends over time
- Intervention strategies documented
- Link behavioral data to IEP goals

### 1.13 Optional Outdoor Activities *(Added)*

#### 1.13.1 Activity Management
- Define outdoor activity types: field trips, sports sessions, swimming, nature walks, community outings, etc.
- Activity details: name, description, date and time, venue / destination, duration, supervising teacher(s)
- Maximum participant capacity per activity
- Activity status: Upcoming, Ongoing, Completed, Cancelled

#### 1.13.2 Parent Opt-In & Student Enrollment
- Activities are **optional** — participation is driven by parent / guardian consent only
- Send activity announcement and opt-in invitation to parents via notification (in-app, SMS, email)
- Parent accepts or declines from Parent Portal or via notified link
- Coordinator can also manually record parent consent on behalf of guardian
- Student is added to the activity participant list only upon confirmed parent opt-in
- Opt-in deadline configurable per activity; registrations closed automatically at deadline
- View enrollment list: confirmed participants, pending responses, declined
- Waiting list if capacity is reached; auto-fill from waiting list on cancellation

#### 1.13.3 Fee Management for Activities
- Define activity-specific fee per student (one-time charge per activity)
- Fee can vary by activity type or be set individually per event
- Generate individual invoice per participating student upon opt-in confirmation
- Record payment per student: cash, bank transfer, online
- Partial payment support with outstanding balance tracking
- Official receipt generation per student per activity
- Fee waiver with principal approval (for students on scholarship / concession)
- Unpaid activity fee alerts to parents before activity date
- Integration with Accounts module for ledger postings

#### 1.13.4 Activity Attendance
- Mark attendance for each participating student on the activity day
- Present / Absent / Withdrew Last Minute statuses
- Activity attendance is recorded separately and does not affect regular school attendance
- Attendance report per activity

#### 1.13.5 Activity Views & History
- Activity calendar view showing all upcoming and past outdoor activities
- List view with filter by status, date range, activity type
- From Student Profile: view all activities the student has participated in or is enrolled for
- Post-activity summary: participant count, attendance, fee collected, photos upload (optional)
- Cancellation of activity with reason; notify enrolled parents automatically

---

## 2. THERAPY MODULE

### 2.1 Therapist Management
- Enroll therapist linked to Employee ID from HR module
- Auto-populate details from HR records
- Therapist type: **Permanent** / **Contractual**
- Specialization: **Occupational Therapy (OT)**, **Speech Therapy**, **Applied Behavior Analysis (ABA)**, **Music Therapy**, **Dance / Movement Therapy**, **Assessment**
- A therapist can have multiple specializations
- Specializations that support group delivery (OT, Speech, Music, Dance) are flagged accordingly in therapist profile
- License and professional certification tracking with expiry alerts
- Therapist availability schedule (working days/hours per week)
- Therapist status: Active, On Leave, Contract Ended, Resigned

### 2.2 Patient Management
- **Enroll from School Students:** Search and select existing enrolled students; link patient record to student profile
- **Enroll External Patients:** Full patient registration for non-student individuals
- Patient unique ID generation
- Capture: name, date of birth, gender, diagnosis, referral source, guardian details, emergency contact
- Patient photo
- Medical history: existing conditions, medications, allergies, past therapy history
- Insurance / panel details (if applicable)
- Consent form upload (guardian consent for therapy)
- Patient status: Active, Discharged, On Hold, Assessment Only

### 2.3 Therapist Profile View
- Full profile with specialization and employment type
- Calendar view of assigned sessions (day / week / month)
- List view of upcoming and past sessions
- Ability to schedule new sessions directly from therapist profile
- Performance summary: sessions conducted, cancellations, patients served

### 2.4 Patient Profile View
- Full patient details and medical background
- Active therapy types enrolled in
- Calendar view of scheduled sessions
- List view of sessions (upcoming, past, cancelled)
- Ability to schedule new sessions directly from patient profile
- Therapy progress summaries per therapy type
- Payment / outstanding balance overview from patient profile

### 2.5 Therapy Scheduling

#### 2.5.1 General Scheduling Rules
- **Assessment Sessions:** Patient name entered manually (may be a new/unregistered individual)
- **All Other Therapy Types (OT, Speech, ABA):** Patient selected from dropdown (must be enrolled)
- Assign therapist and therapy type
- Set session date, start time, and duration
- Select session location / room
- Notes or special instructions per session

#### 2.5.2 Scheduling Entry Points
- Schedule from the main **Therapy Scheduling** section
- Schedule from **Patient Profile**
- Schedule from **Therapist Profile**

#### 2.5.3 Recurring / Recursive Scheduling
- Set recurrence pattern: Daily, Weekly (specific days), Bi-weekly, Monthly
- Define recurrence end: by date, by number of sessions, or indefinitely
- Bulk update / cancel recurring sessions
- Edit a single occurrence without affecting the series
- Edit the series from a selected date onward

#### 2.5.4 Conflict Detection
- Detect double-booking of therapist
- Detect room / resource conflicts
- Warn if scheduling overlaps with therapist's leave (from HR)
- Warn if scheduling outside therapist's availability hours

#### 2.5.5 Waiting List *(Added)*
- Add patients to waiting list when therapist / time slot unavailable
- Auto-notify when a slot becomes available
- Priority / date-based waiting list ordering

### 2.6 Schedule Views

#### 2.6.1 Calendar View
- Attractive, color-coded, interactive calendar
- Color coding by therapy type and/or therapist
- Day / Week / Month toggle
- Drag-and-drop rescheduling (with conflict check)
- Click session to view details, edit, or cancel
- Filter by therapist, patient, therapy type, status

#### 2.6.2 List View
- Sortable, filterable list of sessions
- Columns: Date, Time, Patient, Therapist, Therapy Type, Room, Status, Actions
- Search and filter (date range, therapist, patient, status)
- Export list to Excel / PDF

#### 2.6.3 Profile-level Schedule Views
- Both calendar and list views accessible from Therapist Profile
- Both calendar and list views accessible from Patient Profile

### 2.7 Session Management *(Added)*
- Mark session status: Scheduled, In Progress, Completed, Cancelled, No Show
- Session notes / clinical documentation per completed session
- Goal progress update per session (link to treatment plan goals)
- Session duration actual vs. planned
- Upload session materials or observation notes (photos, worksheets)
- Supervisor review / co-sign for session notes

### 2.8 Treatment Plans *(Added)*
- Create a treatment plan per patient per therapy type
- Define therapy goals (short-term and long-term)
- Target behaviors and baseline measurements
- Progress tracking against each goal per session
- Review and update treatment plans periodically
- Treatment plan history and version control
- Share treatment plan report with parent / guardian

### 2.9 Cancellation Management
- Cancel a single session or all future sessions in a recurring series
- Mandatory reason entry on cancellation
- Cancellation log with timestamp and user
- Notify patient / guardian on cancellation
- Option to reschedule on cancellation

### 2.10 Payment & Billing
- Define therapy fee structure per therapy type and session duration
- Generate invoice per session or consolidated monthly invoice
- Record payment: cash, bank transfer, online
- Partial payment support
- Outstanding balance tracking per patient
- Official receipt generation
- Refund recording (for prepaid sessions)
- Integration with Accounts module for ledger entries
- Payment history per patient

### 2.11 Referral Management *(Added)*
- Record referral source (self, doctor, school, other)
- Track referral chain for multi-therapy patients
- Referral letters upload

### 2.12 Group Therapy *(Added)*

#### 2.12.1 Overview & Supported Therapy Types
- Group therapy allows multiple patients to receive therapy simultaneously under one therapist in a single session
- Supported therapy types for group delivery: **Occupational Therapy (OT)**, **Speech Therapy**, **Music Therapy**, **Dance / Movement Therapy**
- ABA and Assessment are excluded from group therapy (individual-only modalities)
- Each group has a defined minimum and maximum patient capacity

#### 2.12.2 Group Management
- Create and name therapy groups (e.g., "Tuesday Morning Speech Group", "Music Therapy — Batch A")
- Define therapy type, assigned therapist, session room / venue, capacity (min and max participants)
- Group status: Active, Paused, Closed
- View all current group members from the group record
- Group history: changes in membership, therapist, or schedule over time

#### 2.12.3 Patient Enrollment into Groups
- Select multiple patients from the patient dropdown to enroll into a group
- A patient can be enrolled in multiple groups (for different therapy types)
- Check for scheduling conflicts for each patient being added before confirming enrollment
- Record enrollment date and, if applicable, exit date per patient
- Waitlist for groups at full capacity; auto-notify waitlisted patients when a slot opens
- Remove / discharge a patient from a group with a reason and effective date

#### 2.12.4 Group Therapy Scheduling
- Schedule a group session by selecting the group (therapist and all enrolled patients are auto-loaded)
- Set session date, start time, duration, and room
- Add session-specific notes or instructions
- **Recurring / Recursive Scheduling:**
  - Set recurrence: Daily, Weekly (specific days), Bi-weekly, Monthly
  - Define end condition: by date, number of sessions, or indefinitely
  - Edit a single occurrence without affecting the entire series
  - Edit the series from a specific date onward
  - Bulk cancel upcoming sessions in a series
- **Conflict Detection:**
  - Alert if any enrolled patient has a conflicting individual or group session
  - Alert if therapist has a conflicting session or leave
  - Alert if room is already booked
- Scheduling entry points: main Group Therapy section, Therapist Profile, or Patient Profile

#### 2.12.5 Schedule Views for Group Therapy
- **Calendar View:** Group sessions displayed alongside individual sessions; color-coded distinctly (e.g., by group or therapy type); day / week / month toggle; click to view session details; drag-and-drop rescheduling with conflict check
- **List View:** Sortable, filterable list of group sessions; columns: Date, Time, Group Name, Therapy Type, Therapist, Room, No. of Patients, Status, Actions
- **From Therapist Profile:** Both calendar and list views show group sessions alongside individual sessions
- **From Patient Profile:** Both calendar and list views show all group sessions the patient is enrolled in, alongside individual sessions

#### 2.12.6 Session Management for Group Therapy
- Mark overall session status: Scheduled, In Progress, Completed, Cancelled, No Show
- **Per-patient attendance within each group session:** Present, Absent, Late, Excused
- Group session notes (general narrative for the session)
- Individual patient notes per session (optional — for patient-specific observations)
- Goal progress update per patient per session (linked to individual treatment plans)
- Upload session materials, photos, or activity worksheets

#### 2.12.7 Cancellation Management for Group Therapy
- Cancel a single group session or all future sessions in a recurring series
- Mandatory reason entry on cancellation
- On session cancellation: individual notifications sent to each enrolled patient's guardian
- Option to reschedule the session
- Record which patients were affected

#### 2.12.8 Payment & Billing for Group Therapy
- Define group therapy fee rate per patient per session (typically lower than individual rate, configurable)
- Fee rates can differ by therapy type and group
- **Invoices generated individually per patient** — one patient, one invoice, one payment record per session
- Consolidated monthly invoice option per patient (covering all group sessions attended that month)
- Record payment per patient independently: cash, bank transfer, online
- Partial payment support with outstanding balance tracking per patient
- Official receipt generation per patient
- Fee adjustment / discount per patient with approval (does not affect other group members)
- Refund recording for prepaid sessions
- Integration with Accounts module for ledger postings (each patient's payment posted separately)
- Payment history viewable from individual Patient Profile and from Group record

#### 2.12.9 Group Therapy Reporting
- Group session attendance report (per group, per session, per date range)
- Per-patient attendance summary across all group sessions
- Group therapy revenue report (by group, by therapy type, billed vs. collected, outstanding per patient)
- Therapist group utilization report (groups managed, sessions delivered, total patient-hours)
- Group enrollment history report

---

## 3. HR MODULE *(Full-Functional — Shared across School, Therapy, and Administration)*

### 3.1 Employee Management
- Employee onboarding: unique Employee ID generation
- Employee profile: personal details, contact, address, photo
- Employment type: Permanent, Contractual, Part-time
- Department: School, Therapy, Administration, Support
- Designation / role assignment
- Reporting manager assignment
- Employee contract management (upload, expiry tracking)
- Probation period tracking and confirmation workflow
- Employment history (internal transfers, promotions)
- Employee document vault (NID, qualification certificates, police clearance, offer letter)
- Employee status: Active, On Probation, On Notice, Resigned, Terminated, Retired
- Exit management: last working day, exit interview, clearance checklist

### 3.2 Attendance Management
- Daily attendance: present, absent, late, half-day, on-duty
- Manual entry and/or biometric integration
- Shift assignment per employee
- Overtime tracking
- Late arrival / early departure penalties (configurable)
- Monthly attendance summary
- Attendance anomaly alerts
- Attendance integration with payroll

### 3.3 Leave Management
- Leave types: Annual Leave, Sick Leave, Casual Leave, Emergency Leave, Maternity Leave, Paternity Leave, Unpaid Leave, Compensatory Leave
- Leave balance per employee per leave type
- Leave application and multi-level approval workflow
- Leave calendar (team / department view)
- Medical certificate requirement for sick leave beyond threshold
- **Holiday Master:** Define public and school holidays; feeds into school attendance module
- Leave reports and analytics

#### Leave Encashment
- Configure leave encashment policy: which leave types are encashable, maximum encashable days per year, minimum balance that must be retained before encashment
- Employee can submit a leave encashment request for eligible unused leave days
- Approval workflow (HR officer → principal)
- Encashment amount auto-calculated based on employee's basic salary per day (or configurable formula)
- Encashment payment processed via payroll in the applicable month
- Encashment history per employee
- Encashment also triggered automatically at time of employee exit (for remaining eligible balance)
- Integration with Accounts module for payroll expense posting

### 3.3A Gratuity Management *(Added)*
- **Policy Configuration:** Define gratuity eligibility criteria — minimum service length (e.g., 1 year or 5 years, configurable), applicable employment types (permanent / contractual), and calculation formula (e.g., X days of basic salary per year of service, as per local labour law or organisation policy)
- **Gratuity Calculation:** System auto-calculates gratuity entitlement for each eligible employee based on years of service and current basic salary; recalculated automatically when salary changes or service milestone is crossed
- **Provision Tracking:** Monthly gratuity provision amount computed per employee and posted to the Accounts module (accrual-based); cumulative gratuity liability visible on Balance Sheet under employee benefit obligations
- **Gratuity Ledger:** Full audit trail of monthly provisions, adjustments, and payments per employee
- **Gratuity on Exit:** On employee separation (resignation, termination, retirement), system computes final gratuity payable; takes into account any partial-year proration, forfeiture rules (if applicable per policy), and deductions (advances, if any)
- **Gratuity Payment:** Generate gratuity payment voucher; process via payroll or standalone payment; official receipt / settlement letter generation
- **Gratuity Report:** Employee-wise gratuity entitlement summary; monthly provision report; annual liability report for audit purposes; exit settlement report

### 3.4 Payroll Management
- Salary structure builder: Basic, Housing, Transport, Allowances, Deductions
- Multiple payroll groups (permanent, contractual, part-time)
- Monthly payroll processing and lock
- Statutory deductions: income tax, provident fund, EOBI (or applicable local equivalents)
- Bonus and incentive management
- Payslip generation (printable / emailable)
- Payroll history and audit trail
- Bank transfer file generation
- Year-end tax summary / certificate generation
- Payroll integration with Accounts module

### 3.5 Performance Management *(Added)*
- Annual / bi-annual performance review cycles
- KPI definition per role / department
- Self-appraisal and manager appraisal
- 360-degree feedback (optional)
- Performance rating and overall score
- Increment recommendation linked to appraisal
- Appraisal history per employee

### 3.6 Recruitment *(Added)*
- Job position requisition with principal / management approval
- Job posting management
- Applicant tracking: shortlisted, interviewed, offered, rejected
- Interview scheduling
- Offer letter generation
- Conversion to employee on joining

### 3.7 Training & Development *(Added)*
- Training program creation (in-house and external)
- Employee training schedule and enrollment
- Training attendance recording
- Certification upload post-training
- Training cost tracking
- Training history per employee

### 3.8 Employee Benefits *(Added)*
- Benefits enrollment (health insurance, life insurance)
- Insurance policy tracking (provider, coverage, expiry)
- Loan / advance management: request, approval, repayment schedule
- End-of-service benefits calculation

---

## 4. ACCOUNTS / LEDGER MODULE

### 4.1 Chart of Accounts
- Hierarchical chart of accounts setup
- Account types: Assets, Liabilities, Equity, Revenue, Expenses
- Sub-account creation and mapping
- Account activation / deactivation

### 4.2 Journal Entries
- Manual journal entry creation
- Recurring journal entries
- Journal entry approval workflow
- Reversal entries
- Audit trail on all postings

### 4.3 General Ledger
- View all transactions per account
- Date-range filtering
- Print / export ledger

### 4.4 Bank & Cash Management
- Multiple bank accounts and petty cash registers
- Cash receipt and payment vouchers
- Bank deposit and withdrawal recording
- Cheque management (issued, pending clearance, cleared, bounced)
- Bank reconciliation (match bank statement vs. system entries)

### 4.5 Accounts Receivable
- Student fee receivables (auto-fed from School Fee module)
- Therapy payment receivables (auto-fed from Therapy Billing)
- Aging report: 0–30 days, 31–60 days, 61–90 days, 90+ days
- Collection follow-up log
- Credit note / write-off management

### 4.6 Accounts Payable
- Vendor invoices (auto-fed from Procurement module)
- Payment scheduling
- Advance payment to vendors
- Debit note / vendor credit management

### 4.7 Trial Balance
- Auto-generated from ledger postings
- Period-wise comparison
- Export

### 4.8 Financial Statements
- Profit & Loss Statement (monthly, quarterly, annual)
- Balance Sheet
- Cash Flow Statement
- Notes to accounts (manual)

### 4.9 Tax Management *(Added)*
- Tax type configuration (VAT, withholding tax, income tax — as applicable)
- Tax-inclusive / exclusive invoice handling
- Tax liability tracking
- Tax filing summary reports

### 4.10 Budget Management *(Added)*
- Annual budget creation per department / cost center
- Budget vs. actual comparison
- Over-budget alerts during expense posting
- Budget revision workflow
- Budget utilization reports

### 4.11 Cost Center Accounting *(Added)*
- Cost centers: School, Therapy, Administration, Management
- Tag all income and expense transactions to a cost center
- Profitability report per cost center

---

## 5. FINANCE MODULE

### 5.1 Shareholder / Partner Management
- Register shareholders with name, share percentage, contact
- Share transfer management
- Shareholder document vault

### 5.2 Annual Profit Calculation
- Pull net profit from Accounts module for the financial year
- Retained earnings management
- Distributable profit calculation (after tax and reserves)

### 5.3 Profit Disbursement
- Define distribution ratio per shareholder
- Generate profit disbursement voucher
- Record payment (bank transfer, cheque)
- Dividend disbursement history
- Generate tax certificates for dividend payments (as applicable)
- Dividend register

### 5.4 Reserve & Retained Earnings *(Added)*
- Define reserve funds (general reserve, capital reserve, expansion fund)
- Allocate portion of profit to reserves before disbursement
- Reserve fund history

---

## 6. INVENTORY MODULE

### 6.1 Item / Asset Master
- Register items with category, unit of measure, description, code
- Item categories: Therapy Tools & Instruments, Office Equipment, Furniture, IT Equipment, Consumables, Stationery
- Minimum stock level definition per item
- Item valuation method (FIFO / Average)
- Item photo upload
- Manufacturer / brand details

### 6.2 Stock Management
- Stock receipt (auto-linked from Procurement GRN)
- Manual stock adjustment (with reason and approval)
- Stock transfer between departments / locations
- Stock issue to department or individual
- Real-time stock level view
- Low-stock alerts and auto-purchase request trigger
- Expiry date tracking for consumables

### 6.3 Asset Management *(Added)*
- Asset registration with purchase date, cost, warranty details
- Asset assignment to department, room, or individual
- Asset return and re-assignment tracking
- Asset condition logging (new, good, damaged, scrapped)
- Depreciation tracking (straight-line / reducing balance)
- Asset disposal recording

### 6.4 Inventory Audit
- Schedule **half-yearly inventory audits**
- Generate audit checklist per category / location
- Record physical count against system count
- Discrepancy report: surplus and shortage items
- Audit sign-off by principal / authorized person
- Audit history (all previous audit records)
- Corrective action log for discrepancies

### 6.5 Inventory Reporting
- Stock movement report
- Current stock valuation report
- Low-stock report
- Asset register report
- Audit summary report

---

## 7. PROCUREMENT MODULE

### 7.1 Purchase Request (PR)
- Any department staff can raise a Purchase Request
- PR details: item description, quantity, estimated cost, required-by date, justification
- Link to inventory item master (or free-text for new items)
- Department head preliminary review
- **Principal Approval:** PR routed to Principal for final approval
- Approval with comments or rejection with reason
- PR status tracking: Draft, Pending Approval, Approved, Rejected, PO Issued, Closed
- Email / in-app notification at each status change

### 7.2 Vendor Management *(Added)*
- Vendor registration: name, type, contact, bank details, tax registration
- Vendor categorization (therapy supplier, stationery, IT, maintenance)
- Vendor performance rating
- Preferred vendor list
- Vendor document vault (trade license, tax certificates)
- Blacklist / deactivate vendor

### 7.3 Purchase Order (PO)
- Generate PO from approved PR
- Select vendor from vendor master
- PO terms: delivery date, payment terms, delivery address
- Multi-item PO from single or multiple PRs
- PO approval (if above a value threshold — configurable)
- PO sent to vendor (email or print)
- PO amendment with version history
- PO cancellation with reason

### 7.4 Goods Receipt Note (GRN)
- Receive items against PO
- Record actual quantities received vs. ordered
- Quality check / rejection recording
- Partial delivery support (GRN in installments)
- GRN auto-updates inventory stock levels
- GRN linked to vendor invoice for 3-way matching (PO → GRN → Invoice)

### 7.5 Vendor Invoice & Payment
- Record vendor invoice against GRN
- Invoice approval and posting to Accounts Payable
- Payment scheduling and recording
- Vendor payment history

---

## 8. REPORT MODULE

### 8.1 School Reports
- Student Attendance Report (individual / class-wide, monthly / annual, excluding holidays and excused leaves)
- Monthly Progress Report per student (printable)
- Quarterly IEP Programme Report per student (printable)
- IEP Goal Progress Report (by student, by domain, by goal status)
- Student Enrollment Summary (by year, shift, disability category, status)
- Pending Admission Fee Report (students not yet activated due to unpaid admission fee)
- Admission Fee Collection Report (collected, outstanding, waivers)
- Student–Teacher Mapping Report (by shift)
- Substitute Teacher Assignment History Report
- Student Advance Leave Request Report (pending, approved, rejected by date range)
- Fee Collection Report (collected, outstanding, by student, by month)
- Fee Defaulters Report
- Student Health Incident Report
- Outdoor Activity Participation Report (per activity, per student, across date range)
- Outdoor Activity Fee Collection Report (collected, outstanding, by activity, by student)
- Outdoor Activity Attendance Report
- Parent Opt-In Response Report (accepted, declined, pending per activity)

### 8.2 Therapy Reports
- Session Schedule Report (by date range, therapist, patient, therapy type; individual and group)
- Session Completion Rate Report (completed vs. cancelled vs. no-show; individual and group)
- Patient Progress Report per therapy type
- Therapist Utilization Report (hours delivered, sessions count; individual and group combined)
- Therapy Revenue Report (billed vs. collected, outstanding; individual and group separated)
- Waiting List Report
- Assessment Report per patient
- Group Therapy Session Report (per group, per date range; attendance and completion status)
- Group Therapy Patient Attendance Summary (per patient across all group sessions)
- Group Therapy Revenue Report (per group; per-patient billing and collection status)
- Group Enrollment Report (active members per group, enrollment and exit history)

### 8.3 HR Reports
- Employee Master List (by department, type, status)
- Daily / Monthly Attendance Report
- Leave Balance Report
- Leave Utilization Report
- Leave Encashment Report (by employee, by period)
- Gratuity Entitlement Report (employee-wise current entitlement)
- Gratuity Monthly Provision Report (for accounts / audit)
- Gratuity Annual Liability Report
- Gratuity Exit Settlement Report
- Payroll Summary Report
- Payroll Detail (payslip batch)
- Headcount Report
- Recruitment Pipeline Report
- Training Participation Report
- Employee Turnover Report

### 8.4 Financial & Accounts Reports
- Profit & Loss Statement (monthly, quarterly, annual)
- Balance Sheet (as of any date)
- Cash Flow Statement
- Cost Center Profitability Report
- Accounts Receivable Aging Report
- Accounts Payable Aging Report
- Budget vs. Actual Report
- Bank Reconciliation Report
- Tax Summary Report
- Shareholder Disbursement Report

### 8.5 Inventory & Procurement Reports
- Current Stock Position Report
- Stock Movement Report (receipts and issues)
- Low Stock Alert Report
- Asset Register
- Half-Yearly Audit Report
- Purchase Request Status Report
- PO Tracker Report
- Vendor Performance Report
- Procurement Spend Analysis (by vendor, by category, by period)

### 8.6 Cross-Module / Executive Reports *(Added)*
- Monthly Management Summary (enrollment, sessions, collections, expenses)
- Annual Performance Dashboard (KPIs across all modules)
- Cost per student analysis
- Revenue per therapy type analysis

### 8.7 Report Features *(Added)*
- Date range filters on all reports
- Export to PDF and Excel
- Scheduled / automated report delivery via email
- Custom report builder (drag-and-drop columns)
- Saved report templates
- Role-based visibility (each user sees only authorized reports)

---

## 9. SYSTEM ADMINISTRATION MODULE *(Added)*

### 9.1 User Management
- Create system user accounts
- Link user to Employee ID (where applicable)
- Role assignment: Super Admin, Principal, Coordinator, Teacher, Therapist, Accountant, HR Officer, Receptionist, Parent (read-only)
- Role-based access control (RBAC): define permissions per module per role
- Multi-role assignment to a single user
- User activation / deactivation
- Password policy enforcement (complexity, expiry)
- Two-factor authentication (optional)
- Login activity log (who logged in, when, from which device/IP)

### 9.2 Organization Configuration
- Organization profile: name, logo, address, contact, registration details
- Academic year configuration
- Shift definitions
- System-wide numbering schemes (student ID, employee ID, patient ID, PR number, PO number, invoice number)
- Currency and timezone settings
- Email and SMS gateway configuration

### 9.3 Workflow Configuration
- Define approval chains (PR approval, IEP approval, leave approval, payroll approval)
- Notification triggers and templates (email / SMS)
- Automated reminder schedules

### 9.4 Audit Trail
- System-wide activity log: every create, edit, delete action logged with user, timestamp, before and after values
- Module-level audit log access for administrators
- Tamper-proof log storage

### 9.5 Data Backup & Security *(Added)*
- Automated daily data backups
- Manual backup trigger
- Backup restore capability (admin only)
- Data encryption at rest and in transit
- Session timeout configuration
- IP whitelist / blacklist (optional)

---

## 10. PARENT & GUARDIAN PORTAL *(Added)*

- Secure login for parents / guardians (separate from staff login)
- View student profile and enrolled programs
- View attendance records
- Download monthly progress reports and IEP reports
- View fee invoices, payment history, and outstanding balance
- Online fee payment integration (optional)
- View therapy session schedule (if student is also a patient)
- Receive notifications (attendance alerts, fee reminders, report availability)
- Two-way messaging with school coordinator (limited scope)
- Change / update guardian contact details (pending admin approval)

### IEP Details & Progress View
- Parents can view the **full active IEP** for their child directly from the portal
- IEP details displayed: developmental domains, individual goals (short-term and long-term), target dates, and responsible teacher per goal
- **Progress status visible per goal:** Not Started / In Progress / Achieved / Discontinued — updated by the teacher and visible to parents in real time after coordinator approval
- View IEP review history: previous IEP versions, review meeting dates, and outcomes
- Download / print the current IEP document (PDF)
- **Parent Acknowledgment:** Parents can digitally acknowledge / sign the IEP from the portal; acknowledgment is logged with timestamp and visible to coordinator
- Notification sent to parent when IEP is updated or a new quarterly IEP review is published

### Student Advance Leave Request
- Parents can submit an **advance leave request** for their child directly from the portal
- Leave request fields: student name (auto-filled), leave start date, leave end date, reason / description, leave type (Medical, Family, Travel, Other)
- Option to upload a supporting document (e.g., doctor's letter, travel itinerary)
- Request routed to the school coordinator / principal for approval
- Approval workflow: Pending → Approved / Rejected; rejection must include a reason
- Parent notified of approval or rejection via in-app notification, email, and/or SMS
- Approved leave days are automatically reflected in the student's attendance record as **Excused Leave** (excluded from unauthorized absence count)
- Leave request history visible to parent (all past requests with their statuses)
- Coordinator can view all pending and processed student leave requests in a consolidated queue

---

## 11. COMMUNICATION & NOTIFICATION MODULE *(Added)*

### 11.1 Internal Messaging
- Internal messaging between staff members
- Group messaging (e.g., department groups)
- Announcements (broadcast to all staff, specific departments, or specific roles)
- Notice board for general information

### 11.2 Automated Notifications
- Student absence alert to parent (same day)
- Fee overdue reminder to parent (school tuition and admission fee)
- Admission fee pending alert to parent (reminder until cleared)
- IEP update / new review published — notification to parent
- IEP review reminder to teacher and coordinator
- Student advance leave request submitted — notification to coordinator / principal
- Student advance leave approved / rejected — notification to parent
- Session cancellation alert to patient / guardian
- Leave approval / rejection notification to employee
- Teacher absence / approved leave detected with no substitute assigned — alert to coordinator
- Low stock alert to procurement officer
- PR status update to requester
- License / certification expiry alert for therapists
- Contract expiry alert for contractual employees
- Gratuity provision milestone alert to HR officer (e.g., employee crosses eligibility threshold)

### 11.3 Notification Channels
- In-app notification (bell icon)
- Email notifications
- SMS notifications (via gateway integration)
- WhatsApp integration (optional / future)

### 11.4 Communication Log
- Log of all outbound notifications (to whom, when, channel, content)
- Delivery status tracking

---

## 12. DASHBOARD & ANALYTICS MODULE *(Added)*

### 12.1 Role-Based Dashboards
- **Principal Dashboard:** Enrollment counts, attendance rate, fee collection status, therapy utilization, pending approvals
- **Coordinator Dashboard:** Today's schedule, absent teachers, substitute assignments pending, progress report status
- **Therapist Dashboard:** Today's sessions, upcoming sessions, session completion rate, pending notes
- **Accountant Dashboard:** Revenue summary, outstanding receivables, payables due, budget utilization
- **HR Dashboard:** Today's attendance summary, pending leave requests, upcoming contract renewals, payroll due date

### 12.2 Key Performance Indicators (KPIs)
- Student enrollment trend (monthly, yearly)
- Student attendance rate (school-wide and per student)
- IEP goal achievement rate
- Therapy session completion rate
- Fee collection rate
- HR headcount and attrition rate
- Inventory stock health

### 12.3 Visual Analytics
- Interactive charts and graphs (bar, line, pie, trend)
- Drill-down from summary to detailed data
- Month-over-month and year-over-year comparisons
- Exportable charts and summary snapshots

---

## CROSS-MODULE INTEGRATION SUMMARY

| Integration | From | To |
|---|---|---|
| Employee ID | HR | School Teacher, Therapy Therapist |
| Teacher Absence | HR Attendance | School Substitute Assignment Trigger |
| Teacher Approved Leave | HR Leave | School Substitute Assignment Trigger |
| Therapist Leave | HR Leave | Therapy Schedule Conflict Alert |
| Holiday Master | HR | School Attendance (excluded days) |
| Admission Fee Cleared | School Fee | Student Status → Active (unlock teacher mapping & portal) |
| Student Advance Leave Approved | Parent Portal | Student Attendance (Excused Leave) |
| IEP Update / Review Published | School IEP | Parent Portal Notification |
| Gratuity Monthly Provision | HR Gratuity | Accounts Expense Ledger (accrual) |
| Gratuity Exit Payment | HR Gratuity | Accounts Payable / Payroll |
| Leave Encashment Payment | HR Leave Encashment | Payroll / Accounts Expense Ledger |
| Fee Posting | School Fee / Therapy Individual Billing / Group Therapy Billing / Outdoor Activity Fee | Accounts Receivable |
| Vendor Invoice | Procurement | Accounts Payable |
| GRN | Procurement | Inventory Stock Level |
| Payroll Posting | HR Payroll | Accounts Expense Ledger |
| Budget Check | Accounts Budget | Procurement PR Approval |
| Net Profit | Accounts P&L | Finance Disbursement |
| Student Enrollment (Active only) | School | Therapy Patient Selection Dropdown (Individual & Group) |
| Parent Opt-In (Outdoor Activities) | School Outdoor Activities | Parent Portal Notification |
| Group Therapy Conflict Check | Group Therapy Scheduling | Individual Therapy Schedule (per patient) |

---

*Document Version: 1.3 — Updated: Admission fee collection and student status activation rule (1.2); Dual-shift teacher assignment rule (1.3); Student-Teacher mapping dual-shift cap and substitute trigger extended to approved HR leave (1.4); Leave encashment expanded and Gratuity Management added (3.3 / 3.3A); IEP details with progress view and student advance leave request added to Parent Portal (10); Notification triggers, school reports, HR reports, and cross-module integration table updated accordingly.*
