# Frontend Test Automation Plan

| Field | Value |
|---|---|
| Scope | The entire frontend repository, all phases |
| Source of truth | TDD section 18 (Test Strategy & Automation) |
| Applies from | Phase 0, day one |
| Backend counterpart | [backend/11-test-automation.md](../backend/11-test-automation.md) |

---

## 1. Philosophy

The TDD states the position plainly: **zero manual QA**. There is no manual verification step in the release pipeline. Stakeholders may explore during UAT, but nothing ships on the strength of someone having clicked through it.

For a frontend this is a stronger commitment than it first appears, because the frontend is where "it looks fine" is most tempting and least reliable. Four principles follow, and they shape every decision in this document.

**Test behaviour, not implementation.** React Testing Library is chosen precisely because it makes implementation-coupled tests awkward. Queries are by role, label, and text — the things a user perceives. A test that reaches for a class name or a component's internal state is a test that will break on a refactor and pass on a regression, which is the worst of both outcomes. The one deliberate exception is asserting a status badge's colour class, which the TDD's own example does, because colour is part of the specified behaviour of a status indicator.

**A contract mock is a contract, not a convenience.** All component and hook tests run against MSW handlers generated from the backend's OpenAPI document. Hand-written mocks drift from the real API, and drift is discovered in production. When the backend changes a response shape, the generated handlers change, and the tests that depended on the old shape fail in CI on the frontend repository — which is exactly the signal wanted.

**Accessibility is a test, not a review.** Every component carries a `jest-axe` assertion and every route carries a full-page axe scan. A violation fails the build. This is the only approach that works, because accessibility regressions are invisible to the person who introduces them.

**Determinism is non-negotiable.** A flaky test is a bug and is fixed, not retried. Retry counts above one are treated as a defect to investigate, and the suite is configured to fail on a test that passes only on retry in CI.

---

## 2. Testing pyramid and allocation

The TDD's overall targets, with the frontend's share broken out:

| Layer | Tool | Frontend target | Runs on |
|---|---|---|---|
| Component unit tests | Jest + React Testing Library + user-event | ~600 tests | Every push |
| Hook and store tests | Jest + `@testing-library/react` + a test query client | ~150 tests | Every push |
| Accessibility unit checks | jest-axe | ~150 checks (one per component minimum) | Every push |
| Contract tests | MSW handlers generated from OpenAPI | Continuous — every component and hook test | Every push |
| E2E | Playwright (Chromium, Firefox, WebKit) | ~250 scenarios, shared with the backend's E2E accounting | Pre-merge to main + nightly |
| Full-page accessibility | @axe-core/playwright | Every route, every applicable role | Every PR |
| Visual regression | Playwright screenshots | ~120 snapshots | Every PR |
| Performance | Lighthouse CI + render profiling | 10 routes, 9 interactions | Every PR (budgets), weekly (full) |
| Security | ESLint security plugin, npm audit, Snyk, bundle scan | Continuous | Every PR + daily |

The frontend's E2E scenarios are the same scenarios the TDD enumerates in 18.7 — they are not a separate set. The backend plan owns their API-level equivalents; this plan owns their browser execution. Where a phase document in this plan lists an E2E ID such as `THR-E2E-02`, that is the TDD's scenario, executed here.

### Per-phase allocation

| Phase | Component tests | Hook tests | E2E scenarios | Visual snapshots |
|---|---|---|---|---|
| 0 — Foundation | ~55 | ~25 | 8 | 12 |
| 1 — HR & School core | ~85 | ~20 | 22 | 16 |
| 2 — School advanced & portal | ~90 | ~20 | 28 | 18 |
| 3 — Therapy | ~85 | ~20 | 26 | 16 |
| 4 — Accounts & finance | ~90 | ~18 | 30 | 18 |
| 5 — HR payroll & gratuity | ~75 | ~15 | 24 | 14 |
| 6 — Inventory & procurement | ~70 | ~12 | 22 | 12 |
| 7 — Reports & dashboards | ~45 | ~10 | 20 | 14 |
| 8 — Notifications & real-time | ~40 | ~10 | 22 | 10 |
| 9 — Hardening | — | — | 8 (offline, security, session) | Full-route matrix |

These are floors, not budgets to be met exactly. A phase's exit criteria are the authority.

---

## 3. Tool stack

Versions match the TDD's 18.3 table exactly, since divergence between the two repositories' tooling produces noise nobody wants to debug.

| Tool | Version | Purpose |
|---|---|---|
| Jest | 29.x | Runner, assertions, coverage via Istanbul |
| React Testing Library | 14.x | Component rendering and user-perceivable queries |
| @testing-library/user-event | 14.x | Realistic event simulation — typing, clicking, tabbing |
| @testing-library/jest-dom | 6.x | DOM matchers |
| jest-axe | 8.x | Component-level WCAG assertions |
| MSW | 2.x | Request interception at the network layer |
| `msw-auto-mock` / OpenAPI generator | current | Handler generation from the backend contract |
| Playwright | 1.44.x | E2E, visual regression, full-page a11y |
| @axe-core/playwright | 4.x | Full-page WCAG 2.1 AA scanning |
| Lighthouse CI | current | Core Web Vitals and bundle budgets |
| fishery | 2.x | Typed fixture factories |
| Faker.js | 8.x | Realistic fictional data |
| @tanstack/react-query test utilities | matching the app version | Query client isolation per test |
| Storybook | 8.x | Component development and the visual regression source for isolated components |
| Snyk / npm audit | current | Dependency scanning |
| ESLint security plugin | current | SAST |
| Codecov | — | Coverage aggregation and PR diff coverage |

**On mutation testing:** the TDD scopes Stryker to the backend service layer and explicitly excludes controllers and repositories. The frontend equivalent — mutating component render logic — produces a poor signal-to-noise ratio, so mutation testing is not run against components. It *is* run against the frontend's pure logic modules: formatters, validation schemas, permission helpers, calculation utilities, and the error mapper. These carry real logic and a mutation score is meaningful there. Target ≥ 75%, matching the backend's threshold.

---

## 4. Component testing conventions

### File placement and naming

```
features/school/components/StudentStatusBadge.tsx
features/school/components/StudentStatusBadge.test.tsx
features/school/components/StudentStatusBadge.stories.tsx
```

Test files sit beside their component. Naming follows `describe('<ComponentName>') > describe('<behaviour area>') > it('<user-observable outcome>')`.

An `it` description states what a user observes, not what the code does. `it('disables Schedule when a conflict is present')` is right; `it('sets isDisabled state')` is not.

### The standard render harness

Every component test renders through a shared harness rather than RTL's bare `render`, because a component that needs a query client, a router, a theme, and an auth context in production needs them in tests too, and constructing them per file guarantees inconsistency.

```typescript
// test/render.tsx
export function renderWithProviders(
  ui: React.ReactElement,
  options?: {
    role?: Role;                      // drives the auth context and permission set
    user?: Partial<AuthUser>;
    route?: string;                   // initial router entry
    queryClient?: QueryClient;        // defaults to a fresh isolated client
    socketState?: SocketState;        // defaults to 'connected'
  },
): RenderResult & { user: UserEvent; queryClient: QueryClient };
```

The harness:

- Creates a **fresh `QueryClient` per test** with retries disabled and `gcTime: Infinity`, so no cache leaks between tests. A shared client is the single most common source of frontend test flakiness.
- Installs the auth context for the named role, so an RBAC assertion is a one-line option rather than a mocking exercise. This is what makes the "assert across all nine roles" pattern used throughout the phase documents practical.
- Provides the router with the given initial route.
- Provides the socket context in a controllable state.
- Returns a pre-configured `user` from `user-event` so no test calls `userEvent.setup()` inconsistently.

### Query conventions

| Do | Don't |
|---|---|
| `getByRole('button', { name: 'Schedule' })` | `getByTestId('schedule-btn')` |
| `getByLabelText('Therapy Type')` | `container.querySelector('#therapy-type')` |
| `findByRole('alert')` for async | `waitFor` around a `getBy` |
| `getByRole('status')` for live regions | asserting on a CSS class for state |
| `queryByRole(...)` + `toBeNull()` for absence | `not.toBeVisible()` for something that should not exist |

The last row matters for RBAC. When a phase document says an action must be "absent, not disabled", the test asserts `queryBy...` returns null. A `toBeDisabled()` assertion would pass on a rendered-but-disabled control, which is a different and weaker guarantee.

`data-testid` is permitted only for elements with no accessible identity by design — a chart container, a virtualised scroll viewport — and each use is justified in a comment.

### The four assertions every interactive component carries

Beyond its behavioural tests, every component in the inventory of every phase carries these four, applied by a shared test helper so they are not forgotten:

```typescript
describe.each(cases)('<Component> standard guarantees', () => {
  it('has no WCAG 2.1 AA violations', async () => { /* jest-axe */ });
  it('is fully operable by keyboard', async () => { /* tab order, activation, no traps */ });
  it('renders its loading state', () => { /* skeleton or busy indicator */ });
  it('renders its error state with a retry', () => { /* error mapping */ });
});
```

The loading and error assertions exist because a missing empty or error state is the most common late-build gap, and Phase 9's audit finding them is far more expensive than a per-component test preventing them.

### Negative-path assertions

Each of these must appear in the suite for the component types they apply to. A component with only happy-path tests is not tested.

| Component type | Required negative paths |
|---|---|
| Any form | Each validation rule violated individually; submit blocked; the error associated with its field; focus moves to the first invalid field |
| Any form | A server-side 422 mapped back to the correct field, not shown as a global error |
| Any form | A submit failure retains the user's input |
| Any list | Empty result distinguished from not-yet-loaded |
| Any list | Load failure shows a retryable error |
| Any money input | Negative, zero, non-numeric, and excessive-precision input |
| Any date input | Invalid, out-of-range, and inverted-range input |
| Any destructive action | Confirmation required; cancel leaves state unchanged |
| Any permission-gated control | Absent for each role that lacks the permission |
| Any async action | In-flight state prevents double submission |
| Any file upload | Oversized file, wrong type, and upload failure |

### Key component suites

The TDD's 18.5.4 table names twelve component suites explicitly. Each is owned by the phase that builds it and its scenarios are elaborated there; this table maps them so nothing is orphaned.

| TDD-named suite | Owning phase | Elaborated in |
|---|---|---|
| `StudentEnrollmentForm` | 1 | 02-phase1 §10 |
| `StudentStatusBadge` | 1 | 02-phase1 §10 |
| `TeacherMappingPanel` | 1 | 02-phase1 §10 |
| `IEPGoalCard` | 2 | 03-phase2 §10 |
| `AttendanceGrid` | 1 | 02-phase1 §10 |
| `TherapyCalendar` | 3 | 04-phase3 §10 |
| `GroupTherapyEnrollPanel` | 3 | 04-phase3 §10 |
| `ActivityOptInCard` | 2 | 03-phase2 §10 |
| `PayslipViewer` | 5 | 06-phase5 §10 |
| `StudentLeaveRequestForm` | 2 | 03-phase2 §10 |
| `NotificationBell` | 0 (stub), 8 (full) | 01-phase0 §10, 09-phase8 §11 |
| `GratuityDashboard` | 5 | 06-phase5 §10 |

---

## 5. Contract testing with MSW

### Generation

The backend publishes an OpenAPI 3 document per release. A generation step produces:

- TypeScript types for every request and response shape.
- MSW handlers returning schema-valid responses populated from factories.
- A checked-in snapshot of the contract so a change is visible in a diff and reviewed rather than silently absorbed.

```
npm run contract:pull      # fetch the published OpenAPI document for the target backend version
npm run contract:generate  # emit types + handlers
npm run contract:check     # fail if generated output differs from what is committed
```

`contract:check` runs in CI. A backend change that alters a shape produces a failing frontend build with a readable diff, which is the entire point of contract-first development in a two-repository setup.

### Handler organisation

```
test/msw/
├── handlers/
│   ├── generated/          # emitted, never edited
│   └── overrides/          # per-domain scenario handlers, hand-written
├── server.ts               # node server for Jest
├── browser.ts              # worker for Storybook and local development
└── scenarios.ts            # named scenarios composed from overrides
```

Generated handlers provide the default success response for every endpoint. Overrides express the scenarios a test actually cares about — a conflict, a 403, a 422 with field errors, an empty list, a slow response, a 500.

```typescript
// scenarios.ts
export const scenarios = {
  therapistConflict: () => server.use(
    http.get('*/therapy/sessions/conflicts', () =>
      HttpResponse.json({ hasConflict: true, conflictType: 'therapist', conflictingSession: sessionFactory.build() }),
    ),
  ),
  budgetExceeded: () => server.use(/* ... */),
  unbalancedJournalRejected: () => server.use(/* ... */),
  forbidden: (path: string) => server.use(/* 403 with the standard error envelope */),
  slow: (path: string, ms: number) => server.use(/* delayed response for loading-state tests */),
  serverError: (path: string) => server.use(/* 500 for error-state tests */),
};
```

Naming scenarios rather than inlining handlers keeps the intent readable and stops the same conflict response being written twelve slightly different ways.

### Rules

- `onUnhandledRequest: 'error'`. A component that calls an endpoint the test did not anticipate fails loudly. Silently returning a 404 to an unanticipated call hides real bugs.
- The server resets handlers after every test, so an override never leaks.
- Response shapes always come from generated types; a hand-written response object that does not type-check is a compile error.
- The standard error envelope from the backend contract is used for every error scenario, so the error-mapping layer is genuinely exercised.

---

## 6. Hook and store testing

Hooks carry the caching and invalidation logic that determines whether the UI shows correct data. The phase documents specify invalidation sets in detail precisely so they can be tested.

### Query hook tests

For each query hook: the correct key is used, the correct `staleTime` and `refetchInterval` are configured, an `enabled` guard behaves, error mapping produces the expected message, and a `select` transform is correct.

### Mutation hook tests

For each mutation hook, the invalidation set is asserted exhaustively:

```typescript
it('invalidates exactly the documented keys on payroll lock', async () => {
  const spy = jest.spyOn(queryClient, 'invalidateQueries');
  const { result } = renderHook(() => useLockPayrollRun(), { wrapper });
  await act(() => result.current.mutateAsync({ runId }));

  const invalidated = spy.mock.calls.map(c => c[0]?.queryKey);
  expect(invalidated).toEqual(expect.arrayContaining([
    ['hr','payroll','run',runId],
    ['hr','payroll','runs'],
    ['hr','payroll','slips',runId],
    ['accounts','ledger'], ['accounts','trialBalance'], /* accounting views */
    ['hr','benefits','schedule'],
    ['hr','encashment','requests'],
  ]));
  expect(invalidated).toHaveLength(EXPECTED_LOCK_INVALIDATION_COUNT);
});
```

The length assertion is deliberate. Asserting only `arrayContaining` lets an over-broad invalidation — invalidating the entire cache, for instance — pass while destroying performance. Both directions matter.

### Optimistic update tests

For every optimistic mutation: the optimistic state appears immediately, a server error rolls it back exactly, and a success reconciles with the server value. The rollback test is the one that matters, and it is the one most often missing.

### Store tests

Zustand stores are tested as plain functions: initial state, each action's effect, persistence behaviour where configured, and per-user scoping for the persisted stores. The queue stores — attendance, count sheet — additionally test order preservation, survival across a simulated reload, and conflict surfacing.

---

## 7. E2E testing with Playwright

### Structure

```
e2e/
├── fixtures/
│   ├── auth.fixtures.ts        # per-role authenticated contexts
│   ├── data.fixtures.ts        # per-test data creation with a run-scoped prefix
│   └── a11y.fixtures.ts        # axe injection helper
├── pages/                      # Page Object Model
│   ├── LoginPage.ts
│   ├── StudentListPage.ts
│   ├── TherapyCalendarPage.ts
│   ├── JournalEntryPage.ts
│   └── ...
├── specs/
│   ├── school/                 # SCH-E2E-*
│   ├── therapy/                # THR-E2E-*
│   ├── hr/                     # HR-E2E-*, PAY-E2E-*, GRA-E2E-*, ENC-E2E-*
│   ├── accounts/               # ACC-E2E-*
│   ├── procurement/            # PRO-E2E-*, INV-E2E-*
│   ├── reports/                # RPT-E2E-*, DSH-E2E-*
│   ├── realtime/               # RT-E2E-*, MSG-E2E-*, ANN-E2E-*, WF-E2E-*
│   ├── rbac/                   # RBAC-E2E-*
│   ├── a11y/                   # A11Y-E2E-*
│   └── resilience/             # OFF-E2E-*
└── visual/                     # screenshot specs
```

The Page Object Model is required by the TDD and is the right call at this scale: sixty-plus routes with shared interaction patterns produce enormous duplication otherwise.

### Auth fixtures

Storage states are generated once per run for all nine roles plus a parent portal user, following the TDD's pattern:

```typescript
export const test = base.extend<{
  superAdmin: Page; principal: Page; accountant: Page; hrOfficer: Page;
  coordinator: Page; teacher: Page; therapist: Page; inventoryManager: Page;
  parent: Page;
}>({ /* one context per role from a stored storageState */ });
```

Every scenario declares the role it runs as by requesting that fixture, which makes the role explicit in the test signature rather than buried in a login step.

### Determinism rules

Flakiness in E2E is where automated suites lose credibility, so the rules are strict.

- No fixed waits. `waitForTimeout` is banned by lint. Waiting is on a locator state, a network response, or an explicit application-emitted readiness signal.
- Data per test, prefixed with the run ID, following the TDD's 18.11.2 approach. No test depends on data another test created.
- Time is controlled. Any scenario involving dates, deadlines, expiry, ageing buckets, or recurrence sets a fixed clock, because a suite that fails on the first of the month is a suite people learn to ignore.
- Animations disabled globally in the Playwright configuration.
- Parallel workers each get an isolated data namespace.
- Retries set to one in CI, and a test that passes only on retry is reported as a flake and triaged — not silently accepted.

### TDD scenario traceability

The TDD enumerates 40 E2E scenarios in 18.7. Every one is executed by the frontend suite. Local scenario IDs carry an `FE-` prefix so they never collide with the TDD's IDs, and each phase document's E2E table names the TDD scenarios its local scenarios cover. This table is the reverse index — the artefact that answers "is TDD scenario X actually tested, and where".

| TDD ID | Executed by | Phase doc |
|---|---|---|
| SCH-E2E-01 | `FE-SCH-E2E-01`, `FE-SCH-E2E-02` | 02-phase1 |
| SCH-E2E-02 | `FE-SCH-E2E-01` | 02-phase1 |
| SCH-E2E-03 | `FE-SCH-E2E-09` | 02-phase1 |
| SCH-E2E-04 | `FE-SCH-E2E-03` | 02-phase1 |
| SCH-E2E-05 | `FE-SCH-E2E-03` | 02-phase1 |
| SCH-E2E-06 | `FE-SCH-E2E-04` | 02-phase1 |
| SCH-E2E-07 | `FE-SCH-E2E-04` | 02-phase1 |
| SCH-E2E-08 | `FE-SCH-E2E-05` | 02-phase1 |
| SCH-E2E-09 | `FE-SCH-E2E-06` | 02-phase1 |
| SCH-E2E-10 | `FE-IEP-E2E-01`, `FE-IEP-E2E-04` | 03-phase2 |
| SCH-E2E-11 | `FE-IEP-E2E-01`, `FE-POR-E2E-01` | 03-phase2 |
| SCH-E2E-12 | `FE-POR-E2E-02` | 03-phase2 |
| SCH-E2E-13 | `FE-POR-E2E-02` | 03-phase2 |
| SCH-E2E-14 | `FE-ACT-E2E-01` | 03-phase2 |
| SCH-E2E-15 | `FE-RPT-E2E-01` | 03-phase2 |
| THR-E2E-01 … THR-E2E-11 | `THR-E2E-01` … `THR-E2E-11` (one-to-one) | 04-phase3 |
| HR-E2E-01 | `FE-HR-E2E-04` | 02-phase1 |
| HR-E2E-02 | `FE-HR-E2E-02` | 02-phase1 |
| HR-E2E-03 | `PAY-E2E-01` | 06-phase5 |
| HR-E2E-04 | `GRA-E2E-01` | 06-phase5 |
| HR-E2E-05 | `GRA-E2E-02` | 06-phase5 |
| HR-E2E-06 | `ENC-E2E-01`, `FE-HR-E2E-01` | 06-phase5, 02-phase1 |
| HR-E2E-07 | `FE-HR-E2E-03` | 02-phase1 |
| ACC-E2E-01 | `ACC-E2E-01` | 05-phase4 |
| ACC-E2E-02 | `ACC-E2E-02` | 05-phase4 |
| ACC-E2E-03 | `ACC-E2E-03` | 05-phase4 |
| ACC-E2E-04 | `ACC-E2E-04` | 05-phase4 |
| PRO-E2E-01 | `PRC-E2E-01` | 07-phase6 |
| PRO-E2E-02 | `PRC-E2E-01` (budget warning path), `INV-E2E-02` | 07-phase6 |
| INV-E2E-01 | `INV-E2E-06` | 07-phase6 |

A CI check parses the phase documents' E2E tables, builds this reverse index, and fails if any TDD scenario ID has no executing scenario. Maintaining the mapping by hand across ten documents would drift within two phases.

### Critical-path scenarios

The TDD marks its E2E scenarios as critical or not, and requires **100% of critical scenarios to pass** with ≥ 95% for the rest. Every scenario in the TDD's 18.7 tables is marked critical, so in practice the frontend E2E suite has no tolerance for failure on the enumerated set. Additional scenarios introduced by this plan's phase documents are classified when written; a scenario that verifies a money-bearing path, a permission boundary, or a data-isolation guarantee is always critical.

### Cross-browser

The full suite runs on Chromium, Firefox, and WebKit. The fifteen highest-traffic flows plus the entire parent portal additionally run on mobile Safari and Chrome Android device profiles, since the portal is a phone-first surface and treating it as a desktop afterthought is how portals become unusable.

---

## 8. Accessibility test automation

### Component level

Every component test file includes a `jest-axe` assertion, following the TDD's 18.5.3 pattern with colour-contrast checking explicitly enabled:

```typescript
it('has no WCAG 2.1 AA accessibility violations', async () => {
  const { container } = renderWithProviders(<IEPGoalCard goal={mockGoal} />);
  const results = await axe(container, { rules: { 'color-contrast': { enabled: true } } });
  expect(results).toHaveNoViolations();
});
```

A lint rule enforces the presence of this test in every `*.test.tsx` file that renders a component, because "every component" is only true if it is checked mechanically.

### Route level

`@axe-core/playwright` scans every route in an enumerated route manifest, in every role that can reach it. The manifest is generated from the route tree, and a completeness test fails if a route exists without a corresponding scan entry — the mechanism that keeps coverage honest as routes are added.

Scans run against realistic populated state, not empty pages. An empty table has no accessibility problems; a populated one with sortable headers, row selection, and inline actions is where violations live.

### Beyond automated rules

Automated tooling catches roughly a third of real accessibility problems, so the suite includes assertions automated rules do not cover:

| Guarantee | How it is asserted |
|---|---|
| Focus moves to the main heading on route change | Playwright assertion on `document.activeElement` after navigation, across twenty representative routes |
| Focus enters a dialog on open and returns to the trigger on close | Component and E2E assertions on every dialog |
| Focus moves to the first invalid field on validation failure | Component assertion on every form |
| Async results are announced without stealing focus | Live-region content assertion plus an `activeElement` assertion that focus did not move |
| Only new messages are announced, not thread history | Live-region content assertion on thread load versus message arrival |
| Status is never conveyed by colour alone | Text-content assertion for every status badge, alert, and indicator variant |
| Charts have a data table alternative in the DOM | Presence assertion on every `ChartTile` and chart component |
| Keyboard alternatives exist for every drag interaction | Keyboard-path assertion on the calendar, pipeline board, and workflow builder |
| Touch targets meet 44×44 px | Bounding-box assertions on the four densest screens |
| 400% zoom reflow at 320px | Playwright viewport assertion with no horizontal text scroll |
| `prefers-reduced-motion` respected | Emulated media assertion on animated components |

Manual screen reader verification with NVDA, VoiceOver desktop, and VoiceOver iOS is scheduled in Phase 9 for the fifteen high-traffic flows. It is a certification activity, not a substitute for the automated assertions above.

---

## 9. Visual regression

### Configuration

Following the TDD's 18.10: a diff exceeding **0.2% of pixels** fails and blocks merge, animations disabled, and volatile regions masked.

```typescript
await expect(page).toHaveScreenshot('therapy-calendar-month.png', {
  maxDiffPixelRatio: 0.002,
  animations: 'disabled',
  mask: [page.locator('[data-visual-mask]')],
});
```

`data-visual-mask` is applied to anything genuinely non-deterministic: current-time indicators, relative timestamps, generation timestamps in print headers, and randomised avatar colours. Masking is deliberate and reviewable rather than achieved by loosening the diff threshold, because a loose threshold hides real regressions.

### Pages under guard

The TDD's 18.10.1 list is the mandatory minimum:

| Page | Viewports | States |
|---|---|---|
| Student profile | 1440, 768, 375 | Active and Pending Admission Fee |
| Therapy calendar month view | 1440, 768 | 10 seeded sessions |
| Group therapy enrollment panel | 1440 | Empty and 4 patients |
| IEP plan (coordinator) | 1440 | All three goal progress states |
| IEP plan (parent) | 1440, 375 | Read-only with acknowledge |
| Payslip viewer | 1440 | All components populated |
| Principal dashboard | 1440 | All KPI cards populated |
| Login | 1440, 375 | Default and validation error |
| Parent portal home | 375, 768 | Summary card, fee badge, schedule link |
| Attendance grid | 1440 | Full month, mixed statuses, holidays greyed |

Each phase document adds its own baselines on top, listed in that phase's visual regression section. The total lands around 120 snapshots against the TDD's ~80 minimum, the excess concentrated on the dense financial and scheduling screens where a layout regression does real damage.

### Storybook as a source

Components with many discrete states — status badges, the balance strip, alert variants, empty states — are captured from Storybook rather than from a full page. A full-page screenshot to verify a badge colour is slow and fragile; a Storybook story with all variants in one frame is fast, stable, and reviewable.

---

## 10. Performance test automation

The frontend's performance gates complement the backend's k6 thresholds rather than duplicating them. k6 proves the API responds; these prove the browser renders.

### Lighthouse CI

Ten representative routes on a throttled mid-range mobile profile:

login, principal dashboard, student list, student profile, therapy calendar, journal entry form, payroll run detail, stock level grid, a financial report, parent portal home.

| Metric | Gate |
|---|---|
| LCP | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| TTFB | ≤ 800 ms |
| Performance score | ≥ 85 |
| Accessibility score | 100 |

### Bundle budgets

Asserted from the build manifest; exceeding a budget fails the build.

| Target | Budget |
|---|---|
| Initial shared JS (gzip) | ≤ 180 KB |
| Per-route first load | ≤ 250 KB |
| Named exception routes (therapy calendar, report shell) | ≤ 320 KB |
| CSS | ≤ 60 KB |
| Fonts | ≤ 100 KB |

A separate check asserts that FullCalendar, Recharts, the rich text editor, the PDF preview library, and the report builder appear in no shared chunk.

### Render profiling

The nine interaction budgets from Phase 9 §2 run in CI with a tolerance band wide enough to absorb runner variance and narrow enough to catch a real regression. Each is measured with the React profiler in a production build, not a development build, since development-mode timings are meaningless.

Virtualisation assertions accompany them: the five largest tables mount a bounded DOM row count regardless of dataset size.

### Cache soak

A thirty-minute scripted navigation session asserts bounded query cache entry count and bounded heap growth. This catches the class of bug where an unbounded `gcTime` on report results slowly consumes a tab's memory over a working day — invisible in every other test.

---

## 11. Security test automation

| Check | Tool | Runs |
|---|---|---|
| SAST | ESLint security plugin, `eslint-plugin-react` security rules | Every push |
| Dependency vulnerabilities | `npm audit`, Snyk | Every PR + daily |
| Token leakage | A custom scan of the built bundle and of E2E-captured network traffic for tokens in URLs, storage, logs, or error payloads | Every PR |
| `dangerouslySetInnerHTML` enumeration | A custom lint rule with an approved-usage allowlist | Every push |
| XSS sanitisation | Stored payload tests against all four rich text surfaces | Every PR |
| CSP | Violation reporting verified with a deliberately injected violation in a test build | Every PR |
| Over-broad API responses | Contract assertions that responses for the three sensitive surfaces (salary, medical, parent contact) contain no field beyond the documented shape | Every PR |
| Permission boundaries | The RBAC E2E suite plus the per-role component absence assertions | Every PR (component), pre-merge (E2E) |
| Data isolation | Parent portal isolation, teacher student-scope, therapist patient-scope, each with a direct-request attempt from the constrained session | Pre-merge |
| Session handling | Idle timeout warning, extension, expiry redirect with destination preservation, and clean logout on revocation | Pre-merge |
| Container | Trivy on the frontend image | Every push |

The over-broad-response check deserves note. It is the one security test that a frontend suite is uniquely positioned to run, because only the frontend knows which fields a screen actually displays. Finding a fifteen-field response behind a three-field screen is a real exposure, and no backend test will flag it.

---

## 12. Test data management

### Factories

Following the TDD's 18.11.1 pattern with fishery and Faker.js, factories are shared between the component suite and the E2E suite so a fixture shape is defined once.

```typescript
export const studentFactory = Factory.define<Student>(({ sequence }) => ({
  id: faker.string.uuid(),
  studentCode: `STU-${String(sequence).padStart(4, '0')}`,
  fullName: faker.person.fullName(),
  dateOfBirth: faker.date.birthdate({ min: 3, max: 18, mode: 'age' }).toISOString().split('T')[0],
  gender: faker.helpers.arrayElement(['Male', 'Female']),
  disabilityCategory: faker.helpers.arrayElement(['Autism', 'Down Syndrome', 'Cerebral Palsy']),
  shiftId: 'morning-shift-id',
  status: 'pending_admission_fee',
  enrollmentDate: new Date().toISOString().split('T')[0],
}));

export const activeStudent = studentFactory.params({ status: 'active' });
```

Named traits are provided for every state a UI must render, because `studentFactory.build({ status: 'active' })` scattered through fifty files is worse than `activeStudent.build()` in all of them.

Factory types come from the generated contract types, so a backend shape change breaks the factories at compile time rather than producing plausible-looking wrong data.

### Deterministic data where it matters

Faker's randomness is right for names and wrong for anything asserted numerically. Financial, payroll, gratuity, aging, and budget fixtures use **fixed hand-computed values** with the expected result stated in the fixture, so a test failure means the code is wrong rather than the data shifted.

```typescript
export const gratuityFixture = {
  basicSalary: 50_000_00,
  serviceYears: 7.5,
  daysPerYear: 30,
  // hand-computed: (50000 / 30) * 30 * 7.5 = 375,000.00
  expectedEntitlement: 375_000_00,
};
```

A global Faker seed is set per test run and logged, so a failure caused by a particular random value is reproducible.

### E2E seeding

Per the TDD's 18.11.2: a seed script establishes a consistent baseline of two academic years, two shifts, one user per role, ten active students, five teachers across shift assignments, eight patients, four therapists, three groups, two complete IEPs, and fee structures. Tests that create data prefix names with the run ID, and teardown deletes run-tagged records through the API so cleanup logic is itself exercised.

Phase 9's UAT environment is seeded far more heavily — 200 students, 60 staff, 150 patients, a full year of attendance, closed fiscal periods — because sparse data hides the performance and pagination problems UAT should surface.

### Sensitive data policy

Per the TDD's 18.11.3, and worth restating because this is a special-needs education and therapy system:

- No real student, patient, or employee name, diagnosis, medical note, or contact detail appears in any fixture, factory, seed script, snapshot, trace, or committed test artefact.
- All personal data is Faker-generated and obviously fictional.
- Production data is never copied to any test or development environment.
- Playwright traces and videos are reviewed for incidental personal data before being attached to a public artefact, and retention follows the TDD's 30-day and 90-day windows.

---

## 13. Coverage requirements and quality gates

The TDD's 18.14 thresholds, as they apply here:

| Layer | Metric | Minimum | Enforced in |
|---|---|---|---|
| Components | Line + branch | 70% | CI stage 2 |
| Hooks and stores | Line + branch | 85% — higher than the component floor because this is where the logic lives | CI stage 2 |
| Pure logic modules (formatters, validation, permissions, calculations, error mapping) | Line + branch | 90% | CI stage 2 |
| Route coverage | Every route in the manifest has at least one component or E2E test | 100% | CI stage 2 |
| Accessibility | Zero violations, component and route level | 100% | CI stages 2 and 7 |
| Visual regression | No unexplained diff beyond 0.2% | 100% | CI stage 6 |
| E2E critical scenarios | Pass rate | 100% | CI stage 5 |
| E2E non-critical | Pass rate | ≥ 95% | CI stage 5 |
| Mutation score (pure logic modules only) | Stryker | ≥ 75% | Weekly |
| Dependencies | No high or critical CVE | 100% | CI stages 1 and 4 |
| Bundle budgets | All budgets met | 100% | CI stage 2 |
| Lighthouse | All ten routes meet all gates | 100% | CI stage 6 |

Coverage is measured on a diff basis as well as absolutely: a PR that drops diff coverage below 70% fails even when the absolute figure is comfortable, which is what stops a large codebase slowly diluting its own standard.

---

## 14. CI pipeline

Aligned with the TDD's 18.13 stage numbering so the two repositories' pipelines are legible side by side.

| Stage | Trigger | Runs | Blocks if |
|---|---|---|---|
| 1 | Every push | ESLint, TypeScript, ESLint security plugin, `npm audit`, Trivy, `contract:check` | Any lint or type error, high or critical CVE, or a contract drift that has not been reviewed |
| 2 | Every push | Component tests, hook and store tests, jest-axe checks, bundle budgets, coverage gates | Any test fails, any coverage threshold missed, any budget exceeded, any a11y violation |
| 3 | Every PR | Contract conformance against the target backend version's OpenAPI document | A response shape the frontend relies on is absent or changed |
| 4 | Every PR | Snyk, token-leakage scan, `dangerouslySetInnerHTML` allowlist, sanitisation tests, CSP verification | Any new high or critical finding, or any security assertion failure |
| 5 | Merge to main | Full Playwright E2E on Chromium, Firefox, WebKit, plus mobile profiles for the high-traffic flows and portal | Any critical scenario fails, or the non-critical pass rate falls below 95% |
| 6 | Merge to main | Visual regression, Lighthouse CI | Any diff beyond 0.2% without an approved baseline update, or any Lighthouse gate missed |
| 7 | Merge to main | Full-page axe scan on every route in every applicable role | Any WCAG 2.1 AA violation |
| 8 | Merge to main | Deploy | Only runs if 1–7 pass |
| 9 | Weekly | Render profiling suite, cache soak test, cross-browser full matrix | Any render budget exceeded or unbounded cache growth |
| 10 | Weekly | Stryker on pure logic modules | Mutation score below 75% |
| 11 | Nightly | Full route a11y scan, dependency audit, pseudo-localisation visual check | New violations or clipping at 40% string expansion |

Feedback-loop targets match the TDD's intent: stages 1–2 under four minutes, the full PR gate (1–4) under twelve minutes, and post-merge stages 5–7 around eighteen minutes with parallel workers. Meeting the four-minute target requires that stage 2 shards the component suite across workers and that no component test touches a real network or a real timer.

---

## 15. Reporting

| Report | Tool | Audience | Access |
|---|---|---|---|
| Coverage trend and PR diff coverage | Codecov | Developers, tech lead | PR comment and dashboard |
| Component and hook results | Jest HTML reporter | Developers | CI artefact |
| E2E results with traces and video on failure | Playwright HTML reporter | Developers, stakeholders | CI artefact, linked in the PR |
| Accessibility violations | axe JSON plus Playwright HTML | Developers, designer | CI artefact; fails the PR |
| Visual diffs | Playwright diff viewer | Developers, designer | CI artefact with side-by-side images |
| Lighthouse and Web Vitals trend | Lighthouse CI server | Tech lead | Dashboard with history |
| Bundle composition and budget status | Build analyser output | Developers | CI artefact per run |
| Mutation report | Stryker HTML | Developers | CI artefact |
| Flake report | Custom summary of retry-passed tests | Tech lead | Weekly GitHub Actions summary |
| WCAG conformance record | Maintained document | Stakeholders, procurement | Repository, updated at each release |

Artefact retention follows the TDD: 30 days generally, 90 days for failed-run traces, videos, and scan reports.

The flake report is an addition rather than a TDD requirement, and it earns its place: without a standing report, retry-passed tests accumulate invisibly until the suite's failures stop being believed, at which point the whole zero-manual-QA position collapses.

---

## 16. Definition of done for testing, per phase

A phase is not complete until all of the following hold. Phase documents may add to this list; none may subtract from it.

- [ ] Every component in the phase's inventory has a test file with behavioural tests, a jest-axe assertion, keyboard operability, and loading and error state assertions.
- [ ] Every required negative path from §4 applies and is present for each applicable component type.
- [ ] Every RBAC visibility rule in the phase is asserted per role, using absence assertions where the phase specifies absence rather than disablement.
- [ ] Every query hook's key, stale time, and refetch configuration are asserted.
- [ ] Every mutation hook's invalidation set is asserted exhaustively, in both directions.
- [ ] Every optimistic mutation has an appear, roll-back, and reconcile test.
- [ ] All MSW handlers used are generated from the current contract, with scenario overrides named rather than inlined.
- [ ] `onUnhandledRequest: 'error'` is in force and the suite passes under it.
- [ ] Every E2E scenario listed in the phase document passes on all three desktop browsers.
- [ ] Full-page axe scans pass with zero violations on every route the phase adds, in every applicable role.
- [ ] Visual regression baselines exist for every state and viewport the phase lists.
- [ ] Coverage thresholds from §13 are met, including on the diff.
- [ ] No test uses a fixed wait, a shared query client, or an uncontrolled clock where dates affect the outcome.
- [ ] No fixture, snapshot, or trace contains data resembling real personal information.
- [ ] The flake report shows no retry-passed test introduced by the phase.
