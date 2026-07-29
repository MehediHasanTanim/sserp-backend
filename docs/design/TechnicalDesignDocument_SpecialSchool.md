# TECHNICAL DESIGN DOCUMENT
## Special School & Therapy Center Management Software

---

| Field | Value |
|---|---|
| Document Version | 1.0 |
| Status | Draft — For Review |
| Date | 26 July 2026 |
| Classification | Internal / Confidential |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Design Principles & Constraints](#3-design-principles-constraints)
4. [Technology Stack](#4-technology-stack)
5. [System Architecture](#5-system-architecture)
6. [Database Design](#6-database-design)
7. [API Design](#7-api-design)
8. [Authentication & Authorization](#8-authentication-authorization)
9. [Cross-Module Integration Design](#9-cross-module-integration-design)
10. [Real-Time & Notification Architecture](#10-real-time-notification-architecture)
11. [File & Document Management](#11-file-document-management)
12. [Security Design](#12-security-design)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Performance & Scalability](#14-performance-scalability)
15. [Error Handling & Logging](#15-error-handling-logging)
16. [Non-Functional Requirements](#16-non-functional-requirements)
17. [Development Phases & Milestones](#17-development-phases-milestones)
18. [Test Automation Strategy](#18-test-automation-strategy)

---

# 1. Introduction

## 1.1 Purpose

This Technical Design Document (TDD) defines the architecture, technology stack, data models, API structure, security design, and deployment strategy for the Special School & Therapy Center Management Software. It serves as the primary reference for engineering, architecture, and quality assurance teams throughout the development lifecycle.

## 1.2 Scope

The system covers twelve functional modules:

- **School Module** — enrollment, attendance, IEP, progress reports, fee management, outdoor activities
- **Therapy Module** — individual therapy, group therapy, scheduling, treatment plans, billing
- **HR Module** — employee lifecycle, attendance, leave, payroll, gratuity, performance
- **Accounts / Ledger Module** — chart of accounts, journal entries, AR/AP, financial statements
- **Finance Module** — shareholder management, profit disbursement
- **Inventory Module** — stock management, asset tracking, half-yearly audit
- **Procurement Module** — purchase requests, vendor management, PO, GRN
- **Report Module** — cross-module reporting and analytics
- **System Administration** — RBAC, user management, audit trail
- **Parent & Guardian Portal** — student visibility, IEP, leave requests
- **Communication & Notification Module** — alerts, messaging
- **Dashboard & Analytics** — role-based KPI dashboards

## 1.3 Intended Audience

| Audience | Purpose |
|---|---|
| Software Architects | Validate architectural decisions and patterns |
| Backend Developers | Implement APIs, services, and data models |
| Frontend Developers | Implement UI components and state management |
| Database Administrators | Implement and optimise schema and queries |
| QA Engineers | Understand system behaviour for test planning |
| Project Managers | Track scope and technical dependencies |
| DevOps Engineers | Configure infrastructure and deployment pipelines |

## 1.4 Definitions & Abbreviations

| Term | Definition |
|---|---|
| IEP | Individualized Education Program — a legally mandated plan for special needs students |
| ABA | Applied Behavior Analysis — a therapy methodology |
| OT | Occupational Therapy |
| GRN | Goods Receipt Note — confirms delivery of purchased items |
| PO | Purchase Order |
| PR | Purchase Request |
| RBAC | Role-Based Access Control |
| JWT | JSON Web Token — stateless authentication token |
| ORM | Object-Relational Mapper — abstracts database queries |
| API | Application Programming Interface |
| REST | Representational State Transfer — HTTP API style |
| SSE | Server-Sent Events — push notifications from server to browser |
| AR | Accounts Receivable |
| AP | Accounts Payable |
| TDD | Technical Design Document (this document) |
| DAST | Dynamic Application Security Testing |
| SAST | Static Application Security Testing |
| SCA | Software Composition Analysis |
| POM | Page Object Model — E2E test architecture pattern |
| VU | Virtual Users — k6 load testing concurrency unit |

---

# 2. System Overview

## 2.1 System Context

The platform is a multi-module, web-based management system used by school staff, therapists, HR officers, accountants, administrators, and parents. It consolidates operations across the school, therapy centre, and back-office into a single authenticated environment while presenting each user with a role-appropriate interface.

## 2.2 High-Level Module Map

| Module | Key Functions |
|---|---|
| 🏫 School Module | Enrollment · IEP · Attendance · Fee Management · Progress Reports · Outdoor Activities |
| 🩺 Therapy Module | Individual & Group Therapy · Scheduling · Treatment Plans · Billing & Payments |
| 👥 HR Module | Employee Lifecycle · Payroll · Leave · Gratuity · Recruitment |
| 💰 Accounts / Finance | Ledger · AR / AP · Budgets · Finance · Profit Disbursement |
| 📦 Inventory | Stock Management · Asset Tracking · Half-Yearly Audit |
| 🛒 Procurement | Purchase Requests · Vendor Management · PO · GRN |
| 📊 Reports / Analytics | Cross-module Reporting · Async Export · KPI Dashboards |
| ⚙️ SysAdmin / Portal | RBAC · User Management · Parent Portal · Notifications |

> 📌 **Note:** HR Module is the employee identity source of truth. School is the student identity source of truth. Accounts receives ledger postings from School fees, Therapy billing, HR Payroll, and Procurement.

---

# 3. Design Principles & Constraints

| Principle | Description |
|---|---|
| Modular Boundaries | Each module has clearly defined responsibilities. Cross-module data flows through service interfaces, not direct DB joins across module boundaries. |
| Single Source of Truth | Employee identity lives in HR. Student identity lives in School. Patient identity references School when applicable. No duplication. |
| Role-Gated Access | Every API endpoint enforces RBAC. Data is filtered server-side based on the authenticated user's role and assigned scope. |
| Audit Everything | All create, update, and delete operations are logged with user ID, timestamp, and before/after values. Logs are immutable. |
| Offline Resilience | Core operations (attendance marking, session notes) must function with degraded connectivity and sync when reconnected. |
| Progressive Enhancement | The UI is functional on low-bandwidth connections. Heavy assets are lazy-loaded. Calendar views render incrementally. |
| Fail Safe on Finance | Financial postings require two-step confirmation. Reversals require explicit approval. No silent overwrites. |
| Parent Portal Read-Only by Default | Parents access only their child's data. Write operations (leave request, IEP acknowledgment) are the only exceptions and are workflow-gated. |
| Timezone Awareness | All timestamps stored in UTC. Displayed in configured organisation timezone. Scheduling logic is timezone-safe. |
| Accessibility | UI meets WCAG 2.1 AA standards. Designed for use by staff who may have limited technical proficiency. |

## 3.1 Key Constraints

- Must run on a single VPS or on-premise server with no mandatory cloud dependency.
- System must support a minimum of 50 concurrent users without performance degradation.
- All sensitive data (medical records, financial data) must be encrypted at rest.
- The system must function in low-bandwidth environments (minimum 2 Mbps).
- Session timeout after configurable idle period (default: 30 minutes).
- Mobile-responsive interface is required — staff use tablets and phones.

---

# 4. Technology Stack

## 4.1 Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.x | Core UI library — component-based rendering |
| TypeScript | 5.x | Type safety across the entire frontend codebase |
| Next.js | 14.x (App Router) | SSR/SSG, routing, API proxy, image optimisation |
| Tailwind CSS | 3.x | Utility-first styling — consistent design tokens |
| shadcn/ui | Latest | Accessible, unstyled component primitives |
| TanStack Query (React Query) | 5.x | Server state management, caching, background sync |
| Zustand | 4.x | Lightweight client-side global state (UI state, auth) |
| FullCalendar.js | 6.x | Rich interactive calendar for therapy and activity scheduling |
| Recharts | 2.x | Dashboard charts and progress visualisations |
| React Hook Form + Zod | Latest | Performant forms with schema-based validation |
| Axios | 1.x | HTTP client with interceptors for auth token injection |
| date-fns | 3.x | Date manipulation, timezone handling, formatting |
| Socket.io-client | 4.x | Real-time notification reception |

## 4.2 Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS | Runtime environment |
| NestJS | 10.x | Modular, decorator-based framework — aligns with module architecture |
| TypeScript | 5.x | Type safety across services, DTOs, and entities |
| Prisma ORM | 5.x | Type-safe database client; schema-first migrations |
| Socket.io | 4.x | WebSocket server for real-time notifications |
| Bull / BullMQ | 4.x | Job queues — scheduled reports, email/SMS dispatch, background payroll processing |
| Passport.js | 0.7.x | Authentication middleware — JWT strategy |
| class-validator + class-transformer | Latest | DTO validation and serialisation |
| Multer | 1.x | File upload handling |
| node-cron | 3.x | Cron jobs — gratuity provision, auto-reminders, attendance freeze |
| Nodemailer | 6.x | Transactional email dispatch |
| winston | 3.x | Structured logging (JSON) with log levels |
| Helmet + CORS | Latest | HTTP security headers and cross-origin control |

## 4.3 Database & Storage

| Technology | Purpose |
|---|---|
| PostgreSQL 16 | Primary relational database — all transactional data |
| Redis 7 | Session store, caching of hot data (shifts, holidays, fee structures), pub/sub for real-time notifications, Bull job queues |
| MinIO (S3-compatible) | Self-hosted object storage for uploaded documents, photos, session attachments, IEP PDFs |
| pgvector (optional / future) | Semantic search on student/patient notes if AI-assisted features are added |

## 4.4 Infrastructure & DevOps

| Technology | Purpose |
|---|---|
| Ubuntu 22.04 LTS | Server operating system |
| Docker + Docker Compose | Containerisation of all services (app, Postgres, Redis, MinIO, Nginx) |
| Nginx | Reverse proxy, SSL termination (Let's Encrypt), static asset serving, rate limiting |
| GitHub Actions | CI/CD pipeline — lint, test, build, deploy on push to main |
| pg_dump + cron | Automated daily PostgreSQL backups; weekly encrypted off-site copy |
| Prometheus + Grafana | Application and infrastructure metrics monitoring |
| Sentry | Error tracking and alerting for frontend and backend |

## 4.5 Third-Party Integrations

| Integration | Purpose | Mechanism |
|---|---|---|
| SMS Gateway (e.g. SSL Wireless) | Automated SMS alerts to parents and staff | HTTP REST API |
| SMTP / SendGrid | Transactional emails (reports, invoices, notifications) | SMTP / REST API |
| Biometric Device (optional) | HR staff attendance from fingerprint scanner | TCP socket / SDK integration |
| Online Payment Gateway (optional) | Parent portal fee payments | REST API (Stripe, SSLCommerz, or equivalent) |
| PDF renderer (Puppeteer / wkhtmltopdf) | Generate printable invoices, IEP documents, payslips | Local CLI / headless Chromium |

---

# 5. System Architecture

## 5.1 Architectural Pattern — Modular Monolith

The system is built as a **Modular Monolith** — a single deployable backend application structured into strongly-bounded modules that mirror the twelve functional modules in the feature specification. Each module owns its own:

- Controllers (HTTP route handlers)
- Service layer (business logic)
- Repository layer (data access via Prisma)
- DTOs (Data Transfer Objects for input validation)
- Events (cross-module communication via internal event bus)

**Why not microservices?**

- The team size and operational budget do not justify the infrastructure overhead of microservices.
- Inter-module data requirements are tightly coupled (e.g., HR ↔ School, School ↔ Therapy).
- The architecture can be decomposed into microservices later if scale demands it, since module boundaries are already clean.

## 5.2 Three-Tier Architecture

| Tier | Technology | Responsibility |
|---|---|---|
| Presentation Tier | Next.js + React + Tailwind | UI rendering, form handling, state management, real-time updates via WebSocket, role-based navigation |
| Application Tier | NestJS (Node.js) | Business logic, workflow orchestration, authentication/authorisation, API endpoints, background jobs, event bus |
| Data Tier | PostgreSQL + Redis + MinIO | Persistent relational data, session/cache data, file/document storage |

## 5.3 Backend Module Structure (NestJS)

```
src/
├── modules/
│   ├── school/
│   │   ├── school.module.ts
│   │   ├── controllers/
│   │   │   ├── student.controller.ts
│   │   │   ├── teacher.controller.ts
│   │   │   ├── attendance.controller.ts
│   │   │   └── iep.controller.ts
│   │   ├── services/
│   │   │   ├── student.service.ts
│   │   │   └── iep.service.ts
│   │   ├── repositories/
│   │   │   └── student.repository.ts
│   │   ├── dto/
│   │   │   ├── create-student.dto.ts
│   │   │   └── update-student.dto.ts
│   │   └── events/
│   │       └── student-enrolled.event.ts
│   ├── therapy/
│   ├── hr/
│   ├── accounts/
│   ├── inventory/
│   ├── procurement/
│   ├── reports/
│   └── auth/
├── shared/
│   ├── decorators/       # @CurrentUser, @Roles, @Audit
│   ├── guards/           # JwtAuthGuard, RolesGuard
│   ├── interceptors/     # AuditInterceptor, LoggingInterceptor
│   ├── filters/          # GlobalExceptionFilter
│   ├── events/           # EventBus (NestJS EventEmitter2)
│   └── utils/            # Date helpers, PDF generator, etc.
└── main.ts
```

## 5.4 Frontend Architecture (Next.js App Router)

```
src/
├── app/                  # Next.js App Router pages
│   ├── (auth)/           # Login, reset password
│   ├── (portal)/         # Parent portal (separate layout)
│   ├── school/           # School module pages
│   ├── therapy/          # Therapy module pages
│   ├── hr/               # HR module pages
│   ├── accounts/         # Accounts module pages
│   ├── inventory/        # Inventory module pages
│   ├── procurement/      # Procurement module pages
│   ├── reports/          # Reports module pages
│   └── admin/            # System administration pages
├── components/
│   ├── ui/               # shadcn base components
│   ├── shared/           # DataTable, StatusBadge, ProfileCard
│   ├── school/           # StudentForm, IEPCard, AttendanceGrid
│   ├── therapy/          # TherapyCalendar, SessionCard, GroupEnrollmentPanel
│   └── charts/           # RevenueChart, AttendanceHeatmap
├── stores/               # Zustand stores (auth, notifications, ui)
├── hooks/                # useAuth, usePermission, useRealtime
├── lib/
│   ├── api.ts            # Axios instance with auth interceptor
│   ├── socket.ts         # Socket.io client setup
│   └── permissions.ts    # Client-side RBAC helper
└── types/                # Shared TypeScript type definitions
```

---

# 6. Database Design

## 6.1 Design Approach

- PostgreSQL 16 with Prisma ORM for type-safe schema management and migrations.
- All tables use UUID primary keys (`gen_random_uuid()`) to prevent enumeration attacks and simplify future data merges.
- Soft deletes: sensitive records (students, employees, patients) use a `deleted_at` timestamp rather than physical deletion.
- All tables include: `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `created_by UUID`, `updated_by UUID`.
- Foreign keys are enforced at the database level. `ON DELETE RESTRICT` is the default to prevent orphaned records.
- Monetary values stored as `INTEGER` (smallest currency unit, e.g. paisa) to avoid floating-point rounding errors.
- Row-Level Security (RLS) applied on sensitive tables (`student_medical_records`, `session_notes`, `payroll_slips`).

## 6.2 Core Schema — School Module

#### Table: `academic_years`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK | Primary key |
| name | VARCHAR(50) | e.g. "2024–2025" |
| start_date | DATE | Academic year start |
| end_date | DATE | Academic year end |
| is_current | BOOLEAN | Only one active at a time (partial unique index) |

#### Table: `shifts`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| name | VARCHAR(50) | "Morning" or "Day" |
| start_time | TIME | Shift start time |
| end_time | TIME | Shift end time |

#### Table: `students`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| student_code | VARCHAR(20) UNIQUE | System-generated student ID |
| full_name | VARCHAR(200) | NOT NULL |
| date_of_birth | DATE |  |
| gender | VARCHAR(20) | Male / Female / Other |
| disability_category | VARCHAR(100) | Autism, CP, DS, etc. |
| severity_level | VARCHAR(50) | Mild / Moderate / Severe |
| shift_id | UUID FK → shifts |  |
| academic_year_id | UUID FK → academic_years |  |
| status | VARCHAR(30) | pending_admission_fee \∣ active \∣ on_leave \∣ inactive \∣ graduated \∣ transferred \∣ withdrawn |
| enrollment_date | DATE |  |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### Table: `student_guardians`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| student_id | UUID FK → students | CASCADE DELETE |
| full_name | VARCHAR(200) | NOT NULL |
| relation | VARCHAR(50) | Father / Mother / Guardian |
| phone | VARCHAR(20) |  |
| email | VARCHAR(200) | Used for portal login |
| is_primary | BOOLEAN | Primary contact flag |

#### Table: `admission_fees`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| student_id | UUID FK → students | UNIQUE — one admission fee record per student |
| amount | INTEGER | In smallest currency unit |
| status | VARCHAR(20) | pending \∣ paid \∣ waived |
| invoice_date | DATE | Auto-set on enrollment |
| paid_date | DATE | Null until payment recorded |
| waiver_approved_by | UUID FK → users | Null if not waived |
| waiver_reason | TEXT |  |
| receipt_number | VARCHAR(50) | Auto-generated on payment |

#### Table: `student_teacher_mappings`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| student_id | UUID FK → students |  |
| teacher_employee_id | UUID FK → employees |  |
| shift_id | UUID FK → shifts | Which shift this mapping applies to |
| start_date | DATE |  |
| end_date | DATE | Null = currently active |
| is_active | BOOLEAN |  |

#### Table: `substitute_assignments`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| student_id | UUID FK → students |  |
| primary_teacher_id | UUID FK → employees |  |
| substitute_teacher_id | UUID FK → employees |  |
| start_date | DATE |  |
| end_date | DATE |  |
| trigger_type | VARCHAR(20) | "absence" or "leave" |
| trigger_reference_id | UUID | FK to hr_attendance or hr_leave_requests |
| assigned_by | UUID FK → users |  |

#### Table: `student_attendance`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| student_id | UUID FK → students |  |
| attendance_date | DATE |  |
| shift_id | UUID FK → shifts |  |
| status | VARCHAR(20) | present \∣ absent \∣ late \∣ half_day \∣ excused_leave \∣ medical |
| leave_request_id | UUID | FK → student_leave_requests if excused_leave |
| marked_by | UUID FK → users |  |
| marked_at | TIMESTAMPTZ |  |

#### Table: `iep_plans`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| student_id | UUID FK → students |  |
| academic_year_id | UUID FK → academic_years |  |
| version | INTEGER | Increments on each revision |
| start_date | DATE |  |
| next_review_date | DATE |  |
| status | VARCHAR(20) | draft \∣ active \∣ under_review \∣ archived |
| parent_acknowledged_at | TIMESTAMPTZ |  |
| parent_acknowledged_by | UUID FK → users |  |

#### Table: `iep_goals`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| iep_id | UUID FK → iep_plans | CASCADE DELETE |
| domain | VARCHAR(100) | Communication / Social / Cognitive / Motor / Self-care / Behavioral |
| goal_type | VARCHAR(20) | "short_term" or "long_term" |
| description | TEXT | Goal statement |
| target_date | DATE |  |
| status | VARCHAR(20) | not_started \∣ in_progress \∣ achieved \∣ discontinued |
| responsible_teacher_id | UUID FK → employees |  |

#### Table: `outdoor_activities`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| name | VARCHAR(200) |  |
| description | TEXT |  |
| activity_date | DATE |  |
| venue | VARCHAR(300) |  |
| capacity | INTEGER | Max participants |
| fee_amount | INTEGER | Per student, in smallest currency unit |
| opt_in_deadline | DATE |  |
| status | VARCHAR(20) | upcoming \∣ ongoing \∣ completed \∣ cancelled |

#### Table: `activity_enrollments`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| activity_id | UUID FK → outdoor_activities |  |
| student_id | UUID FK → students |  |
| consent_status | VARCHAR(20) | pending \∣ confirmed \∣ declined |
| consent_recorded_by | UUID FK → users |  |
| fee_status | VARCHAR(20) | pending \∣ paid \∣ waived |

#### Table: `student_leave_requests`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| student_id | UUID FK → students |  |
| requested_by | UUID FK → users | Parent portal user |
| leave_type | VARCHAR(30) | medical \∣ family \∣ travel \∣ other |
| start_date | DATE |  |
| end_date | DATE |  |
| reason | TEXT |  |
| document_url | VARCHAR(500) | Uploaded supporting doc in MinIO |
| status | VARCHAR(20) | pending \∣ approved \∣ rejected |
| reviewed_by | UUID FK → users |  |
| review_note | TEXT |  |

## 6.3 Core Schema — Therapy Module

#### Table: `therapists`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| employee_id | UUID FK → employees | UNIQUE |
| employment_type | VARCHAR(20) | "permanent" or "contractual" |
| status | VARCHAR(20) | active \∣ on_leave \∣ contract_ended \∣ resigned |

#### Table: `therapist_specializations`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| therapist_id | UUID FK → therapists | CASCADE DELETE |
| therapy_type | VARCHAR(50) | ot \∣ speech \∣ aba \∣ music \∣ dance \∣ assessment |
| supports_group | BOOLEAN | True for OT, Speech, Music, Dance |

#### Table: `patients`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| patient_code | VARCHAR(20) UNIQUE | System-generated |
| student_id | UUID FK → students | Null for external patients |
| full_name | VARCHAR(200) | Populated from student if linked |
| date_of_birth | DATE |  |
| gender | VARCHAR(20) |  |
| primary_diagnosis | VARCHAR(200) |  |
| status | VARCHAR(20) | active \∣ discharged \∣ on_hold \∣ assessment_only |
| referral_source | VARCHAR(100) |  |

#### Table: `therapy_groups`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| name | VARCHAR(200) |  |
| therapy_type | VARCHAR(50) | ot \∣ speech \∣ music \∣ dance |
| therapist_id | UUID FK → therapists |  |
| capacity_min | INTEGER |  |
| capacity_max | INTEGER |  |
| room | VARCHAR(100) |  |
| status | VARCHAR(20) | active \∣ paused \∣ closed |

#### Table: `therapy_sessions`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| session_mode | VARCHAR(20) | "individual" or "group" |
| therapy_type | VARCHAR(50) |  |
| therapist_id | UUID FK → therapists |  |
| patient_id | UUID FK → patients | Null for group sessions |
| group_id | UUID FK → therapy_groups | Null for individual sessions |
| assessment_patient_name | VARCHAR(200) | Used for assessment-type only |
| scheduled_start | TIMESTAMPTZ |  |
| scheduled_end | TIMESTAMPTZ |  |
| actual_start | TIMESTAMPTZ |  |
| actual_end | TIMESTAMPTZ |  |
| room | VARCHAR(100) |  |
| status | VARCHAR(20) | scheduled \∣ in_progress \∣ completed \∣ cancelled \∣ no_show |
| recurrence_id | UUID FK → therapy_recurrences | Null for one-off sessions |

#### Table: `group_session_attendances`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| session_id | UUID FK → therapy_sessions |  |
| patient_id | UUID FK → patients |  |
| status | VARCHAR(20) | present \∣ absent \∣ late \∣ excused |

#### Table: `therapy_recurrences`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| pattern | VARCHAR(20) | "daily" \∣ "weekly" \∣ "biweekly" \∣ "monthly" |
| days_of_week | INTEGER[] | e.g. [1,3,5] for Mon, Wed, Fri |
| recurrence_start | DATE |  |
| recurrence_end | DATE | Null = indefinite |
| max_sessions | INTEGER | Null = no limit |

#### Table: `therapy_invoices`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| patient_id | UUID FK → patients |  |
| session_id | UUID FK → therapy_sessions | Links to individual or group session |
| amount | INTEGER |  |
| invoice_date | DATE |  |
| due_date | DATE |  |
| status | VARCHAR(20) | pending \∣ paid \∣ partially_paid \∣ waived |

## 6.4 Core Schema — HR Module

#### Table: `employees`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| employee_code | VARCHAR(20) UNIQUE | System-generated |
| full_name | VARCHAR(200) |  |
| department | VARCHAR(50) | school \∣ therapy \∣ administration \∣ support |
| designation | VARCHAR(100) |  |
| employment_type | VARCHAR(20) | permanent \∣ contractual \∣ part_time |
| joining_date | DATE |  |
| confirmation_date | DATE | After probation |
| basic_salary | INTEGER | In smallest currency unit |
| status | VARCHAR(30) | active \∣ on_probation \∣ on_notice \∣ resigned \∣ terminated \∣ retired |
| deleted_at | TIMESTAMPTZ | Soft delete |

#### Table: `hr_leave_requests`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| employee_id | UUID FK → employees |  |
| leave_type_id | UUID FK → leave_types |  |
| start_date | DATE |  |
| end_date | DATE |  |
| reason | TEXT |  |
| status | VARCHAR(20) | pending \∣ approved \∣ rejected \∣ cancelled |
| approved_by | UUID FK → users |  |
| approved_at | TIMESTAMPTZ |  |

#### Table: `gratuity_provisions`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| employee_id | UUID FK → employees |  |
| provision_month | INTEGER | 1–12 |
| provision_year | INTEGER |  |
| provision_amount | INTEGER | Monthly accrual for this employee |
| cumulative_total | INTEGER | Running total to date |
| posted_to_accounts | BOOLEAN |  |

#### Table: `gratuity_payments`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| employee_id | UUID FK → employees |  |
| payment_date | DATE |  |
| years_of_service | NUMERIC(5,2) |  |
| calculated_amount | INTEGER |  |
| final_amount | INTEGER | After any adjustments |
| settlement_type | VARCHAR(20) | "exit" \∣ "partial_advance" |
| payment_voucher_number | VARCHAR(50) |  |
| status | VARCHAR(20) | pending \∣ paid |

## 6.5 Core Schema — Accounts Module

#### Table: `chart_of_accounts`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| account_code | VARCHAR(20) UNIQUE | e.g. "1001", "4002" |
| account_name | VARCHAR(200) |  |
| account_type | VARCHAR(20) | asset \∣ liability \∣ equity \∣ revenue \∣ expense |
| parent_id | UUID FK → chart_of_accounts | Self-reference for hierarchy |
| cost_center | VARCHAR(50) | school \∣ therapy \∣ admin \∣ management |
| is_active | BOOLEAN |  |

#### Table: `journal_entries`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| entry_number | VARCHAR(30) UNIQUE | Auto-generated |
| entry_date | DATE |  |
| reference_type | VARCHAR(50) | fee_payment \∣ therapy_payment \∣ payroll \∣ procurement \∣ manual |
| reference_id | UUID | FK to source record |
| description | TEXT |  |
| status | VARCHAR(20) | draft \∣ posted \∣ reversed |
| approved_by | UUID FK → users |  |

#### Table: `journal_lines`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| journal_id | UUID FK → journal_entries | CASCADE DELETE |
| account_id | UUID FK → chart_of_accounts |  |
| debit_amount | INTEGER | Zero if credit |
| credit_amount | INTEGER | Zero if debit |
| cost_center | VARCHAR(50) | Overrides account default if set |
| narration | TEXT |  |

## 6.6 Core Schema — Users & Auth

#### Table: `users`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| username | VARCHAR(100) UNIQUE |  |
| email | VARCHAR(200) UNIQUE |  |
| password_hash | VARCHAR(500) | bcrypt hash |
| employee_id | UUID FK → employees | Null for parent users |
| guardian_id | UUID FK → student_guardians | Null for staff users |
| role_id | UUID FK → roles |  |
| is_active | BOOLEAN |  |
| last_login_at | TIMESTAMPTZ |  |
| password_changed_at | TIMESTAMPTZ |  |
| failed_login_attempts | INTEGER | Lock after threshold |
| locked_until | TIMESTAMPTZ |  |

#### Table: `roles`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| name | VARCHAR(50) UNIQUE | super_admin \∣ principal \∣ coordinator \∣ teacher \∣ therapist \∣ hr_officer \∣ accountant \∣ receptionist \∣ parent |
| description | TEXT |  |

#### Table: `role_permissions`

| Column | Type | Constraints / Notes |
|---|---|---|
| role_id | UUID FK → roles | Composite PK |
| module | VARCHAR(50) | school \∣ therapy \∣ hr \∣ accounts \∣ inventory \∣ procurement \∣ reports \∣ admin |
| action | VARCHAR(30) | read \∣ create \∣ update \∣ delete \∣ approve \∣ export |

#### Table: `audit_logs`

| Column | Type | Constraints / Notes |
|---|---|---|
| id | UUID PK |  |
| user_id | UUID FK → users |  |
| action | VARCHAR(20) | "CREATE" \∣ "UPDATE" \∣ "DELETE" \∣ "LOGIN" \∣ "EXPORT" |
| module | VARCHAR(50) |  |
| entity_name | VARCHAR(100) | Table name |
| entity_id | UUID | Record that was changed |
| before_value | JSONB | Null for CREATE |
| after_value | JSONB | Null for DELETE |
| ip_address | INET |  |
| created_at | TIMESTAMPTZ | NOT NULL — immutable |

## 6.7 Key Indexes

| Table | Indexed Columns | Type / Reason |
|---|---|---|
| students | student_code, status, shift_id | B-tree — frequently filtered columns |
| student_attendance | (student_id, attendance_date) | Composite — attendance range queries |
| student_attendance | attendance_date | B-tree — date-range reports |
| iep_goals | (iep_id, status) | Composite — IEP progress views |
| therapy_sessions | (therapist_id, scheduled_start) | Composite — therapist calendar queries |
| therapy_sessions | (group_id, scheduled_start) | Composite — group calendar queries |
| therapy_sessions | (patient_id, scheduled_start) | Composite — patient calendar queries |
| hr_leave_requests | (employee_id, status) | Composite — leave approval queue |
| gratuity_provisions | (employee_id, provision_year) | Composite — monthly provision lookup |
| journal_lines | account_id, journal_id | B-tree — ledger queries |
| audit_logs | (entity_name, entity_id) | Composite — audit trail lookup |
| audit_logs | created_at | BRIN index — time-range audit queries |

---

# 7. API Design

## 7.1 Conventions

- **Base URL:** `/api/v1/`
- All requests and responses use JSON (`Content-Type: application/json`).
- **Authentication:** Bearer token (JWT) in `Authorization` header.
- HTTP methods: `GET` (read), `POST` (create), `PATCH` (partial update), `PUT` (full replace), `DELETE` (soft delete).
- **Pagination:** cursor-based for large lists (`?cursor=&limit=`). Page-based for reports (`?page=&pageSize=`).
- **Filtering:** query parameters (`?status=active&shiftId=xxx`).
- **Sorting:** `?sortBy=createdAt&order=desc`.
- **Timestamps:** ISO 8601 format (`2024-09-01T08:30:00Z`).
- **Monetary values:** integers in smallest currency unit (e.g. paisa).
- **Error format:** `{ statusCode, error, message, details? }`.

## 7.2 Standard Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 250,
    "page": 1,
    "pageSize": 20,
    "hasNext": true
  },
  "timestamp": "2024-09-01T08:30:00Z"
}
```

## 7.3 Key API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | /auth/login | Email/username + password → access token + refresh token |
| POST | /auth/refresh | Refresh token → new access token |
| POST | /auth/logout | Revoke refresh token |
| POST | /auth/change-password | Authenticated — change own password |
| POST | /auth/forgot-password | Trigger password reset email |

### School — Students

| Method | Endpoint | Description |
|---|---|---|
| GET | /school/students | List students (filterable by status, shift, year) |
| POST | /school/students | Enroll new student (generates admission fee invoice) |
| GET | /school/students/:id | Student full profile |
| PATCH | /school/students/:id | Update student details |
| DELETE | /school/students/:id | Soft delete (principal only) |
| POST | /school/students/:id/admission-fee/pay | Record admission fee payment → status → active |
| POST | /school/students/:id/admission-fee/waive | Waive admission fee (principal only) |
| GET | /school/students/:id/attendance | Student attendance history |
| GET | /school/students/:id/iep | All IEP plans for student |
| GET | /school/students/:id/progress-reports | All progress reports |
| GET | /school/students/:id/leave-requests | Student leave request history |

### School — Teacher Mapping & Attendance

| Method | Endpoint | Description |
|---|---|---|
| GET | /school/mappings | Student–teacher mappings (filterable by shift, status) |
| POST | /school/mappings | Create mapping (validates shift-student cap) |
| PATCH | /school/mappings/:id | Update or deactivate mapping |
| GET | /school/substitutes | Pending and historical substitute assignments |
| POST | /school/substitutes | Assign substitute (auto-triggered or manual) |
| POST | /school/attendance/bulk | Bulk attendance submission for a date + shift |
| GET | /school/attendance/monthly-summary | Monthly attendance report (excludes holidays + approved leaves) |

### Therapy — Sessions & Groups

| Method | Endpoint | Description |
|---|---|---|
| GET | /therapy/sessions | All sessions (filter: therapist, patient, date range, type, mode) |
| POST | /therapy/sessions | Schedule individual session |
| POST | /therapy/sessions/recurring | Create recurring individual session series |
| PATCH | /therapy/sessions/:id | Update a single session occurrence |
| PATCH | /therapy/sessions/:id/series | Update series from this session onward |
| POST | /therapy/sessions/:id/cancel | Cancel with mandatory reason |
| GET | /therapy/groups | List all therapy groups |
| POST | /therapy/groups | Create group |
| POST | /therapy/groups/:id/sessions | Schedule group session (single or recurring) |
| POST | /therapy/groups/:id/enroll | Enroll patient(s) into group (conflict check) |
| GET | /therapy/groups/:id/sessions/:sessionId/attendance | Per-patient attendance for group session |
| PATCH | /therapy/groups/:id/sessions/:sessionId/attendance | Submit per-patient attendance |

### HR Module

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | /hr/employees | List / create employees |
| GET/PATCH | /hr/employees/:id | Employee profile read / update |
| POST | /hr/attendance/bulk | Submit daily attendance batch |
| GET/POST | /hr/leave-requests | Employee leave applications |
| PATCH | /hr/leave-requests/:id/approve | Approve leave (triggers substitute check for teachers/therapists) |
| GET/POST | /hr/leave-encashments | Leave encashment requests and processing |
| GET | /hr/gratuity/employees/:id | Employee gratuity entitlement and provision history |
| POST | /hr/gratuity/employees/:id/settle | Process exit gratuity settlement |
| POST | /hr/payroll/run | Initiate monthly payroll run |
| GET | /hr/payroll/slips/:employeeId | Payslip history for employee |

### Accounts Module

| Method | Endpoint | Description |
|---|---|---|
| GET | /accounts/ledger/:accountId | General ledger for an account (date range) |
| POST | /accounts/journal-entries | Create manual journal entry |
| PATCH | /accounts/journal-entries/:id/approve | Approve and post journal entry |
| GET | /accounts/reports/pnl | Profit & Loss statement (period params) |
| GET | /accounts/reports/balance-sheet | Balance sheet as of a date |
| GET | /accounts/reports/ar-aging | Accounts receivable aging |
| GET | /accounts/budget/variance | Budget vs actual by cost center |

### Reports

| Method | Endpoint | Description |
|---|---|---|
| GET | /reports/school/attendance | Student attendance (date range, student/class-wide) |
| GET | /reports/school/fee-collection | Fee collection summary with outstanding |
| GET | /reports/school/iep-progress | IEP goal achievement rates |
| GET | /reports/therapy/sessions | Session completion report (individual + group) |
| GET | /reports/therapy/revenue | Therapy revenue by type and billing status |
| GET | /reports/hr/payroll-summary | Monthly payroll summary |
| GET | /reports/hr/gratuity | Gratuity provision and entitlement report |
| POST | /reports/export | Async export any report to PDF or Excel (job-based) |
| GET | /reports/export/:jobId | Poll export job status; returns download URL when ready |

---

# 8. Authentication & Authorization

## 8.1 Authentication Flow

The system uses a **dual-token JWT strategy**:

- **Access Token:** short-lived (15 minutes), signed with RS256 (asymmetric). Sent by client on every API request in the `Authorization: Bearer <token>` header.
- **Refresh Token:** long-lived (7 days), stored in HttpOnly Secure cookie. Used to obtain a new access token without re-login. Hash stored in Redis for instant revocation.

#### Login Flow

```
POST /auth/login
  → Validate credentials → bcrypt compare
  → Generate access token (JWT, RS256, 15min)
  → Generate refresh token (UUID, stored hash in Redis, 7 days)
  → Set refresh token as HttpOnly cookie
  → Return: { accessToken, user: { id, name, role } }
```

#### Token Refresh Flow

```
POST /auth/refresh
  → Read refresh token from HttpOnly cookie
  → Verify token hash exists in Redis
  → Issue new access token (rotates refresh token)
```

#### Account Lockout

- After **5 consecutive failed login attempts**, the account is locked for **15 minutes** (configurable).
- Failed attempt counter stored in Redis with TTL. Resets on successful login.
- Persistent lockout can be applied manually by admin for security incidents.

## 8.2 Role-Based Access Control (RBAC)

Every API controller method is decorated with `@Roles()` and guarded by `RolesGuard`. NestJS interceptor enforces permissions before the controller runs. Data filtering (e.g. a teacher only sees their own students) is applied at the **service layer**, not just the route level.

## 8.3 System Roles

| Role | Primary User | Scope |
|---|---|---|
| super_admin | IT Administrator | Full system access, user management, system config |
| principal | School Principal | All modules read/approve; final approval authority for finance, leave, PR |
| coordinator | School/Therapy Coordinator | School and therapy operations; substitute assignment; report access |
| teacher | School Teacher | Own students' attendance, IEP updates, progress reports |
| therapist | Therapist | Own sessions, patient notes, treatment plans |
| hr_officer | HR Staff | Full HR module; employee records; payroll; leave management |
| accountant | Accounts Staff | Accounts, finance, procurement (invoice matching); reports |
| receptionist | Front Desk | Student enrollment, fee collection, therapy scheduling view |
| parent | Parent / Guardian | Read-only own child data; IEP view; leave request submission |

## 8.4 RBAC Permission Matrix

> 📌 **Note:** ✓ = Full access  |  R = Read only  |  — = No access  |  A = Approve only

| Module | Super Admin | Principal | Coordinator | Teacher | Therapist | HR Officer | Accountant | Receptionist | Parent |
|---|---|---|---|---|---|---|---|---|---|
| School — Students | ✓ | R | ✓ | R | — | — | R | ✓ | R |
| Admission Fee | ✓ | A | ✓ | — | — | — | ✓ | ✓ | — |
| Teacher Mapping | ✓ | ✓ | ✓ | R | — | — | — | — | — |
| IEP Management | ✓ | R | ✓ | ✓ | — | — | — | — | R |
| Attendance (School) | ✓ | R | ✓ | ✓ | — | — | R | — | — |
| Outdoor Activities | ✓ | A | ✓ | R | — | — | ✓ | ✓ | R |
| Student Leave Req. | ✓ | A | A | R | — | — | — | — | ✓ |
| Therapy — Individual | ✓ | R | ✓ | — | ✓ | — | R | ✓ | — |
| Therapy — Groups | ✓ | R | ✓ | — | ✓ | — | R | ✓ | — |
| Treatment Plans | ✓ | R | R | — | ✓ | — | — | — | R |
| Therapy Billing | ✓ | R | — | — | R | — | ✓ | ✓ | — |
| HR — Employees | ✓ | R | — | — | — | ✓ | R | — | — |
| Leave Management | ✓ | A | — | — | — | ✓ | — | — | — |
| Payroll | ✓ | R | — | — | — | ✓ | ✓ | — | — |
| Gratuity | ✓ | R | — | — | — | ✓ | ✓ | — | — |
| Accounts / Ledger | ✓ | R | — | — | — | — | ✓ | — | — |
| Finance Module | ✓ | ✓ | — | — | — | — | ✓ | — | — |
| Inventory | ✓ | R | R | — | — | — | R | ✓ | — |
| Procurement | ✓ | A | R | — | — | — | ✓ | ✓ | — |
| Reports | ✓ | ✓ | ✓ | R | R | ✓ | ✓ | R | — |
| System Admin | ✓ | — | — | — | — | — | — | — | — |

---

# 9. Cross-Module Integration Design

## 9.1 Integration Pattern — Internal Event Bus

Cross-module communication uses **NestJS EventEmitter2** (in-process publish/subscribe). Modules emit domain events; other modules subscribe to those events without direct coupling. This ensures modules remain independently testable.

#### Example: Admission Fee Payment → Student Activation

```typescript
// school/services/admission-fee.service.ts
await this.eventEmitter.emit(
  "admission_fee.paid",
  { studentId, amount, receiptNumber }
);

// school/listeners/student-status.listener.ts
@OnEvent("admission_fee.paid")
async handleAdmissionFeePaid(event) {
  await this.studentRepo.updateStatus(event.studentId, "active");
  await this.accountsService.postLedgerEntry(event);
  await this.notificationService.notifyParent(event.studentId, "ACTIVATED");
}
```

## 9.2 Key Integration Events

| Event Name | Emitted By | Handled By | Outcome |
|---|---|---|---|
| admission_fee.paid / waived | School (Fee Service) | School (Student Status), Accounts | Student → Active; ledger posting |
| hr.attendance.absent | HR (Attendance) | School (Substitute Checker) | Flag teacher's students needing substitute |
| hr.leave.approved | HR (Leave Service) | School (Substitute Checker), Therapy (Conflict Alerter) | Flag affected students/patients |
| iep.updated | School (IEP Service) | Notification Service | Alert parent: IEP updated |
| iep.acknowledged | School (IEP Service) | Audit Logger | Record parent digital acknowledgment |
| student_leave.approved | School (Leave Service) | School (Attendance Service) | Auto-mark dates as excused_leave |
| therapy_session.cancelled | Therapy (Session Service) | Notification Service | SMS/email each affected patient guardian |
| payroll.run.completed | HR (Payroll Service) | Accounts | Post payroll expense journal entry |
| gratuity.provision.monthly | CRON job (monthly) | HR (Gratuity), Accounts | Compute provision, post accrual entry |
| procurement.po.approved | Procurement | Accounts | Create AP entry for PO amount |
| inventory.grn.received | Procurement (GRN) | Inventory (Stock Service) | Increase stock levels for received items |
| inventory.stock.low | Inventory (Stock Service) | Procurement (Alert), Notification | Alert procurement officer; optionally auto-raise PR |
| fee.payment.received | School / Therapy | Accounts (AR Service) | Reduce AR balance; post receipt entry |

## 9.3 Financial Posting Architecture

All money movements across the system flow through a centralised `AccountsService`. Source services (School fees, Therapy billing, HR Payroll, Procurement) call this service with a `PostingRequest`:

```typescript
interface PostingRequest {
  referenceType: "fee_payment" | "therapy_payment" | "payroll" | "gratuity"
             | "procurement_invoice" | "activity_fee" | "encashment";
  referenceId:   string;   // UUID of source record
  amount:        number;   // in smallest currency unit
  costCenter:    "school" | "therapy" | "admin" | "management";
  description:   string;
  debitAccount:  string;   // account_code
  creditAccount: string;   // account_code
  date:          Date;
}
```

---

# 10. Real-Time & Notification Architecture

## 10.1 WebSocket (Socket.io)

- Each authenticated user joins a private room keyed by their user ID on connection.
- Role-based broadcast rooms (e.g. `"role:coordinator"`) for system-wide alerts.
- Server pushes events to the relevant room; client subscribes and updates UI state via TanStack Query's cache invalidation.
- Socket connections are authenticated: the client sends the access JWT during the handshake; the server verifies before admitting the connection.

## 10.2 Notification Delivery Pipeline

```
Event fired (e.g. "student_leave.approved")
  → NotificationService picks up event
  → Determines recipients (parent of student)
  → Saves notification record to DB (notifications table)
  → Emits Socket.io event to user's room (in-app bell)
  → Enqueues email job in Bull queue
  → Enqueues SMS job in Bull queue
  → Bull workers process jobs asynchronously
```

## 10.3 Notification Types & Channels

| Notification Event | In-App | Email | SMS |
|---|---|---|---|
| Admission fee cleared → student activated | ✓ | ✓ | ✓ |
| Student absent (same-day) | ✓ | — | ✓ |
| Student advance leave approved / rejected | ✓ | ✓ | ✓ |
| IEP updated / review published | ✓ | ✓ | — |
| Fee overdue reminder | ✓ | ✓ | ✓ |
| Therapy session cancelled | ✓ | ✓ | ✓ |
| Teacher absent — no substitute assigned | ✓ | ✓ | — |
| HR leave approved / rejected | ✓ | ✓ | — |
| Payroll processed | ✓ | ✓ | — |
| Low stock alert | ✓ | ✓ | — |
| Purchase request status update | ✓ | ✓ | — |
| Therapist licence expiring in 30 days | ✓ | ✓ | — |
| Employee contract expiring in 30 days | ✓ | ✓ | — |
| Gratuity eligibility threshold crossed | ✓ | ✓ | — |
| Outdoor activity opt-in reminder | ✓ | ✓ | ✓ |

---

# 11. File & Document Management

## 11.1 Storage Backend — MinIO

- MinIO provides an S3-compatible API hosted on the same server (or a dedicated storage node).
- The application backend acts as a proxy — clients never receive direct MinIO credentials.
- Presigned URLs (time-limited, 15 minutes) are issued by the backend for download and upload operations.

## 11.2 Bucket Structure

| Bucket | Contents | Retention |
|---|---|---|
| student-documents | Birth certificates, disability certificates, medical reports | Permanent |
| iep-documents | Generated IEP PDFs per student per version | Permanent |
| progress-reports | Generated monthly and quarterly report PDFs | 5 years |
| therapy-attachments | Session photos, worksheets, observation files | 5 years |
| hr-documents | Employee contracts, certificates, NID scans | Permanent |
| invoices-receipts | Fee invoices, payment receipts (school + therapy) | 7 years (financial) |
| activity-media | Outdoor activity post-event photos | 3 years |
| leave-documents | Parent-uploaded supporting docs for student leave requests | 3 years |
| exports | Async report exports (Excel, PDF) — auto-deleted after 24 hours | 24 hours |

## 11.3 Upload Flow

```
1. Client requests presigned upload URL: POST /uploads/presign
   → Server validates permission, generates presigned PUT URL (15 min TTL)
   → Returns: { uploadUrl, objectKey }
2. Client uploads file directly to MinIO using the presigned URL
3. Client confirms upload: POST /uploads/confirm { objectKey, entityType, entityId }
4. Server validates object exists in MinIO, saves metadata to DB
```

## 11.4 PDF Generation

- IEP documents, invoices, payslips, and progress reports are generated server-side using **Puppeteer** (headless Chromium).
- HTML templates rendered with **Handlebars.js**; Puppeteer converts to PDF.
- Generated PDFs stored in the appropriate MinIO bucket; presigned download URL returned.
- Report exports exceeding 5 seconds are processed as background **Bull jobs** to avoid request timeouts.

---

# 12. Security Design

## 12.1 Application Security

| Control | Implementation |
|---|---|
| Password hashing | bcrypt with cost factor 12 |
| SQL injection | Prisma ORM with parameterised queries — no raw string interpolation |
| XSS | React's default HTML escaping; Helmet CSP headers; DOMPurify for any user-generated HTML rendering |
| CSRF | SameSite=Strict cookie attribute on refresh token; double-submit cookie pattern for state-changing requests |
| Input validation | class-validator on all DTOs (backend); Zod schemas on all forms (frontend) |
| Rate limiting | Nginx rate limiting at reverse proxy level; NestJS ThrottlerModule on auth endpoints (5 req/min) |
| HTTP security headers | Helmet.js: X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, CSP |
| HTTPS | Let's Encrypt TLS certificate; HTTP → HTTPS redirect enforced at Nginx |
| Session timeout | Access token TTL 15 min; idle timeout configurable (default 30 min) enforced client-side |
| Account lockout | 5 failed login attempts → 15 min lockout; stored in Redis |

## 12.2 Data Security

| Control | Implementation |
|---|---|
| Encryption at rest | PostgreSQL on LUKS-encrypted volume; MinIO bucket encryption (AES-256) |
| Sensitive field encryption | Medical diagnosis, financial data fields encrypted at application layer using AES-256-GCM before DB storage |
| Row-Level Security | PostgreSQL RLS policies on student_medical_records, session_notes, payroll_slips to limit access to authorised roles only |
| Data isolation | Parent portal users issued tokens with constrained claim (student_id scope); queries always filtered server-side |
| Audit trail | AuditInterceptor captures all CUD operations; logs stored in audit_logs table with immutable flag; no user can delete audit records via API |
| Backup encryption | pg_dump output encrypted with GPG before off-site transfer |

## 12.3 Infrastructure Security

- **Firewall:** only ports 80 and 443 are open to the internet. PostgreSQL, Redis, and MinIO ports are accessible only within the Docker network.
- **SSH:** password authentication disabled; key-based SSH only; fail2ban configured.
- Docker containers run as non-root users.
- Secrets (DB passwords, JWT private key, SMS gateway key) stored in `.env` files outside the code repository; loaded as environment variables at runtime.
- **Dependency scanning:** `npm audit` run in CI pipeline; Dependabot alerts enabled on GitHub repository.

---

# 13. Deployment Architecture

## 13.1 Server Configuration (Minimum Production)

| Resource | Specification |
|---|---|
| CPU | 4 vCPU (8 recommended) |
| RAM | 8 GB (16 GB recommended) |
| Storage | 100 GB SSD for OS + database; 500 GB for MinIO file storage (expandable) |
| OS | Ubuntu 22.04 LTS |
| Network | Static IP; SSL certificate via Let's Encrypt |

## 13.2 Docker Compose Services

| Service | Image | Port (Internal) | Description |
|---|---|---|---|
| nginx | nginx:alpine | 80, 443 → external | Reverse proxy, SSL, static files |
| app | custom (NestJS build) | 3000 → internal | Backend API + Socket.io |
| web | custom (Next.js build) | 3001 → internal | Frontend (SSR via Next.js) |
| postgres | postgres:16-alpine | 5432 → internal | Primary database |
| redis | redis:7-alpine | 6379 → internal | Cache, sessions, queues |
| minio | minio/minio | 9000, 9001 → internal | Object storage (S3-compatible) |
| worker | custom (NestJS build) | N/A | Bull queue workers (email, SMS, reports) |

## 13.3 Nginx Routing

```nginx
server {
  server_name  app.schoolname.com;
  location /api/   { proxy_pass http://app:3000; }
  location /socket.io/ { proxy_pass http://app:3000; upgrade websocket; }
  location /        { proxy_pass http://web:3001; }
}
```

## 13.4 CI/CD Pipeline (GitHub Actions)

| Stage | Trigger | Actions |
|---|---|---|
| Lint & Type Check | Push to any branch | ESLint, TypeScript compiler check |
| Unit Tests | Push to any branch | Jest unit tests (backend services, utils) |
| Integration Tests | Pull Request to main | Jest e2e tests against a test PostgreSQL container |
| Build | Merge to main | Docker image build and push to container registry |
| Deploy | Merge to main (after build) | SSH to production server; docker-compose pull + up --no-downtime |
| Database Migrate | After deploy | npx prisma migrate deploy (runs new migrations) |

## 13.5 Backup Strategy

| Backup Type | Frequency | Retention | Storage |
|---|---|---|---|
| PostgreSQL full dump (pg_dump) | Daily at 02:00 | 30 days local; 90 days off-site | Local + encrypted off-site (e.g. Backblaze B2) |
| PostgreSQL WAL archiving | Continuous | 7 days | Local (enables point-in-time recovery) |
| MinIO bucket sync | Daily at 03:00 | 60 days | Off-site encrypted copy |
| Redis snapshot (RDB) | Every 6 hours | 7 days | Local only (recoverable from DB) |
| Application config & secrets | On change | Version-controlled (encrypted) | GPG-encrypted git repository |

---

# 14. Performance & Scalability

## 14.1 Caching Strategy

| Cached Data | Cache Key Pattern | TTL | Invalidation Trigger |
|---|---|---|---|
| Shift definitions | shifts:all | 24 hours | Shift updated by admin |
| Holiday calendar | holidays:{year} | 24 hours | Holiday record created / deleted |
| Fee structures | fee_structures:{yearId} | 6 hours | Fee structure updated |
| User permissions | permissions:user:{userId} | 15 min | Role or permission changed |
| Student list (paginated) | students:page:{n}:{filters} | 5 min | Student created / updated |
| Therapist availability | therapist:avail:{id}:{date} | 5 min | Session created / cancelled |
| Dashboard KPIs | dashboard:{role}:{date} | 10 min | Any relevant data changes |
| Report exports (async) | export:job:{jobId} | max 24h | File downloaded or TTL expires |

## 14.2 Database Query Optimisation

- All list queries use server-side pagination (no `SELECT *` without `LIMIT`).
- Attendance reports use pre-aggregated `monthly_attendance_summary` materialised view, refreshed nightly by a cron job.
- Therapy session calendar queries use covering indexes on `(therapist_id, scheduled_start)` and `(group_id, scheduled_start)`.
- N+1 query prevention: Prisma `include` used for eager loading; service layer limits include depth.
- Heavy report queries (e.g. annual P&L, gratuity liability) run asynchronously via Bull queues to prevent API timeouts.

## 14.3 Scalability Path

- **Short term:** Vertical scale (increase VPS RAM/CPU). Application is stateless (JWT + Redis sessions).
- **Medium term:** Separate PostgreSQL onto a dedicated server with a read replica for report queries.
- **Long term:** Extract the Reports and Worker modules into separate services communicating via Redis Streams or RabbitMQ. Module boundaries already exist in the codebase.

---

# 15. Error Handling & Logging

## 15.1 Global Exception Filter

NestJS `GlobalExceptionFilter` catches all unhandled exceptions and returns a consistent error envelope:

```json
{
  "success": false,
  "statusCode": 422,
  "error": "VALIDATION_ERROR",
  "message": "Admission fee must be paid before activating student.",
  "details": [ { "field": "status", "issue": "prerequisite_not_met" } ],
  "timestamp": "2024-09-01T08:30:00Z",
  "requestId": "req_7f3c9a"
}
```

**HTTP status codes used:**

- `200 OK` — successful read
- `201 Created` — successful create
- `204 No Content` — successful delete
- `400 Bad Request` — malformed input
- `401 Unauthorized` — missing or invalid JWT
- `403 Forbidden` — valid JWT but insufficient permissions
- `404 Not Found` — resource does not exist
- `409 Conflict` — business rule violation (e.g. double-booking, duplicate mapping)
- `422 Unprocessable Entity` — semantic validation failure (e.g. fee not paid)
- `429 Too Many Requests` — rate limit exceeded
- `500 Internal Server Error` — unhandled exceptions (logged, generic message returned)

## 15.2 Logging

| Log Level | When Used | Destination |
|---|---|---|
| ERROR | Unhandled exceptions, database errors, external service failures | Winston → file + Sentry |
| WARN | Business rule violations, deprecation notices, slow queries (>500ms) | Winston → file |
| INFO | Request/response (method, path, status, duration), job completion, event bus events | Winston → file |
| DEBUG | Query parameters, service inputs/outputs (disabled in production) | Winston → console only |

- All logs are structured JSON for easy ingestion into log management tools.
- Request IDs (UUID, injected by middleware) are attached to all log lines for request tracing.
- Sensitive data (passwords, tokens, medical fields) are never logged — a custom serialiser strips these fields.
- Sentry captures ERROR-level events with full stack traces, user context, and request metadata.

---

# 16. Non-Functional Requirements

| Category | Requirement | Target |
|---|---|---|
| Performance | API response time (p95) | < 300 ms for data reads; < 600 ms for writes |
| Performance | Calendar rendering (therapy schedule) | < 1 second for month view with up to 200 sessions |
| Performance | Report generation (synchronous) | < 3 seconds for standard reports; async for heavy reports |
| Availability | System uptime | 99.5% (allows ~43 hours downtime/year) |
| Availability | Planned maintenance window | Sunday 01:00–03:00 local time |
| Scalability | Concurrent users | Minimum 50; target 150 without degradation |
| Scalability | Student records | Support up to 500 active students without schema changes |
| Reliability | Data loss tolerance (RPO) | < 6 hours (WAL archiving + daily backup) |
| Reliability | Recovery time (RTO) | < 4 hours for full restore from backup |
| Security | Penetration testing | Annual third-party penetration test |
| Security | Access token expiry | 15 minutes; refresh token 7 days |
| Usability | Mobile responsiveness | Full functionality on screens ≥ 360px width |
| Usability | Accessibility | WCAG 2.1 Level AA compliance |
| Usability | Browser support | Chrome 110+, Firefox 110+, Safari 16+, Edge 110+ |
| Maintainability | Code coverage (unit tests) | Minimum 70% on service layer |
| Maintainability | API documentation | OpenAPI / Swagger auto-generated from NestJS decorators |
| Compliance | Data retention | Student and financial records retained minimum 7 years |
| Compliance | Audit trail | 100% of CUD operations logged; logs retained 5 years |

---

# 17. Development Phases & Milestones

| Phase | Modules / Deliverables | Duration |
|---|---|---|
| Phase 0 — Foundation | Project scaffold (NestJS + Next.js + PostgreSQL + Docker); Authentication (JWT + RBAC); User & role management; Audit logging framework; CI/CD pipeline | 3 weeks |
| Phase 1 — HR & School Core | HR Module (employees, attendance, leave, holidays); School Module (enrollment, admission fee, shifts, teacher mapping, substitute workflow, attendance) | 6 weeks |
| Phase 2 — School Advanced | IEP management; Progress reports; Fee management; Outdoor activities; Parent Portal (login, student view, IEP view, leave request) | 5 weeks |
| Phase 3 — Therapy Module | Individual therapy (patients, scheduling, sessions, treatment plans, billing); Group therapy (groups, enrollment, scheduling, per-patient billing) | 6 weeks |
| Phase 4 — Accounts & Finance | Chart of accounts; Journal entries; AR/AP; Financial statements; Budget management; Finance (profit disbursement) | 5 weeks |
| Phase 5 — HR Advanced + Payroll | Payroll processing; Gratuity management; Leave encashment; Performance management; Recruitment | 4 weeks |
| Phase 6 — Inventory & Procurement | Item/asset management; Stock tracking; Inventory audit; Vendor management; Purchase request/PO/GRN workflow | 4 weeks |
| Phase 7 — Reports & Dashboard | All cross-module reports; Async export (PDF/Excel); Role-based dashboards; KPI charts | 4 weeks |
| Phase 8 — Notifications & Polish | Real-time notifications (WebSocket + SMS + email); Notification centre; UI polish; Accessibility audit; Performance tuning | 3 weeks |
| Phase 9 — UAT & Go-Live | User acceptance testing; Staff training; Data migration (if applicable); Production deployment; Hyper-care support | 3 weeks |

> 📌 **Note:** Total estimated duration: approximately 43 weeks. Phases may overlap where dependencies allow parallel development tracks.

---

# 18. Test Automation Strategy

## 18.1 Philosophy — Zero Manual QA

The project adopts a **fully automated testing strategy**. No feature is shipped to production without automated test coverage. Manual exploratory testing may be performed optionally by stakeholders during UAT, but no manual QA step exists in the release pipeline — every quality gate is code-enforced.

**Core principles:**

- **Shift left:** tests are written by developers alongside feature code, not after.
- **Test at the right layer:** business logic is unit-tested; API contracts are integration-tested; user journeys are E2E-tested. No duplication across layers.
- **Tests are deterministic:** flaky tests are treated as bugs and fixed immediately. Non-deterministic tests block CI.
- **Tests run in parallel:** all test suites are parallelised to keep the CI feedback loop under 15 minutes end-to-end.
- **Coverage is a floor, not a ceiling:** coverage thresholds are enforced in CI. Falling below threshold blocks merge.
- **Test data is code:** all test data is created programmatically via factories and seed scripts. No shared or manually seeded test databases.

## 18.2 Testing Pyramid

| Layer | Tool(s) | Scope | Target Count | Run On |
|---|---|---|---|---|
| Unit Tests | Jest + @nestjs/testing (backend); Jest + React Testing Library (frontend) | Individual functions, services, components in isolation — all external dependencies mocked | ~1,200 tests | Every push to any branch |
| Integration Tests | Jest + Supertest + Testcontainers | Full HTTP request → service → real PostgreSQL/Redis → response cycle | ~400 tests | Every pull request |
| End-to-End Tests | Playwright (multi-browser) | Full user journeys across all 12 modules in a real browser against a deployed environment | ~250 scenarios | Pre-merge to main + nightly |
| Performance Tests | k6 | Load, stress, and spike tests on critical API endpoints and calendar rendering | ~40 scripts | Weekly + pre-release |
| Security Tests | OWASP ZAP + Snyk + npm audit + ESLint security plugin | Automated vulnerability scanning, dependency auditing, SAST | Continuous | Daily + every PR |
| Accessibility Tests | axe-core via Playwright + jest-axe | WCAG 2.1 AA rule violations on every rendered page and component | ~150 checks | Every PR |
| Visual Regression Tests | Playwright screenshot comparison | Pixel-diff snapshots of critical UI pages to catch unintended visual changes | ~80 snapshots | Every PR |
| Mutation Tests | Stryker Mutator | Validates that unit tests actually catch defects by introducing deliberate code mutations | Full service layer | Weekly |

## 18.3 Complete Test Tool Stack

| Tool | Version | Layer | Purpose |
|---|---|---|---|
| Jest | 29.x | Unit + Integration | Test runner, assertion library, coverage (Istanbul), mocking |
| @nestjs/testing | 10.x | Unit + Integration | NestJS testing module — creates isolated app contexts with dependency injection |
| Supertest | 6.x | Integration | HTTP assertion library for API endpoint integration tests |
| Testcontainers (Node) | 1.x | Integration | Spins up real Docker containers (PostgreSQL, Redis) per test suite — fully isolated |
| React Testing Library | 14.x | Unit (Frontend) | Tests React components by simulating real user interactions, not implementation details |
| @testing-library/user-event | 14.x | Unit (Frontend) | Simulates realistic browser events (typing, clicking, tabbing) in component tests |
| jest-axe | 8.x | Accessibility (Unit) | axe-core accessibility rule assertions in component-level Jest tests |
| Playwright | 1.44.x | E2E + Visual + A11y | Cross-browser E2E automation (Chromium, Firefox, WebKit); screenshot comparison; axe integration |
| @axe-core/playwright | 4.x | Accessibility (E2E) | Full-page WCAG 2.1 AA checks injected into Playwright E2E runs |
| k6 | 0.50.x | Performance | Load testing with JavaScript scenarios; outputs metrics to Grafana; CI-friendly |
| OWASP ZAP | 2.15.x | Security | Automated DAST — active and passive scanning against running test environment |
| Snyk | CLI latest | Security | Dependency vulnerability scanning for npm packages and Docker images |
| Stryker Mutator | 8.x | Mutation | Introduces mutations into source code; verifies test suite detects them |
| jest-mock-extended | 3.x | Unit | Type-safe TypeScript mock generation for NestJS service dependencies |
| fishery | 2.x | Test Data | Factory library for generating typed test fixtures |
| Faker.js | 8.x | Test Data | Generates realistic fake data (names, dates, amounts) used by factories |
| Codecov | Cloud / Self-hosted | Reporting | Coverage report aggregation, PR diff-coverage, historical trend |
| Playwright HTML Reporter | Built-in | Reporting | Rich HTML test report with screenshots, traces, and video on failure |
| k6 Cloud / Grafana | Cloud / Self-hosted | Reporting | Performance test result dashboards and trend analysis |

## 18.4 Unit Testing — Backend (NestJS Services)

### 18.4.1 Test File Convention

- Test files live alongside source files: `student.service.spec.ts` next to `student.service.ts`.
- Each service has a dedicated spec file. Controller specs are minimal (routing-level only) — business logic lives in services.
- Test naming: `describe('StudentService') > describe('activateOnAdmissionFeePaid') > it('should set status to active...')`

### 18.4.2 Example — Admission Fee Payment → Student Activation

```typescript
describe('StudentService', () => {
  describe('recordAdmissionFeePayment', () => {

    it('should activate student after full fee payment', async () => {
      const student = studentFactory.build({ status: 'pending_admission_fee' });
      mockStudentRepo.findById.mockResolvedValue(student);
      mockAdmissionFeeRepo.findByStudentId.mockResolvedValue(
        admissionFeeFactory.build({ studentId: student.id, amount: 5000, status: 'pending' })
      );

      await service.recordAdmissionFeePayment(student.id, { amount: 5000, method: 'cash' });

      expect(mockStudentRepo.updateStatus).toHaveBeenCalledWith(student.id, 'active');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'admission_fee.paid',
        expect.objectContaining({ studentId: student.id })
      );
      expect(mockAccountsService.postLedgerEntry).toHaveBeenCalledOnce();
    });

    it('should reject if student status is already active', async () => {
      const student = studentFactory.build({ status: 'active' });
      mockStudentRepo.findById.mockResolvedValue(student);
      await expect(
        service.recordAdmissionFeePayment(student.id, { amount: 5000, method: 'cash' })
      ).rejects.toThrow(ConflictException);
    });

    it('should reject partial payment if amount does not match fee', async () => {
      const fee = admissionFeeFactory.build({ amount: 5000, status: 'pending' });
      mockAdmissionFeeRepo.findByStudentId.mockResolvedValue(fee);
      await expect(
        service.recordAdmissionFeePayment('id', { amount: 3000, method: 'cash' })
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
```

### 18.4.3 Example — Shift Cap Validation

```typescript
it('should block mapping if teacher already has a student in the same shift', async () => {
  const existingMapping = mappingFactory.build({ shiftId: 'morning-shift-id', isActive: true });
  mockMappingRepo.findActiveByTeacher.mockResolvedValue([existingMapping]);
  await expect(
    service.createMapping({ teacherEmployeeId: 't1', studentId: 'new-id', shiftId: 'morning-shift-id' })
  ).rejects.toThrow(ConflictException);
  // 'Teacher already has a student assigned in the Morning shift'
});

it('should allow dual-shift mapping if teacher has one student per shift', async () => {
  const mornMapping = mappingFactory.build({ shiftId: 'morning-id', isActive: true });
  mockMappingRepo.findActiveByTeacher.mockResolvedValue([mornMapping]);
  await expect(
    service.createMapping({ shiftId: 'day-id', studentId: 'new-id' })
  ).resolves.not.toThrow();
});
```

### 18.4.4 Key Unit Test Suites — Backend

| Service | Key Scenarios Tested |
|---|---|
| StudentService | Enrollment, admission fee payment/waiver, status transitions, shift assignment, soft delete |
| TeacherMappingService | Shift cap enforcement, dual-shift rule, substitute assignment (absence + leave triggers), revert on return |
| IEPService | IEP create/version, goal CRUD, progress update, parent acknowledgment, review scheduling |
| AttendanceService (School) | Bulk marking, holiday exclusion, excused leave auto-marking on approved leave request, correction workflow |
| OutdoorActivityService | Opt-in/out, capacity enforcement, waitlist management, fee invoice generation, cancellation notify |
| TherapySessionService | Individual/group scheduling, recurrence generation, conflict detection (patient, therapist, room), cancel with reason |
| GroupTherapyService | Group CRUD, patient enrollment conflict check, per-patient attendance, per-patient invoice generation |
| TreatmentPlanService | Plan create, goal CRUD, progress per session, version control |
| HRLeaveService | Leave application, approval, balance deduction, trigger school substitute checker, trigger therapy conflict alert |
| GratuityService | Monthly provision calculation, eligibility check, exit settlement computation, proration, ledger posting |
| PayrollService | Salary structure, deductions, net calculation, payslip generation, locked run immutability |
| LeaveEncashmentService | Eligible days calculation, amount computation, payroll integration, balance deduction |
| ProcurementService | PR creation, principal approval, PO generation, GRN stock update, 3-way matching |
| AccountsService | Journal entry creation, DR=CR validation, posting, reversal, budget check before posting |
| NotificationService | Correct recipients per event, correct channels (in-app/SMS/email), delivery record creation |

## 18.5 Unit Testing — Frontend (React Components)

### 18.5.1 Example — Admission Fee Status Badge

```typescript
// StudentStatusBadge.test.tsx
it('shows Pending Admission Fee badge in amber for new student', () => {
  render(<StudentStatusBadge status='pending_admission_fee' />);
  expect(screen.getByText('Pending Admission Fee')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveClass('badge-amber');
});

it('shows Active badge in green after fee cleared', () => {
  render(<StudentStatusBadge status='active' />);
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveClass('badge-green');
});
```

### 18.5.2 Example — Therapy Calendar Conflict Warning

```typescript
it('shows conflict warning when overlapping slot is selected', async () => {
  server.use(
    http.get('/api/v1/therapy/sessions/conflicts', () =>
      HttpResponse.json({ hasConflict: true, conflictingSession: mockSession })
    )
  );
  render(<TherapyScheduleForm therapistId='t1' />);
  await userEvent.selectOptions(screen.getByLabelText('Therapy Type'), 'speech');
  await userEvent.type(screen.getByLabelText('Date'), '2024-09-10');
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This therapist has a conflicting session at this time'
    );
  });
  expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled();
});
```

### 18.5.3 Accessibility Unit Tests (jest-axe)

```typescript
it('has no WCAG 2.1 AA accessibility violations', async () => {
  const { container } = render(<IEPGoalCard goal={mockGoal} />);
  const results = await axe(container, { rules: { 'color-contrast': { enabled: true } } });
  expect(results).toHaveNoViolations();
});
```

### 18.5.4 Key Frontend Component Test Suites

| Component | Key Scenarios Tested |
|---|---|
| StudentEnrollmentForm | Field validation, admission fee amount display, submission, error states |
| StudentStatusBadge | All status variants render correct label and colour |
| TeacherMappingPanel | Shift cap warning shown, substitute assignment UI, dual-shift display |
| IEPGoalCard | Progress status colours, edit mode, parent view (read-only) vs coordinator view |
| AttendanceGrid | All status options selectable, holiday dates disabled/greyed, bulk select |
| TherapyCalendar (FullCalendar) | Events rendered per therapist/patient filter, drag triggers reschedule modal, conflict alert shown |
| GroupTherapyEnrollPanel | Patient search/select, capacity counter, conflict warning per patient, waitlist message |
| ActivityOptInCard | Parent opt-in/decline, deadline countdown, fee amount display, waitlist state |
| PayslipViewer | All salary components rendered, gross/net calculation, download button present |
| StudentLeaveRequestForm | Date validation (start before end), file upload, submission, approval status display |
| NotificationBell | Unread count badge, mark-as-read, notification type icons, empty state |
| GratuityDashboard | Service years display, entitlement amount, provision chart, settlement button |

## 18.6 Integration Testing — API Layer

Integration tests exercise the full HTTP request pipeline: NestJS controller → service → repository → real PostgreSQL + Redis (via Testcontainers). Each test suite spins up isolated containers, runs Prisma migrations, seeds minimum required data, and tears down after the suite.

### 18.6.1 Setup Pattern

```typescript
let app: INestApplication;
let pg: StartedPostgreSqlContainer;

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = pg.getConnectionUri();
  await execSync('npx prisma migrate deploy');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  applyGlobalPipes(app);
  await app.init();
});

afterEach(async () => {
  await prisma.$executeRaw`TRUNCATE TABLE students CASCADE`;
});

afterAll(async () => {
  await app.close();
  await pg.stop();
});
```

### 18.6.2 Example — Student Enrollment → Fee Invoice → Activation

```typescript
it('POST /school/students → fee invoice created → status pending_admission_fee', async () => {
  const { body } = await request(app.getHttpServer())
    .post('/api/v1/school/students')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send(studentFactory.buildCreateDto())
    .expect(201);
  expect(body.data.status).toBe('pending_admission_fee');
  const feeRecord = await prisma.admissionFees.findUnique({ where: { studentId: body.data.id } });
  expect(feeRecord.status).toBe('pending');
});

it('POST admission-fee/pay → status becomes active and ledger posted', async () => {
  const { studentId } = await seedStudentWithPendingFee();
  await request(app.getHttpServer())
    .post(`/api/v1/school/students/${studentId}/admission-fee/pay`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ amount: 5000, method: 'cash' })
    .expect(200);
  const student = await prisma.students.findUnique({ where: { id: studentId } });
  expect(student.status).toBe('active');
  const journal = await prisma.journalEntries.findFirst(
    { where: { referenceId: studentId, referenceType: 'fee_payment' } }
  );
  expect(journal).not.toBeNull();
});
```

### 18.6.3 Integration Test Coverage Targets by Module

| Module | Endpoints Under Test | Key Integration Assertions |
|---|---|---|
| School | All 22 student/teacher/attendance/IEP/fee/activity endpoints | DB state after each operation; cross-table consistency; event emission verified via DB side-effects |
| Therapy | All 28 session/group/treatment/invoice endpoints | Conflict detection with real schedule data; per-patient invoice rows; recurrence series DB state |
| HR | All 20 employee/attendance/leave/payroll/gratuity endpoints | Leave balance deduction; substitute trigger fires; payroll journal posting |
| Accounts | All 12 ledger/journal/report endpoints | DR=CR balance on every journal; account balance aggregation; AR aging buckets |
| Inventory & Procurement | All 18 PR/PO/GRN/stock endpoints | Stock level change after GRN; AP entry after invoice; budget overage rejection |
| Auth | Login, refresh, logout, lockout | Token validity; lockout after 5 failures; refresh token revocation in Redis |
| Notifications | All event-driven endpoints | Notification records created in DB for correct recipients; correct channel flags set |

## 18.7 End-to-End Testing — Playwright

Playwright runs full browser automation against a dedicated staging environment. Tests run in Chromium, Firefox, and WebKit in parallel using the **Page Object Model** pattern.

### 18.7.1 Auth Fixtures (Reusable Authenticated Contexts)

```typescript
// fixtures/auth.fixtures.ts
export const test = base.extend<{ coordinator: Page; teacher: Page; parent: Page }>({
  coordinator: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: 'auth/coordinator.json' });
    await use(await ctx.newPage());
    await ctx.close();
  },
  // ...teacher, parent fixtures
});
```

### 18.7.2 E2E Test Scenarios — School Module

| ID | Role | Scenario | Critical? | Expected Outcome |
|---|---|---|---|---|
| SCH-E2E-01 | Coordinator | Enroll new student → verify status is 'Pending Admission Fee' → verify teacher mapping blocked | Yes | Status badge shows amber; mapping form shows blocking message |
| SCH-E2E-02 | Coordinator | Record admission fee payment → verify status transitions to 'Active' → verify teacher mapping now available | Yes | Status badge green; mapping form accessible |
| SCH-E2E-03 | Principal | Waive admission fee with reason → verify student activated → verify waiver record in fee history | Yes | Status active; waiver reason visible in fee panel |
| SCH-E2E-04 | Coordinator | Assign teacher to Morning shift student → attempt to assign same teacher to second Morning student → verify rejection | Yes | Conflict error displayed; second assignment not saved |
| SCH-E2E-05 | Coordinator | Assign teacher to Morning AND Day shift students → verify dual mapping saved | Yes | Both mappings active; teacher profile shows 2 students across 2 shifts |
| SCH-E2E-06 | Coordinator | Mark teacher absent in HR module → navigate to School → verify substitute assignment prompt appears | Yes | Alert banner shown with teacher name and affected students |
| SCH-E2E-07 | Coordinator | Approve teacher leave in HR → verify substitute trigger fires → verify revert on leave end date | Yes | Substitute shown for leave period; primary mapping restored after |
| SCH-E2E-08 | Teacher | Mark bulk attendance for students on non-holiday date → verify counts correct | Yes | Attendance grid saves; summary shows correct present/absent count |
| SCH-E2E-09 | Coordinator | Verify holiday date is greyed out in attendance grid and excluded from monthly percentage | Yes | Date not selectable; percentage calculation excludes holiday |
| SCH-E2E-10 | Teacher | Create IEP → add goals across 3 domains → update one goal progress to In Progress | Yes | IEP saved; goal shows In Progress status |
| SCH-E2E-11 | Parent | Log into parent portal → view child's IEP → verify goal progress visible → digitally acknowledge IEP | Yes | Goals and status visible; acknowledge button saves timestamp |
| SCH-E2E-12 | Parent | Submit advance leave request for 3 days → verify coordinator receives alert | Yes | Request saved as pending; notification in coordinator bell |
| SCH-E2E-13 | Coordinator | Approve student leave request → verify approved dates auto-marked as Excused Leave | Yes | Dates show Excused Leave status; excluded from absence count |
| SCH-E2E-14 | Coordinator | Create outdoor activity → parent opts in from portal → record fee payment | Yes | Student on participant list; fee invoice generated; payment recorded |
| SCH-E2E-15 | Coordinator | Generate monthly progress report → approve → verify parent notification sent and report visible on portal | Yes | Report downloadable on portal; notification in parent bell |

### 18.7.3 E2E Test Scenarios — Therapy Module

| ID | Role | Scenario | Critical? | Expected Outcome |
|---|---|---|---|---|
| THR-E2E-01 | Coordinator | Enroll external patient (not a student) → verify patient created with no student link | Yes | Patient profile shows 'External' indicator; student_id null |
| THR-E2E-02 | Coordinator | Schedule individual Speech session → attempt duplicate slot for same therapist → verify conflict rejected | Yes | Conflict modal appears; session not saved |
| THR-E2E-03 | Coordinator | Create weekly recurring OT session for 8 weeks → cancel week 4 only → verify weeks 1–3 and 5–8 intact | Yes | Week 4 shows Cancelled; all other occurrences remain Scheduled |
| THR-E2E-04 | Therapist | Complete session → enter session notes → update goal progress → verify notes visible from patient profile | Yes | Notes saved with timestamp; goal shows updated progress status |
| THR-E2E-05 | Coordinator | Create Music Therapy group → enroll 4 patients → schedule weekly sessions → verify calendar shows group event | Yes | Group event on calendar in distinct colour; patient count shown |
| THR-E2E-06 | Therapist | Complete group session → mark per-patient attendance (2 present, 1 absent, 1 late) → verify individual records saved | Yes | Attendance saved per patient; absent patient's invoice still generated |
| THR-E2E-07 | Accountant | View group therapy invoices → verify each enrolled patient has individual invoice → record payment for 2 patients independently | Yes | 4 separate invoice records; 2 marked paid; 2 still pending |
| THR-E2E-08 | Coordinator | Enroll patient already in group → attempt to schedule individual session at same time → verify patient-level conflict detected | Yes | Conflict warning shows group session name; individual session blocked |
| THR-E2E-09 | Coordinator | Schedule Assessment → verify patient name is free-text (not dropdown) → save → verify appears in calendar | Yes | Free-text name field shown; session saved with manual name |
| THR-E2E-10 | Coordinator | Cancel group session → verify individual notifications sent to all enrolled patient guardians | Yes | Notification records created for each patient guardian |
| THR-E2E-11 | Parent | View therapy schedule from parent portal → verify both individual and group sessions visible | Yes | Both session types visible; group sessions show group name |

### 18.7.4 E2E Test Scenarios — HR Module

| ID | Role | Scenario | Critical? | Expected Outcome |
|---|---|---|---|---|
| HR-E2E-01 | HR Officer | Onboard new employee → link to school teacher → verify teacher profile auto-populated from HR data | Yes | Teacher profile shows HR-sourced name, contact, designation |
| HR-E2E-02 | HR Officer | Approve sick leave for teacher → navigate to school → verify substitute assignment alert fires | Yes | Alert appears for teacher's affected students |
| HR-E2E-03 | HR Officer | Process monthly payroll run → verify payslips generated → verify payroll journal entry posted to accounts | Yes | Payslip count matches active employees; journal entry in ledger |
| HR-E2E-04 | HR Officer | Employee crosses gratuity eligibility threshold → verify provision appears in monthly report | Yes | Provision record created; cumulative total increments correctly |
| HR-E2E-05 | HR Officer | Process employee exit → calculate exit gratuity → verify correct years of service and amount → mark as paid | Yes | Settlement amount matches policy formula; payment voucher generated |
| HR-E2E-06 | HR Officer | Submit leave encashment request → approve → verify payroll deducts leave balance and adds payment | Yes | Balance reduced; encashment amount in payroll for that month |
| HR-E2E-07 | Principal | Reject leave request with reason → verify employee notified → verify leave balance not deducted | Yes | Notification shows rejection reason; balance unchanged |

### 18.7.5 E2E Test Scenarios — Accounts, Finance & Procurement

| ID | Role | Scenario | Critical? | Expected Outcome |
|---|---|---|---|---|
| ACC-E2E-01 | Accountant | Post manual journal entry → verify DR=CR validation blocks unbalanced entry → submit balanced entry → verify ledger updated | Yes | Unbalanced entry rejected; balanced entry posted |
| ACC-E2E-02 | Accountant | View AR aging report → verify fee payments from school and therapy both appear → check 60-day bucket | Yes | Both sources present; aging buckets computed correctly |
| ACC-E2E-03 | Accountant | Set department budget → simulate expense posting that exceeds budget → verify over-budget alert fires | Yes | Alert shown; posting requires override confirmation from principal |
| ACC-E2E-04 | Accountant | Generate annual P&L → disburse profit to 2 shareholders → verify individual payment vouchers | Yes | Each shareholder has separate disbursement voucher; total matches net profit |
| PRO-E2E-01 | Staff Member | Raise purchase request → principal approves → verify PO generated → submit GRN → verify stock updated | Yes | Full PR→PO→GRN chain; stock level increments on GRN |
| PRO-E2E-02 | Staff Member | Raise PR that exceeds budget allocation → verify budget warning shown → principal rejects → verify no PO created | Yes | Rejection reason saved; inventory unchanged |
| INV-E2E-01 | Coordinator | Trigger half-yearly inventory audit → enter physical counts → submit → verify discrepancy report generated | Yes | Discrepancy table shows surplus/shortage; audit signed-off by principal |

## 18.8 Performance Testing — k6

### 18.8.1 Performance Thresholds (Pass / Fail Gates)

| Metric | Threshold | Applied To |
|---|---|---|
| HTTP request duration p95 | < 300 ms | All data-read endpoints |
| HTTP request duration p95 | < 600 ms | All write/create endpoints |
| HTTP request duration p95 | < 3,000 ms | Synchronous report generation |
| HTTP error rate | < 0.5% | All endpoints |
| Therapy calendar rendering (month view) | < 1,000 ms | GET /therapy/sessions with 200 events in range |
| Concurrent users (sustained, 10 min) | 50 users, no degradation | Full system load test |
| Concurrent users (stress, 5 min) | 150 users, p95 < 800 ms | Stress test |
| Spike test (0 → 100 users in 30s) | Error rate < 2% | Traffic spike simulation |

### 18.8.2 Example — Calendar Load Test Script

```javascript
// k6/scripts/therapy-calendar.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 20 },  // ramp up
    { duration: '5m', target: 50 },  // sustained load
    { duration: '1m', target: 0  },  // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed:   ['rate<0.005'],
  },
};

export default function () {
  const token = getAuthToken('therapist');
  const res = http.get(
    `/api/v1/therapy/sessions?view=month&date=2024-09-01&therapistId=${__ENV.THERAPIST_ID}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  check(res, {
    'status 200':        r => r.status === 200,
    'response under 1s': r => r.timings.duration < 1000,
    'returns sessions':  r => JSON.parse(r.body).data.length > 0,
  });
  sleep(1);
}
```

### 18.8.3 Key Performance Test Scripts

| Script | Endpoint(s) | Simulated Load |
|---|---|---|
| student-list-load | GET /school/students (paginated) | 50 VU × 10 min |
| therapy-calendar-load | GET /therapy/sessions (month view) | 50 VU × 10 min |
| attendance-bulk-submit | POST /school/attendance/bulk | 30 VU × 5 min |
| group-session-schedule | POST /therapy/groups/:id/sessions (recurring) | 20 VU × 5 min |
| payroll-run-stress | POST /hr/payroll/run (100 employees) | 10 VU × 3 min |
| report-export-async | POST /reports/export + GET /reports/export/:id | 15 VU × 5 min |
| login-spike | POST /auth/login | 0→100 VU in 30 s |
| dashboard-kpi-load | GET /reports/* (dashboard queries) | 50 VU × 10 min |

## 18.9 Security Test Automation

| Tool | Type | What It Checks | Run Frequency |
|---|---|---|---|
| OWASP ZAP (Active Scan) | DAST | SQL injection, XSS, CSRF, path traversal, insecure headers, authentication bypass, exposed endpoints — against the running staging app | Nightly full scan; passive scan on every deployment |
| OWASP ZAP (Passive Scan) | DAST | Response headers (HSTS, CSP, X-Frame-Options), cookie flags (HttpOnly, Secure, SameSite), sensitive data in responses | Every E2E test run |
| Snyk (npm) | SCA | Known CVEs in all npm dependencies (frontend + backend); critical/high severity blocks CI merge | Every PR + daily |
| Snyk (Docker) | Container SCA | CVEs in Docker base images (node:20-alpine, postgres:16-alpine, redis:7-alpine, nginx:alpine) | Weekly + on image rebuild |
| npm audit | SCA | Lightweight dependency audit as a fast first gate; fails CI on high/critical severity | Every push |
| ESLint security plugin | SAST | Static analysis for insecure patterns: eval(), hardcoded secrets, insecure regex (ReDoS), prototype pollution | Every push (part of lint step) |
| Semgrep (optional) | SAST | Custom rules: direct SQL string construction, missing @Roles() decorator on controllers, unencrypted storage of sensitive fields | Every PR |
| Trivy | Container & IaC | Docker image vulnerabilities + misconfiguration scanning in docker-compose.yml and Nginx config | Every PR |

### 18.9.1 ZAP CI Integration

```yaml
# .github/workflows/security.yml
security-scan:
  runs-on: ubuntu-latest
  steps:
    - name: Start staging app
      run: docker-compose -f docker-compose.test.yml up -d

    - name: OWASP ZAP Baseline Scan
      uses: zaproxy/action-baseline@v0.11.0
      with:
        target: 'http://localhost:3000'
        rules_file_name: '.zap/rules.tsv'
        fail_action: true
        cmd_options: '-a'

    - name: Upload ZAP Report
      uses: actions/upload-artifact@v4
      with:
        name: zap-report
        path: report_html.html
```

## 18.10 Visual Regression Testing — Playwright Screenshots

Visual regression tests capture pixel-level screenshots of critical UI pages and compare them against baseline snapshots. Any visual diff that exceeds **0.2%** of pixels fails the test and blocks merge.

### 18.10.1 Pages Under Visual Regression Guard

| Page | Viewports Tested | Notes |
|---|---|---|
| Student profile page | Desktop (1440px), Tablet (768px), Mobile (375px) | Tests both Active and Pending Admission Fee states |
| Therapy calendar — month view | Desktop, Tablet | Snapshot taken with 10 seeded sessions in view |
| Group therapy enrollment panel | Desktop | Both empty state and populated (4 patients) states |
| IEP plan page (coordinator view) | Desktop | All 3 goal progress states (not started, in progress, achieved) |
| IEP plan page (parent view) | Desktop, Mobile | Read-only state with acknowledge button |
| Payslip viewer | Desktop | All salary components populated |
| Dashboard — principal role | Desktop | All KPI cards populated with seeded data |
| Login page | Desktop, Mobile | Default state and validation error state |
| Parent portal home | Mobile, Tablet | Student summary card, fee badge, therapy schedule link |
| Attendance grid | Desktop | Full month, mixed statuses, holiday dates greyed |

### 18.10.2 Example

```typescript
test('Therapy calendar month view matches baseline', async ({ page }) => {
  await page.goto('/therapy/schedule?view=month&date=2024-09-01');
  await page.waitForSelector('.fc-event');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('therapy-calendar-month.png', {
    maxDiffPixelRatio: 0.002,
    animations: 'disabled',
    mask: [page.locator('.current-time-indicator')],
  });
});
```

## 18.11 Test Data Management

### 18.11.1 Factory Pattern (fishery + Faker.js)

```typescript
// factories/student.factory.ts
import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';

export const studentFactory = Factory.define<Student>(({ sequence }) => ({
  id:                  faker.string.uuid(),
  studentCode:         `STU-${String(sequence).padStart(4, '0')}`,
  fullName:            faker.person.fullName(),
  dateOfBirth:         faker.date.birthdate({ min: 3, max: 18, mode: 'age' }).toISOString().split('T')[0],
  gender:              faker.helpers.arrayElement(['Male', 'Female']),
  disabilityCategory:  faker.helpers.arrayElement(['Autism', 'Down Syndrome', 'Cerebral Palsy']),
  shiftId:             'morning-shift-id',
  status:              'pending_admission_fee',
  enrollmentDate:      new Date().toISOString().split('T')[0],
}));

export const activeStudent = studentFactory.params({ status: 'active' });
```

### 18.11.2 Database Seeding for E2E Tests

- A dedicated seed script (`scripts/e2e-seed.ts`) populates the E2E staging database with a consistent baseline dataset before each test run.
- Seed data includes: 2 academic years, 2 shifts, 1 of each system role, 10 active students, 5 teachers (various shift assignments), 8 therapy patients, 4 therapists (various specialisations), 3 therapy groups, 2 complete IEPs with goals, and fee structures.
- Each E2E test that creates data appends a unique prefix (test run ID) to names to avoid collision with baseline data and other parallel workers.
- After each E2E suite, a teardown script deletes all records tagged with the test run ID via the API (uses DELETE endpoints, validating cleanup logic too).

### 18.11.3 Sensitive Data Policy in Tests

- No real patient names, diagnoses, or employee data in any test fixture or seed script.
- All personal data generated by Faker.js is clearly fictional.
- Test environments never receive production data copies.
- Test database credentials are separate from production; scoped to the test environment only.

## 18.12 Mutation Testing — Stryker

Mutation testing validates the quality of unit tests by deliberately introducing bugs (mutations) into source code and verifying that the test suite detects them.

- **Tool:** Stryker Mutator for JavaScript/TypeScript.
- **Scope:** All NestJS service files (business logic layer). Controllers and repositories excluded (covered by integration tests).
- **Mutation score target:** ≥ 75%. A score below 75% blocks the weekly CI mutation run from passing.
- **Mutation operators:** ArithmeticOperator, BooleanLiteral, ConditionalExpression, EqualityOperator, LogicalOperator, StringLiteral, MethodExpression.

```javascript
// stryker.config.mjs
export default {
  packageManager:   'npm',
  reporters:        ['html', 'clear-text', 'progress', 'dashboard'],
  testRunner:       'jest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/modules/**/services/*.service.ts',
    'src/shared/utils/**/*.ts',
  ],
  thresholds: { high: 80, low: 75, break: 70 },
  jest: { projectType: 'custom', configFile: 'jest.config.ts' },
  htmlReporter: { fileName: 'reports/mutation/index.html' },
};
```

## 18.13 CI/CD Pipeline — Test Gates

Every quality gate is enforced in GitHub Actions. A failed gate blocks the pipeline — code cannot advance to the next stage or reach production.

| Stage | Trigger | Tests Run | Gate — Blocks If… |
|---|---|---|---|
| 1 | Every push to any branch | Lint (ESLint + TypeScript), ESLint security plugin, npm audit, Trivy container scan | Any lint error, type error, high/critical CVE, or container misconfiguration |
| 2 | Every push to any branch | Backend unit tests (Jest), Frontend unit tests (Jest + RTL), jest-axe accessibility checks | Coverage below threshold (service layer < 80%, overall < 70%); any test fails |
| 3 | Every pull request | API integration tests (Jest + Supertest + Testcontainers) | Any integration test fails; coverage diff drops below 70% |
| 4 | Every pull request | OWASP ZAP passive scan, Snyk dependency scan | Any new high/critical vulnerability introduced |
| 5 | Merge to main | Full E2E suite — Playwright (Chromium, Firefox, WebKit) | Any E2E test fails across any browser |
| 6 | Merge to main | Visual regression comparison against stored baselines | Any page diff exceeds 0.2% pixel ratio without baseline update approval |
| 7 | Merge to main | Playwright + axe-core full-page accessibility scan | Any WCAG 2.1 AA violation on any tested page |
| 8 | Merge to main (after all gates) | Production deployment (docker-compose pull + up) | N/A — this stage only runs if all above pass |
| 9 | Weekly (Sunday 00:00) | k6 load tests, stress tests, spike tests | Any threshold exceeded; results published to Grafana dashboard |
| 10 | Weekly (Sunday 01:00) | Stryker mutation testing on service layer | Mutation score drops below 75%; report published to test dashboard |
| 11 | Nightly (02:00) | OWASP ZAP active scan on staging | New medium/high severity findings; report emailed to tech lead |

> 📌 **Note:** The pipeline is designed so that the average developer feedback loop (stages 1–2) completes in under 4 minutes. The full PR gate (stages 1–4) completes in under 12 minutes. E2E tests (stage 5–7) run post-merge and take approximately 18 minutes with parallel workers.

## 18.14 Coverage Requirements & Quality Gates

| Layer | Metric | Minimum Threshold | Enforced In |
|---|---|---|---|
| Backend — Service Layer | Line + Branch coverage | 80% | CI Stage 2 (unit tests) |
| Backend — Overall | Line coverage | 70% | CI Stage 2 (unit tests) |
| Frontend — Components | Line + Branch coverage | 70% | CI Stage 2 (unit tests) |
| API Endpoints | Endpoint coverage (all routes hit) | 100% | CI Stage 3 (integration tests) |
| E2E — Critical Path Scenarios | All 'Yes' critical-path scenarios passing | 100% | CI Stage 5 (E2E) |
| E2E — Non-critical Scenarios | Pass rate | ≥ 95% | CI Stage 5 (E2E) |
| WCAG 2.1 AA Rules | Zero violations on tested pages | 100% | CI Stage 7 (accessibility) |
| Visual Regression | No unexplained visual diffs | 100% | CI Stage 6 (visual) |
| Mutation Score (services) | Stryker mutation score | ≥ 75% | Weekly (Stage 10) |
| Security — CVE Severity | No high/critical unpatched CVEs in dependencies | 100% | CI Stages 1 + 4 |

## 18.15 Test Reporting & Dashboards

| Report Type | Tool | Audience | Access |
|---|---|---|---|
| Code coverage trends | Codecov | Developers, Tech Lead | Codecov PR comment + dashboard |
| Unit + integration test results | Jest HTML Reporter | Developers | CI artifact per run |
| E2E test results (with traces + video on failure) | Playwright HTML Reporter | Developers, QA | CI artifact per run; auto-linked in PR comment |
| Performance test results | k6 + Grafana | Tech Lead, Developers | Grafana dashboard; historical trend |
| Security scan results | ZAP HTML + Snyk Report | Tech Lead, Principal | CI artifact + email on failure |
| Accessibility violations | axe-core JSON + Playwright HTML | Developers, UI Designer | CI artifact; fails PR if violations found |
| Visual diff report | Playwright diff viewer | Developers | CI artifact; side-by-side diff images |
| Mutation testing report | Stryker HTML Dashboard | Developers, Tech Lead | CI artifact; uploaded to Stryker Dashboard cloud |
| Weekly test health summary | Custom GitHub Actions summary | All stakeholders | GitHub Actions summary page; email digest |

> 📌 **Note:** All CI artifacts are retained for 30 days. Failed run artifacts (E2E traces, videos, ZAP reports) are retained for 90 days to aid debugging.

---


---

*Document Version: 1.0  |  Status: Draft — For Review  |  Classification: Internal / Confidential*

*© Special School & Therapy Center — All rights reserved*