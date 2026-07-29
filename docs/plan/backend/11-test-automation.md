# Backend Test Automation — Standards, Tooling & CI Gates

| Field | Value |
|---|---|
| Scope | Cross-phase. Set up in Phase 0, extended by every subsequent phase. |
| Source of truth | [TechnicalDesignDocument_SpecialSchool.md](../../design/TechnicalDesignDocument_SpecialSchool.md) section 18 |
| Companion | [frontend/11-test-automation.md](../frontend/11-test-automation.md) |

---

## 1. Philosophy — zero manual QA

There is no manual QA step in the release pipeline. Every quality gate is code-enforced, and a failed gate blocks the pipeline. Manual exploratory testing happens only during UAT and is never a release gate.

The five principles from TDD 18.1, restated as working rules:

| Principle | What it means in practice |
|---|---|
| Shift left | The pull request that adds a service method contains that method's tests. A PR with new business logic and no new tests is rejected in review, not at CI. |
| Test at the right layer | Business rules → unit tests. HTTP contract, transactions, and DB state → integration tests. Cross-module user journeys → E2E. A rule tested at one layer is not re-tested at another purely for coverage. |
| Deterministic | A flaky test is a bug with the same severity as a production defect. It is fixed or deleted within one working day — never retried into passing. `jest.retryTimes` is banned. |
| Parallel | Unit tests shard across CPUs. Integration suites get their own containers. Total CI feedback stays under 15 minutes. |
| Test data is code | Everything comes from factories and seed scripts. No shared mutable test database, no fixture SQL dumps, no "run this by hand first" steps. |

Coverage is a floor. Hitting 80% is not evidence of good tests — the mutation score is.

---

## 2. Testing pyramid — backend allocation

Derived from TDD 18.2, with the backend's share broken out per phase.

| Layer | Tools | Backend target | Runs on |
|---|---|---|---|
| Unit | Jest, `@nestjs/testing`, `jest-mock-extended` | ~750 tests | Every push |
| Integration | Jest, Supertest, Testcontainers | ~400 tests | Every PR |
| Performance | k6 | ~25 scripts | Weekly + pre-release |
| Security | ZAP, Snyk, npm audit, ESLint security, Semgrep, Trivy, gitleaks | Continuous | Every push / PR / nightly |
| Mutation | Stryker | Full service layer | Weekly |

The remaining ~450 unit tests, ~250 E2E scenarios, ~150 accessibility checks, and ~80 visual snapshots from the TDD's totals belong to the frontend repository.

### Per-phase distribution

| Phase | Unit | Integration | k6 scripts |
|---|---|---|---|
| 0 Foundation | ~90 | ~45 | 1 |
| 1 HR & School Core | ~150 | ~80 | 2 |
| 2 School Advanced & Portal | ~120 | ~70 | 1 |
| 3 Therapy | ~160 | ~75 | 2 |
| 4 Accounts & Finance | ~110 | ~50 | 2 |
| 5 Payroll & Gratuity | ~90 | ~40 | 1 |
| 6 Inventory & Procurement | ~90 | ~45 | 2 |
| 7 Reports & Dashboards | ~80 | ~45 | 3 |
| 8 Notifications | ~60 | ~35 | 2 |
| 9 Hardening | — | ~30 (security/reliability) | 9 (NFR verification) |

---

## 3. Tool stack

Exactly the versions from TDD 18.3, backend subset.

| Tool | Version | Purpose |
|---|---|---|
| Jest | 29.x | Runner, assertions, coverage (Istanbul), mocking |
| `@nestjs/testing` | 10.x | Isolated app contexts with DI |
| Supertest | 6.x | HTTP assertions against the Nest app |
| Testcontainers (Node) | 1.x | Real Postgres 16, Redis 7, MinIO per suite |
| `jest-mock-extended` | 3.x | Type-safe mocks for injected dependencies |
| fishery | 2.x | Typed test-data factories |
| Faker.js | 8.x | Realistic fake data |
| k6 | 0.50.x | Load, stress, spike |
| OWASP ZAP | 2.15.x | DAST, passive and active |
| Snyk | CLI latest | Dependency and container CVEs |
| npm audit | bundled | Fast first-gate dependency check |
| `eslint-plugin-security` | latest | SAST for insecure patterns |
| Semgrep | latest | Custom architectural and security rules |
| Trivy | latest | Image and IaC misconfiguration scanning |
| gitleaks | latest | Secret scanning over history |
| Stryker Mutator | 8.x | Mutation testing |
| Codecov | cloud/self-hosted | Coverage aggregation and PR diff coverage |
| `jest-html-reporter` | latest | Human-readable CI artifact |

---

## 4. Unit testing

### 4.1 Conventions

- Spec files sit next to their source: `student.service.spec.ts` beside `student.service.ts`.
- One spec per service. Controller specs are minimal and cover routing, guards, and DTO validation only — business logic is never asserted through a controller.
- Naming follows TDD 18.4.1: `describe('<ServiceName>') > describe('<methodName>') > it('should <expected behaviour> when <condition>')`.
- Every external dependency is mocked. A unit test never touches Postgres, Redis, MinIO, the clock, or the network.
- Time is injected. `OrgClockService` is mocked so date-dependent logic is deterministic. `Date.now()` is banned in `src/` by a lint rule.

### 4.2 Standard harness

```typescript
// student.service.spec.ts
describe('StudentService', () => {
  let service: StudentService;
  let studentRepo: MockProxy<StudentRepository>;
  let feeRepo: MockProxy<AdmissionFeeRepository>;
  let ledger: MockProxy<LedgerPort>;
  let events: MockProxy<TransactionalEventPublisher>;

  beforeEach(async () => {
    studentRepo = mock<StudentRepository>();
    feeRepo = mock<AdmissionFeeRepository>();
    ledger = mock<LedgerPort>();
    events = mock<TransactionalEventPublisher>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: StudentRepository, useValue: studentRepo },
        { provide: AdmissionFeeRepository, useValue: feeRepo },
        { provide: LedgerPort, useValue: ledger },
        { provide: TransactionalEventPublisher, useValue: events },
      ],
    }).compile();

    service = moduleRef.get(StudentService);
  });
});
```

### 4.3 What a negative-path test must assert

Not just that it throws — that it throws the right thing:

```typescript
it('rejects a partial admission fee payment', async () => {
  feeRepo.findByStudentId.mockResolvedValue(
    admissionFeeFactory.build({ amount: 500_000, status: 'pending' })
  );

  await expect(
    service.recordAdmissionFeePayment('student-id', { amount: 300_000, method: 'cash' })
  ).rejects.toMatchObject({
    status: 422,
    errorCode: ErrorCode.PARTIAL_PAYMENT_NOT_ALLOWED,
  });

  expect(ledger.post).not.toHaveBeenCalled();
  expect(events.publish).not.toHaveBeenCalled();
});
```

The two trailing assertions matter as much as the rejection: they prove the failure path has no side effects. Every negative-path test in this project asserts that no ledger posting and no event escaped.

### 4.4 Key service suites

Transcribed from TDD 18.4.4 and extended with the services this plan introduces.

| Service | Phase | Key scenarios |
|---|---|---|
| `TokenService`, `AuthService`, `LockoutService`, `PasswordService` | 0 | Claims, rotation, reuse detection, lockout at 5, policy enforcement |
| `NumberingService` | 0 | Prefix, padding, reset period, concurrency |
| `StudentService`, `StudentStatusService` | 1 | Enrollment, transitions, override reason, soft delete, re-enrollment |
| `AdmissionFeeService` | 1 | Payment activates, partial rejected, waiver authority, receipt generation |
| `TeacherMappingService` | 1 | Shift cap, dual-shift rule, shift mismatch, fee gate, concurrency |
| `SubstituteService` | 1 | Absence and leave triggers, idempotency, multi-student substitute, auto-revert |
| `SchoolAttendanceService`, `WorkingDaysService` | 1 | Holiday exclusion, freeze, percentage maths, authority |
| `LeaveRequestService`, `LeaveBalanceService` | 1 | Overlap, balance holds, multi-level approval, cancellation restore |
| `IEPService`, `IEPGoalService` | 2 | Single active plan, versioning, publish completeness, acknowledgment idempotency |
| `ProgressReportService` | 2 | Workflow transitions, self-approval ban, template resolution |
| `FeeInvoiceService`, `FeePaymentService` | 2 | Amount computation table, partial payments, overpayment, reversal, waiver |
| `ActivityEnrollmentService` | 2 | Opt-in, capacity, waitlist positions, promotion, attendance isolation |
| `StudentLeaveService` | 2 | Overlap, backdating, excused-leave marking |
| `PortalScopeService` | 2 | Scope resolution, cross-child denial, draft filtering |
| `ConflictDetectionService` | 3 | Nine conflict checks, interval boundaries, cross-modality |
| `RecurrenceService` | 3 | Pattern expansion, end conditions, series edits, DST |
| `GroupMembershipService`, `GroupSessionService` | 3 | Groupable types, capacity, per-patient conflict, promotion |
| `TherapyBillingService` | 3 | Fee resolution, one invoice per patient, absent billed, discount independence |
| `AccountsService` | 4 | DR=CR, account validity, period lock, idempotency, rule resolution |
| `JournalService` | 4 | Approval workflow, self-approval ban, immutability, reversal |
| `BudgetCheckService` | 4 | Boundaries, modes, override, revision selection |
| `ReceivableService` | 4 | Aging boundaries, settlement order, write-off |
| `TaxService`, `StatementService` | 4 | Inclusive decomposition, statement balancing |
| `ProfitAppropriationService`, `DisbursementService` | 4 | Percentage invariant, allocation limits, rounding residual |
| `PayrollCalculationService` | 5 | Component types, proration, LOP, tax slabs, rounding |
| `PayrollRunService` | 5 | Duplicate runs, recalculation, lock immutability, journal balance |
| `GratuityCalculationService` | 5 | Service years, eligibility, formula, proration methods |
| `GratuityProvisionService`, `GratuitySettlementService` | 5 | Delta provisioning, idempotency, ledger balance, forfeiture, deductions |
| `EncashmentService` | 5 | Eligible days formula, approval levels, balance deduction |
| `StockMovementService`, `StockValuationService` | 6 | Negative stock, FIFO splitting, weighted average drift, transfer neutrality |
| `DepreciationService` | 6 | Both methods, salvage floor, idempotency |
| `InventoryAuditService` | 6 | Snapshot freezing, classification, sign-off gating, reconciliation |
| `PrApprovalService`, `PurchaseOrderService`, `GrnService` | 6 | Workflow order, budget block, over-receipt, accepted-only stock |
| `ThreeWayMatchService` | 6 | Match matrix, tolerance, over-invoicing block |
| `ReportExecutorService`, `ReportScopeService`, `SafeQueryBuilder` | 7 | Permission gating, row scope, injection resistance |
| `NotificationService`, `ChannelRouterService`, `RecipientResolverService` | 8 | Channel selection, preferences, quiet hours, dedup, recipient correctness |
| `TemplateRendererService` | 8 | Strict variables, sanitisation, SMS length |
| `ApprovalChainService` | 8 | Snapshotting, conditional steps, escalation |

### 4.5 Coverage thresholds

Enforced in `jest.config.ts` and failing the build when breached:

```typescript
coverageThreshold: {
  global:                          { lines: 70, branches: 65 },
  'src/modules/**/services/**':    { lines: 80, branches: 80 },
  'src/shared/**':                 { lines: 80, branches: 80 },
}
```

---

## 5. Integration testing

### 5.1 Container harness

The pattern from TDD 18.6.1, hardened for reuse:

```typescript
// shared/testing/container.harness.ts
export async function startTestApp(): Promise<TestContext> {
  const network = await new Network().start();

  const pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withNetwork(network)
    .withDatabase('sserp_test')
    .start();

  const redis = await new GenericContainer('redis:7-alpine')
    .withNetwork(network)
    .withExposedPorts(6379)
    .start();

  const minio = await new GenericContainer('minio/minio')
    .withNetwork(network)
    .withCommand(['server', '/data'])
    .withExposedPorts(9000)
    .start();

  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  // ... MinIO env

  execSync('npx prisma migrate deploy', { env: process.env });
  await seedReferenceData();
  await createMinioBuckets();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailProvider).useClass(InMemoryEmailProvider)
    .overrideProvider(SmsProvider).useClass(InMemorySmsProvider)
    .overrideProvider(OrgClockService).useClass(ControllableClock)
    .compile();

  const app = moduleRef.createNestApplication();
  applyGlobalPipes(app);
  await app.init();

  return { app, prisma, containers: { pg, redis, minio, network }, clock, email, sms };
}
```

Three deliberate substitutions:

- **Email and SMS** use in-memory providers so tests can assert on delivered content without network calls.
- **The clock** is controllable so scheduled jobs, expiry logic, and DST cases are testable without waiting.
- **Everything else is real.** Postgres constraints, Redis behaviour, and MinIO semantics are the things integration tests exist to verify — mocking them would defeat the purpose.

### 5.2 Isolation between tests

The TDD's `TRUNCATE TABLE students CASCADE` in `afterEach` is replaced with a safer generic version, because a per-table truncate breaks the moment a new table is added:

```typescript
afterEach(async () => {
  await truncateAllExceptReference(prisma);
  await redis.flushdb();
  clock.reset();
  email.clear();
  sms.clear();
});
```

`truncateAllExceptReference` reads the table list from `information_schema`, excludes the reference tables (`roles`, `role_permissions`, `chart_of_accounts`, `posting_rules`, `notification_types`, `organization_settings`, `numbering_schemes`, `skill_domains`, `leave_types`), and truncates the rest with `RESTART IDENTITY CASCADE` in a single statement.

Container startup is expensive, so containers are shared per Jest **worker** via `globalSetup`, while data isolation is per test. This keeps the suite fast without cross-test contamination.

### 5.3 What integration tests must assert

Every integration test asserts at least two of the following, not just the HTTP status:

1. The response body shape and key values.
2. The resulting database state, read directly through Prisma — not through the API.
3. Cross-table consistency (e.g. the invoice and its ledger posting both exist and balance).
4. Side effects: notification rows, queued jobs, emitted events observed through their DB effects.
5. The absence of side effects on failure paths.

```typescript
it('POST admission-fee/pay activates the student and posts to the ledger', async () => {
  const { studentId } = await seedStudentWithPendingFee();

  await request(app.getHttpServer())
    .post(`/api/v1/school/students/${studentId}/admission-fee/pay`)
    .set('Authorization', `Bearer ${tokens.coordinator}`)
    .send({ amount: 500_000, method: 'cash' })
    .expect(200);

  const student = await prisma.students.findUnique({ where: { id: studentId } });
  expect(student.status).toBe('active');

  const posting = await prisma.pendingLedgerPostings.findFirst({
    where: { referenceId: studentId, referenceType: 'fee_payment' },
  });
  expect(posting).not.toBeNull();

  const history = await prisma.studentStatusHistory.findMany({ where: { studentId } });
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ fromStatus: 'pending_admission_fee', toStatus: 'active' });

  const notifications = await prisma.notifications.findMany({ where: { entityId: studentId } });
  expect(notifications).toHaveLength(1);
});
```

### 5.4 Endpoint coverage — 100% required

TDD 18.14 requires every route to be hit by an integration test. This is measured, not assumed:

- A custom Jest reporter records every `(method, path)` pair exercised by Supertest during the integration run.
- A post-run script compares that set against the route list extracted from `openapi/openapi.json`.
- Any uncovered route fails CI with the route names listed.

This is what guarantees that a new endpoint cannot ship untested.

### 5.5 Coverage targets by module

From TDD 18.6.3, with the endpoint counts this plan actually produces:

| Module | Endpoints | Key integration assertions |
|---|---|---|
| Auth & Admin | ~30 | Token lifecycle, lockout, RBAC matrix, audit immutability |
| School | ~75 | DB state per operation, cross-table consistency, event effects, fee gate at all touchpoints |
| Therapy | ~60 | Conflict detection with real schedule data, GiST constraints, per-patient invoice rows, recurrence series state |
| HR | ~55 | Leave balance movement, substitute triggers, payroll journal, gratuity ledger, immutability |
| Accounts & Finance | ~45 | DR=CR on every journal, subledger vs GL agreement, aging buckets, period locks, statement balancing |
| Inventory & Procurement | ~50 | Stock level after GRN, AP after invoice, budget rejection, audit reconciliation |
| Reports & Dashboards | ~80 | Permission gating, ledger reconciliation, export pipeline, injection resistance |
| Notifications & Portal | ~45 | Recipient correctness, channel flags, WebSocket delivery, portal isolation |

---

## 6. Test data management

### 6.1 Factories

The pattern from TDD 18.11.1 is the standard. Every entity gets a factory in `shared/testing/factories/`, and every factory:

- Produces a valid entity with no arguments.
- Uses `sequence` for anything that must be unique.
- Exposes named traits for the states tests actually need.
- Generates money as integers in minor units.

```typescript
// shared/testing/factories/student.factory.ts
export const studentFactory = Factory.define<Student>(({ sequence }) => ({
  id:                 faker.string.uuid(),
  studentCode:        `STU-${String(sequence).padStart(4, '0')}`,
  fullName:           faker.person.fullName(),
  dateOfBirth:        faker.date.birthdate({ min: 3, max: 18, mode: 'age' }),
  gender:             faker.helpers.arrayElement(['Male', 'Female']),
  disabilityCategory: faker.helpers.arrayElement(['Autism', 'Down Syndrome', 'Cerebral Palsy']),
  severityLevel:      faker.helpers.arrayElement(['Mild', 'Moderate', 'Severe']),
  shiftId:            MORNING_SHIFT_ID,
  status:             'pending_admission_fee',
  enrollmentDate:     new Date(),
}));

export const pendingFeeStudent = studentFactory.params({ status: 'pending_admission_fee' });
export const activeStudent     = studentFactory.params({ status: 'active' });
export const graduatedStudent  = studentFactory.params({ status: 'graduated' });
```

Composite builders live beside the factories for multi-entity scenarios that recur across suites:

```typescript
// shared/testing/scenarios/
seedActiveStudentWithTeacher(shift)      // student + fee paid + teacher + mapping
seedDualShiftTeacher()                   // teacher assigned to both shifts
seedGroupWithPatients(count, therapyType)
seedMonthOfAttendance(studentId, pattern)
seedBookOfJournals(count)                // balanced random journals for statement tests
seedPayrollReadyEmployees(count)
seedStockedItem(quantity, location)
```

Scenario builders are used by integration tests; unit tests use bare factories.

### 6.2 Seed scripts

| Script | Purpose |
|---|---|
| `prisma/seed/reference.seed.ts` | Roles, permissions, chart of accounts, posting rules, notification types, leave types, skill domains, numbering schemes, org settings. Idempotent, runs everywhere including production. |
| `prisma/seed/dev.seed.ts` | Local development dataset: 2 academic years, 2 shifts, 12 holidays, 30 employees, 12 teachers, 40 students across all statuses, 15 patients, 5 therapists, 3 groups, IEPs, invoices, sessions. |
| `scripts/e2e-seed.ts` | The exact baseline from TDD 18.11.2 for the frontend E2E suite (see section 6.3). |
| `scripts/volume-seed.ts` | Phase 9 NFR verification: 500 active students, 100 employees, 12 months of attendance, 5,000 therapy sessions, 20,000 journal lines. |

### 6.3 E2E baseline dataset

Owned by the backend because it is created through the API and Prisma, and consumed by the frontend's Playwright suite. Contents per TDD 18.11.2:

- 2 academic years (one current)
- 2 shifts (Morning, Day)
- 1 user per system role, with known credentials from environment variables
- 10 active students
- 5 teachers with varied shift assignments, including one dual-shift teacher
- 8 therapy patients (mix of student-linked and external)
- 4 therapists across all six specialisations
- 3 therapy groups
- 2 complete IEPs with goals across multiple domains
- Fee structures for the current year
- A chart of accounts with opening balances

Isolation rules:

- Every E2E test that creates data prefixes names with the test-run id: `E2E-{runId}-{name}`.
- A teardown script deletes everything tagged with the run id **through the API's DELETE endpoints**, so the cleanup path is itself under test.
- Parallel Playwright workers use distinct run ids and never share created data.
- The baseline is reset by re-running the seed, not by mutating in place.

### 6.4 Sensitive data policy

Per TDD 18.11.3, enforced by a CI check:

- No real patient names, diagnoses, or employee data in any fixture, factory, or seed script.
- All personal data is Faker-generated and recognisably fictional.
- Production data is never copied to any test environment. A grep-based CI check scans test files for patterns resembling real phone numbers and national ID formats.
- Test database credentials are distinct from production and scoped to the test environment.

---

## 7. Performance testing — k6

### 7.1 Thresholds

Exactly TDD 18.8.1, encoded as k6 thresholds so a breach fails the run:

| Metric | Threshold | Applied to |
|---|---|---|
| `http_req_duration` p95 | < 300 ms | Read endpoints |
| `http_req_duration` p95 | < 600 ms | Write endpoints |
| `http_req_duration` p95 | < 3,000 ms | Synchronous report generation |
| `http_req_failed` rate | < 0.5% | All endpoints |
| Therapy calendar month view | < 1,000 ms | `GET /therapy/schedule` with 200 events |
| Sustained load | 50 VU × 10 min, no degradation | Full system |
| Stress | 150 VU × 5 min, p95 < 800 ms | Full system |
| Spike | 0 → 100 VU in 30 s, error rate < 2% | Login and full system |

### 7.2 Scripts

TDD 18.8.3 plus the scripts this plan adds:

| Script | Endpoints | Load | Phase |
|---|---|---|---|
| `login-spike.js` | `POST /auth/login` | 0→100 VU in 30 s | 0 |
| `student-list-load.js` | `GET /school/students` | 50 VU × 10 min | 1 |
| `attendance-bulk-submit.js` | `POST /school/attendance/bulk` | 30 VU × 5 min | 1 |
| `fee-invoice-generation.js` | `POST /school/fee-invoices/generate-monthly` | Async, 500 students | 2 |
| `therapy-calendar-load.js` | `GET /therapy/schedule?view=month` | 50 VU × 10 min | 3 |
| `group-session-schedule.js` | `POST /therapy/groups/:id/sessions` recurring | 20 VU × 5 min | 3 |
| `ledger-query-load.js` | `GET /accounts/ledger/:id` | 20 VU, 20k lines | 4 |
| `pnl-generation.js` | `GET /reports/finance/pnl` | Async routing check | 4 |
| `payroll-run-stress.js` | `POST /hr/payroll/run` 100 employees | 10 VU × 3 min | 5 |
| `stock-level-load.js` | `GET /inventory/stock-levels` | 30 VU × 5 min | 6 |
| `grn-post.js` | `POST /procurement/grns/:id/post` | 15 VU × 5 min | 6 |
| `dashboard-kpi-load.js` | `GET /dashboard`, `GET /reports/*` | 50 VU × 10 min | 7 |
| `report-export-async.js` | `POST /reports/export` + poll | 15 VU × 5 min | 7 |
| `report-heavy-sync.js` | Heavy reports | Async routing check | 7 |
| `websocket-connections.js` | Socket.io | 150 connections × 5 min | 8 |
| `notification-fanout.js` | Event with 200 recipients | Queue drain under 60 s | 8 |
| `full-system-load.js` | Mixed realistic traffic | 50 VU × 10 min | 9 |
| `full-system-stress.js` | Mixed realistic traffic | 150 VU × 5 min | 9 |
| `full-system-spike.js` | Mixed realistic traffic | 0→100 VU in 30 s | 9 |

### 7.3 Reference script

The canonical form, per TDD 18.8.2:

```javascript
// k6/scripts/therapy-calendar.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { getAuthToken } from '../lib/auth.js';

export const options = {
  stages: [
    { duration: '2m', target: 20 },
    { duration: '5m', target: 50 },
    { duration: '1m', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed:   ['rate<0.005'],
  },
};

export default function () {
  const token = getAuthToken('therapist');
  const res = http.get(
    `${__ENV.BASE_URL}/api/v1/therapy/schedule?view=month&date=2026-09-01&therapistId=${__ENV.THERAPIST_ID}`,
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

Results are exported to InfluxDB and rendered in Grafana with historical trend, so a regression is visible as a trend break rather than only as a threshold breach.

---

## 8. Security test automation

Per TDD 18.9, with the tools mapped to the pipeline stage they run in.

| Tool | Type | Checks | Frequency | Gate |
|---|---|---|---|---|
| ESLint security plugin | SAST | `eval`, hardcoded secrets, ReDoS-prone regex, prototype pollution | Every push | Blocks on error |
| npm audit | SCA | Fast dependency check | Every push | Blocks on high/critical |
| Trivy | Container + IaC | Image CVEs, compose and Nginx misconfiguration | Every PR | Blocks on high/critical |
| Semgrep | SAST | Custom architectural rules (below) | Every PR | Blocks on any match |
| Snyk (npm) | SCA | Full CVE database, transitive deps | Every PR + daily | Blocks on new high/critical |
| Snyk (Docker) | Container SCA | Base image CVEs | Weekly + on rebuild | Blocks on high/critical |
| gitleaks | Secrets | Full history scan | Every PR | Blocks on any finding |
| ZAP passive | DAST | Response headers, cookie flags, sensitive data in responses | Every deployment | Blocks on high |
| ZAP active | DAST | Injection, XSS, CSRF, path traversal, auth bypass | Nightly | Alerts; blocks release |

### 8.1 Custom Semgrep rules

These encode the architectural invariants this plan depends on. Each is a merge blocker.

| Rule | Rationale |
|---|---|
| `no-unguarded-controller` | Every controller method has `@Roles`, `@Permissions`, or an explicit `@Public()` |
| `no-raw-sql-interpolation` | No template literals inside `$queryRaw` / `$executeRaw` |
| `no-cross-module-prisma` | A module may only access its own Prisma models; cross-module reads go through read façades |
| `no-account-code-literals` | Account code strings appear only in `modules/accounts` and the seed |
| `no-writes-in-reports` | No `create`, `update`, `delete`, or `upsert` anywhere under `modules/reports` |
| `no-direct-status-write` | `students.status` and `payroll_runs.status` are written only by their owning status services |
| `no-date-now` | `Date.now()` and `new Date()` banned in `src/`; use `OrgClockService` |
| `no-process-env` | `process.env` banned outside `config/` |
| `no-console` | `console.*` banned; use the winston logger |
| `no-unencrypted-sensitive-write` | Writes to registered encrypted columns must go through the encryption extension |
| `no-float-money` | No `Float` or `Decimal` type on money columns; no floating-point arithmetic on `_amount` fields |

### 8.2 ZAP CI integration

Per TDD 18.9.1:

```yaml
security-scan:
  runs-on: ubuntu-latest
  steps:
    - name: Start test stack
      run: docker compose -f docker/docker-compose.test.yml up -d --wait

    - name: Seed
      run: docker compose exec -T app npx prisma db seed

    - name: OWASP ZAP Baseline Scan
      uses: zaproxy/action-baseline@v0.11.0
      with:
        target: 'http://localhost:3000'
        rules_file_name: '.zap/rules.tsv'
        fail_action: true
        cmd_options: '-a'

    - name: Upload ZAP Report
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: zap-report
        path: report_html.html
        retention-days: 90
```

`.zap/rules.tsv` holds only justified exceptions, each with a comment explaining why the finding is accepted. An undocumented exception fails review.

---

## 9. Mutation testing — Stryker

Per TDD 18.12. Mutation testing is the real measure of test quality, because it answers the question coverage cannot: would the tests notice if the code were wrong?

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
    'src/shared/money/**/*.ts',
    '!src/**/*.spec.ts',
  ],
  thresholds: { high: 85, low: 75, break: 70 },
  jest: { projectType: 'custom', configFile: 'jest.config.ts' },
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  concurrency: 4,
  timeoutMS: 30000,
};
```

- **Scope:** service files and shared utilities. Controllers and repositories are excluded because integration tests cover them and mutating thin delegation produces uninformative survivors.
- **Overall target:** ≥ 75%. Below 70% breaks the weekly run.
- **Higher targets** for the services where a surviving mutant would be most damaging: `AccountsService`, `ConflictDetectionService`, `SafeQueryBuilder` at ≥ 85%; the pure calculators `PayrollCalculationService`, `GratuityCalculationService`, `DepreciationService`, `ThreeWayMatchService` at ≥ 90% (they have no I/O to excuse a survivor).
- **Operators:** ArithmeticOperator, BooleanLiteral, ConditionalExpression, EqualityOperator, LogicalOperator, StringLiteral, MethodExpression.
- **Handling survivors:** each surviving mutant is either killed with a new test or explicitly ignored with a comment justifying why the mutation is behaviourally equivalent. Silent tolerance is not permitted.

Runs weekly rather than per-PR because a full mutation run over the whole service layer takes 40–60 minutes.

---

## 10. CI/CD pipeline — test gates

The eleven stages from TDD 18.13. Every stage is a hard gate.

| Stage | Trigger | Runs | Blocks if |
|---|---|---|---|
| 1 | Every push | ESLint, TypeScript `--noEmit`, ESLint security plugin, `npm audit`, gitleaks, Trivy | Any lint or type error, high/critical CVE, secret found, container misconfiguration |
| 2 | Every push | Backend unit tests with coverage | Any failure; service-layer coverage < 80%; overall < 70% |
| 3 | Every PR | Integration tests (Supertest + Testcontainers), endpoint-coverage check | Any failure; any uncovered route; coverage diff drop below 70% |
| 4 | Every PR | Semgrep custom rules, Snyk dependency scan, ZAP passive scan, OpenAPI staleness check | Any rule match, new high/critical CVE, high passive finding, stale OpenAPI document |
| 5 | Merge to main | Frontend E2E suite (Playwright, three browsers) against a deployed backend | Any E2E failure on any browser |
| 6 | Merge to main | Visual regression (frontend-owned) | Any diff above 0.2% without baseline approval |
| 7 | Merge to main | Full-page accessibility scan (frontend-owned) | Any WCAG 2.1 AA violation |
| 8 | Merge to main | Build images, `prisma migrate deploy`, deploy | Only runs if 1–7 pass |
| 9 | Weekly Sun 00:00 | k6 load, stress, spike | Any threshold exceeded |
| 10 | Weekly Sun 01:00 | Stryker mutation run | Score below 75% |
| 11 | Nightly 02:00 | ZAP active scan on staging | New medium/high findings — report emailed to the tech lead |

### Timing budget

Per TDD 18.13: developer loop (stages 1–2) under 4 minutes; full PR gate (1–4) under 12 minutes; post-merge E2E (5–7) around 18 minutes with parallel workers.

Achieved by: Jest sharding across runners, per-worker container reuse in `globalSetup`, aggressive dependency caching, running stages 1 and 2 in parallel jobs, and keeping integration suites independent so they parallelise cleanly.

### Migration safety in CI

An extra check not in the TDD but necessary given the phase structure: every PR that adds a migration must prove it applies cleanly both to an empty database **and** to a database restored from the previous release's schema with seeded data. A destructive migration (dropping a column or table) additionally requires an explicit `ALLOW-DESTRUCTIVE-MIGRATION` marker in the PR body.

---

## 11. Coverage requirements and quality gates

TDD 18.14, backend rows:

| Layer | Metric | Minimum | Enforced in |
|---|---|---|---|
| Service layer | Line + branch | 80% | Stage 2 |
| Overall backend | Line | 70% | Stage 2 |
| API endpoints | All routes hit | 100% | Stage 3 |
| Mutation score (services) | Stryker | ≥ 75% | Stage 10 |
| CVE severity | No unpatched high/critical | 100% | Stages 1 + 4 |
| Semgrep rules | Zero matches | 100% | Stage 4 |
| Flakiness | Identical results over 10 consecutive runs | 100% | Phase 9 gate |

### Additional project-specific gates

These come from the invariants the phase plans establish, and they are as important as the coverage numbers:

| Gate | Check |
|---|---|
| Ledger integrity | Debits equal credits across every posted journal after the full integration suite |
| Subledger agreement | AR and AP subledger totals equal their general ledger account balances |
| Notification matrix | Seeded configuration matches TDD 10.3 exactly |
| Report coverage | Every feature-list report has a registered handler with a definition |
| Business rule traceability | Every rule in every phase file has a test referencing its rule id |
| Portal isolation | Table-driven test over every portal and non-portal route |
| RBAC matrix | Table-driven test over every route × every role, generated from the OpenAPI document |

### Business rule traceability

Each phase file numbers its rules (`S-01`, `M-01`, `C-04`, `AC-09`, and so on). Every rule must have at least one test whose name or a `// rule: <id>` comment references it. A script extracts rule ids from the phase files and test references from the test sources and fails CI on any rule with no test. The report lands at `test/traceability/coverage.md`.

This is the mechanism that keeps the plan and the implementation honest with each other: a rule cannot be quietly dropped, and a test cannot claim to cover a rule that does not exist.

---

## 12. Reporting

Per TDD 18.15:

| Report | Tool | Audience | Access |
|---|---|---|---|
| Coverage trend and PR diff coverage | Codecov | Developers, tech lead | PR comment + dashboard |
| Unit and integration results | `jest-html-reporter` | Developers | CI artifact per run |
| Endpoint coverage report | Custom script | Developers, tech lead | CI artifact + PR comment listing uncovered routes |
| Rule traceability report | Custom script | Tech lead | CI artifact |
| Performance results and trend | k6 + Grafana | Tech lead, developers | Grafana dashboard |
| Security scan results | ZAP HTML + Snyk report | Tech lead, principal | CI artifact + email on failure |
| Mutation report | Stryker HTML + dashboard | Developers, tech lead | CI artifact + Stryker dashboard |
| Ledger integrity report | Custom job | Tech lead, accountant | Nightly, alerts on breach |
| Weekly test health summary | GitHub Actions summary | All stakeholders | Actions summary + email digest |

Artifact retention: 30 days for passing runs, 90 days for failed runs, matching the TDD.

---

## 13. Local developer workflow

```bash
npm run test                  # unit only, watch-friendly, ~40 s
npm run test:cov              # unit with coverage and threshold check
npm run test:int              # integration, spins containers, ~4 min
npm run test:int -- school    # single integration suite
npm run test:mutation         # Stryker on changed services only
npm run lint && npm run typecheck
npm run semgrep               # custom architectural rules
npm run k6 -- therapy-calendar
npm run test:traceability     # rule coverage report
```

A pre-commit hook runs lint, typecheck, and the unit tests for changed files. A pre-push hook runs the full unit suite. Integration tests are not in a hook — they are too slow — but the PR gate makes them unavoidable.

Docker is required for integration tests. `npm run test:int` fails with a clear message if the Docker daemon is unavailable rather than producing a confusing connection error.
