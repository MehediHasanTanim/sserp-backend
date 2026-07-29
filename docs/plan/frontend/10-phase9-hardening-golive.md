# Frontend Phase 9 — Hardening, Accessibility Certification & Go-Live

| Field | Value |
|---|---|
| Duration | 3 weeks |
| Prerequisites | Frontend Phase 0–8 complete; Backend Phase 9 in progress |
| Feature list coverage | No new features; closes non-functional requirements across all modules |
| Backend counterpart | [backend/10-phase9-hardening-golive.md](../backend/10-phase9-hardening-golive.md) |

---

## 1. Objective and scope

This phase adds no screens. It proves that what was built meets the non-functional requirements the TDD states, and it closes the gaps that accumulate when nine phases are built in sequence.

The framing matters: a phase with no features tends to be the first thing cut when a schedule slips. It should not be, because the four things it delivers are exactly the four things users notice first and complain about longest — the application is slow, it breaks on my phone, my screen reader cannot use it, and it lost my work when the network dropped.

**In scope**

- Performance: bundle budgets, code splitting audit, Core Web Vitals, render profiling of the heaviest screens
- Accessibility certification: full WCAG 2.1 AA audit across every route, screen reader verification, keyboard-only verification, contrast and zoom verification
- Responsive certification across the supported viewport range for every route
- Cross-browser verification
- Offline and degraded-network resilience beyond the two flows already built
- Security hardening: CSP, dependency audit, token handling review, XSS surface review, sensitive-data-in-client review
- Error handling and observability: error boundaries, client error reporting, correlation with backend request IDs
- Session and idle handling
- Print stylesheets for the documents users actually print
- i18n readiness verification
- UAT support: seeded demo environment, feedback triage, defect fixes
- Production build, deployment, and post-launch monitoring

---

## 2. Performance hardening

### Bundle budgets

Enforced in CI; a build exceeding a budget fails rather than warns, because a soft budget is not a budget.

| Target | Budget |
|---|---|
| Initial shared JS (gzipped) | ≤ 180 KB |
| Per-route first-load JS | ≤ 250 KB |
| Largest single route first-load JS | ≤ 320 KB — permitted only for the therapy calendar and the report shell, and named explicitly in the budget file so an exception is a deliberate decision |
| CSS total | ≤ 60 KB |
| Font payload | ≤ 100 KB, subset, `font-display: swap` |

### Code splitting audit

Every heavy dependency is verified to be absent from the shared bundle and loaded only on the routes that need it.

| Dependency | Must load only on |
|---|---|
| FullCalendar | therapy calendar, timetable |
| Recharts | dashboards, reports with charts, gratuity provision chart |
| The rich text editor | announcement editor, IEP builder, progress report editor, session notes |
| The PDF preview library | attachment previews, statement views |
| The report builder | `/reports/builder` only |

A CI check inspects the build manifest and fails if a named dependency appears in the shared chunk. This is worth automating because a single stray top-level import silently doubles the initial bundle and nobody notices for months.

### Core Web Vitals

Measured with Lighthouse CI on a throttled mid-range mobile profile, on ten representative routes: login, dashboard (principal), student list, student profile, therapy calendar, journal entry form, payroll run detail, stock level grid, a financial report, and the parent portal home.

| Metric | Target |
|---|---|
| LCP | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| TTFB | ≤ 800 ms |
| Lighthouse performance score | ≥ 85 |
| Lighthouse accessibility score | 100 |

### Render profiling

The heaviest interactions are profiled and given explicit budgets, so a regression is measurable rather than a matter of opinion.

| Interaction | Budget |
|---|---|
| Therapy calendar week view with 200 sessions, initial render | ≤ 1 s |
| Therapy calendar navigation between weeks | ≤ 300 ms |
| Attendance grid with 40 students, mark-all | ≤ 100 ms |
| Journal entry form, keystroke to balance-strip update | ≤ 50 ms |
| Stock level grid with 500 items × 10 locations | ≤ 1 s, virtualised |
| Report result table, 10,000 rows | ≤ 1 s, virtualised |
| Report result sort, 10,000 rows | ≤ 300 ms |
| Payroll slip table with 200 employees | ≤ 500 ms |
| Applicant pipeline board with 200 applicants | ≤ 500 ms |

Any list rendering more than 200 rows must be virtualised; a test asserts a bounded DOM node count for each of the five largest tables.

### Query and cache tuning

- Audit every query for an appropriate `staleTime`; the default of zero is correct for availability checks and wrong for reference data, and both mistakes exist by this point in a nine-phase build.
- Verify prefetching on the navigation paths users actually take: student list → student profile, calendar → session detail, PO list → PO detail.
- Verify that no query holds more cache than it needs; `gcTime` on large report results is bounded.
- Confirm no unbounded cache growth in a long session, measured by a soak test that navigates for thirty minutes and checks the cache entry count and heap size.

---

## 3. Accessibility certification

Accessibility has been a per-phase requirement throughout. This phase certifies the whole rather than the parts, because the failures that survive per-phase testing are the cross-cutting ones: focus order across a route change, a landmark structure that only makes sense per page, a skip link that lands somewhere unhelpful.

### Automated audit

- axe-core scan on **every route** in the route manifest, in every applicable role context. The manifest is enumerated programmatically so a route added without a scan fails the build.
- Zero violations at the serious and critical levels; moderate violations are individually triaged and either fixed or recorded with a justification in an accessibility conformance record.
- Contrast verification across both themes and every status colour, including the disabled and placeholder states that automated tools frequently miss because they are rendered conditionally.

### Manual verification

| Area | Verification |
|---|---|
| Screen readers | NVDA on Windows and VoiceOver on macOS and iOS across the fifteen highest-traffic flows: login, student enrollment, attendance entry, IEP creation, fee payment, session scheduling, session notes, journal entry, payroll review, leave request, count sheet entry, GRN entry, report run, messaging, parent portal fee payment |
| Keyboard-only | The same fifteen flows completed with no pointer at all, verifying no keyboard traps, visible focus at every step, and logical order |
| Focus management | On route change focus moves to the main heading; on dialog open focus enters the dialog and on close returns to the trigger; on validation failure focus moves to the first invalid field; on async completion the result region is announced without stealing focus |
| Landmarks and headings | One `main` per page, a single `h1`, no skipped levels, a skip link that lands on `main` |
| Zoom and reflow | 200% browser zoom and 400% with reflow at 320px width; no horizontal scrolling for text content and no loss of function |
| Reduced motion | `prefers-reduced-motion` respected by every animation, including the calendar transitions and the tile update highlight |
| Forced colours | Windows high-contrast mode renders every status, selection, and focus state distinguishably |
| Text spacing | The WCAG text-spacing criterion applied without clipping |
| Touch targets | Minimum 44×44 CSS pixels for every interactive element on touch viewports, verified on the densest screens: attendance grid, calendar, count sheet, journal grid |

### Conformance record

A WCAG 2.1 AA conformance record is produced listing each success criterion, its status, the verification method, and any recorded exception with justification. This is the artefact that answers a procurement or regulatory question later, and reconstructing it after the fact is far more work than producing it now.

---

## 4. Responsive certification

Every route verified at 360, 414, 768, 1024, 1440, and 1920 px width, plus 360px at 200% zoom.

Particular attention to the screens whose mobile behaviour was designed as a deliberate departure rather than a reflow, since these are where a regression is most likely:

| Screen | Verified mobile behaviour |
|---|---|
| Attendance grid | Card-per-student with quick actions |
| Therapy calendar | Agenda list rather than a grid |
| Stock level matrix | Per-item cards listing locations |
| Count sheet | Single-item stepper |
| Journal entry grid | Line-by-line stepper with the balance strip pinned |
| Report tables | Horizontal scroll with a pinned first column and a labelled, focusable scroll region |
| Three-way match | Per-line cards with the verdict pinned |
| Messaging | Separate list and thread screens |
| Notification preferences | Per-type cards |
| Parent portal | Mobile-first throughout, verified as the primary rather than the fallback experience |

Orientation change is verified on the calendar, attendance grid, and count sheet, since these are the screens where a rotation mid-task is plausible.

---

## 5. Cross-browser verification

| Browser | Scope |
|---|---|
| Chrome and Edge, current and current−1 | Full regression suite |
| Firefox, current | Full regression suite |
| Safari, current and current−1 (macOS) | Full regression suite, with particular attention to date input behaviour, `Intl` formatting, and sticky positioning in the journal grid and balance strips |
| Safari iOS, current and current−1 | The fifteen high-traffic flows plus the entire parent portal |
| Chrome Android, current | The fifteen high-traffic flows plus the entire parent portal |

Safari-specific risks are called out because they are the ones that reliably appear late: date and time input rendering, `100vh` behaviour with the mobile toolbar, sticky element repainting, and `Intl.NumberFormat` currency spacing differences that make money figures look wrong in screenshots.

---

## 6. Offline and degraded network

Two flows already handle degradation by design — the attendance grid from Phase 1 and the audit count sheet from Phase 6. This phase extends resilience to the rest of the application and verifies it under real conditions.

| Behaviour | Requirement |
|---|---|
| Offline detection | A persistent, dismissible indicator when the browser reports offline, stating what still works |
| Mutation queue | A shared queue with retry and backoff, used by attendance, count sheets, session notes, and messaging — the four flows where losing input is most costly |
| Queue visibility | A pending-changes indicator with a count and a detail view listing what is queued, so a user never has to guess whether their work was saved |
| Queue persistence | Survives a reload and a browser restart, keyed per user so a queue never leaks across accounts |
| Conflict on flush | If a queued mutation conflicts with a server-side change, the conflict is surfaced with both values and the user chooses; nothing is silently discarded or silently overwritten |
| Read caching | Recently viewed reference data remains readable offline with a clear stale indicator |
| Slow network | Verified at 3G throttling: every action shows progress within 100 ms of the interaction, and no interaction appears to do nothing |
| Timeout handling | A request timeout produces a retryable error, never a blank screen or an infinite spinner |
| Long-running jobs | Payroll calculation and export jobs survive a navigation and a reload, resuming their progress display |

The conflict-on-flush rule is the one that requires real thought rather than a library: two teachers marking the same student's attendance from two offline devices is a realistic scenario, and both "last write wins silently" and "throw away the second one" are wrong answers.

---

## 7. Security hardening

| Item | Requirement |
|---|---|
| Content Security Policy | Enforced with no `unsafe-inline` and no `unsafe-eval`; nonce-based for the framework's inline needs; violation reporting enabled and monitored |
| Other headers | `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and frame-ancestors restriction |
| Token handling review | The access token is never written to `localStorage` or `sessionStorage`; the refresh token is only ever an HttpOnly cookie; no token appears in a URL, a log, an error report, or an analytics payload — verified by an automated scan of the built bundle and of captured network traffic during the E2E suite |
| XSS surface review | Every use of `dangerouslySetInnerHTML` enumerated and justified; all rich text output sanitised; the sanitiser configuration reviewed against the rich text features actually enabled in the IEP builder, progress report editor, session notes, and announcement editor |
| Sensitive data in the client | An audit that no more sensitive data is delivered to the client than a screen displays — particularly salary figures, medical notes, and parent contact details, where an over-broad API response is invisible in the UI but a real exposure. Where found, the backend contract is narrowed rather than the field hidden in the UI |
| Dependency audit | `npm audit` with no high or critical findings; Snyk in CI; a documented policy for accepted moderate findings with review dates |
| Supply chain | Lockfile integrity enforced; no post-install scripts from untrusted packages; dependency additions reviewed |
| Source maps | Not served in production, or served only to an authenticated internal endpoint |
| Error reporting | Client error reports scrubbed of tokens, personal data, and request bodies before transmission |
| Clickjacking | Frame embedding denied |
| File upload | Client-side type and size validation present as usability, with the statement in code review that the server validation is authoritative |
| Session timeout | Idle timeout per the configured policy, with a warning dialog before expiry offering to extend, and a graceful redirect that preserves the intended destination for post-login return |
| Concurrent session handling | A revoked or invalidated session results in a clean logout with an explanation, not a cascade of failed requests |

The "sensitive data in the client" audit deserves emphasis. Nine phases of building against a convenient API tends to produce endpoints that return whole records, and a UI that shows three fields of a fifteen-field response has still transmitted fifteen fields to a browser that may not be entitled to them.

---

## 8. Error handling and observability

| Item | Requirement |
|---|---|
| Error boundaries | At the app, route-group, and heavy-widget levels, so a chart failure never blanks a dashboard and a route failure never blanks the shell |
| Error boundary content | States what failed, offers a retry and a route home, and shows a correlation ID the user can quote to support |
| Correlation | The backend request ID is captured from responses and included in client error reports and in the user-visible error state, so a support conversation can be traced to a server log |
| Client error reporting | Unhandled errors, unhandled rejections, and error boundary catches reported with route, role, and correlation ID, scrubbed of sensitive data |
| Error taxonomy | The Phase 0 error mapping reviewed for completeness against the backend's final error code catalogue; any unmapped code produces a generic message and is reported as a gap rather than displaying a raw code |
| Empty, loading, and error states | Audited for presence on every list, detail, and form route — a missing empty state is a common late-build gap that makes a working feature feel broken |
| Real user monitoring | Core Web Vitals reported from production with route and role dimensions |
| Feature-level logging | Enough breadcrumbs on the money-bearing flows (journal entry, payroll lock, fee payment, GRN) to reconstruct a user's path when they report a discrepancy |

---

## 9. Print stylesheets

Users print more than teams expect. Print styles are provided and verified for the documents that are genuinely printed:

Student profile summary, IEP document, progress report, fee invoice and receipt, therapy session summary, treatment plan, payslip, gratuity settlement letter, journal voucher, payment voucher, cheque register, trial balance, P&L, balance sheet, purchase order, GRN, vendor invoice, audit count sheet, and discrepancy report.

Each verified for: correct page breaks with no orphaned table headers, repeated headers on multi-page tables, no navigation or interactive chrome, black-on-white legibility, and the organisation identity and generation timestamp in the header or footer.

---

## 10. Internationalisation readiness

The initial release is single-language, but the cost of retrofitting i18n is high enough that readiness is verified now rather than assumed.

- No user-facing string literal in a component; all text through the translation layer, verified by a lint rule.
- Date, time, number, and currency formatting exclusively through the shared formatters, never through string concatenation or manual formatting.
- Layout verified against a pseudo-localised locale with 40% string expansion, which reveals every fixed-width label and truncating container.
- RTL readiness assessed and recorded: logical CSS properties used where practical, with any known RTL gaps documented rather than discovered later.
- Locale-sensitive sorting through `Intl.Collator`.

---

## 11. UAT support

| Activity | Detail |
|---|---|
| Demo environment | A seeded environment with realistic volumes: 200 students, 60 staff, 150 patients, a full academic year of attendance, two closed fiscal periods with posted journals, and populated inventory and procurement chains. Sparse demo data hides exactly the problems UAT should find. |
| Role walkthroughs | Guided scripts for each of the nine roles covering their daily flows |
| Feedback capture | An in-app feedback affordance in the UAT build capturing the route, role, and correlation ID automatically, since a bug report without context costs more to triage than to fix |
| Triage | Daily triage with severity classification; blockers fixed within the phase, non-blockers recorded with a decision |
| Regression | The full automated suite re-run after each fix batch |
| Training material | Screen-by-screen material for the flows each role performs daily, produced from the finished UI rather than mock-ups |

---

## 12. Go-live

| Item | Detail |
|---|---|
| Production build | Verified against all bundle budgets; environment configuration externalised with no build-time secrets |
| Deployment | Container image, health check endpoint, and a rollback verified by an actual rollback rehearsal rather than a documented procedure |
| Smoke suite | A short post-deploy suite covering login, one read, one write, and one money-bearing flow per module, runnable against production |
| Monitoring | Real user monitoring, error rate, and Web Vitals dashboards live before launch, with alert thresholds set |
| Launch checklist | CSP enforced, source maps withheld, error reporting scrubbing verified, session timeout configured, accessibility conformance record filed, print styles verified, rollback rehearsed, monitoring live, on-call rota agreed |
| Post-launch | A defined watch period with daily review of error rates, Web Vitals, and user feedback, and a documented hotfix path |

---

## 13. Tests owed by this phase

### Performance tests

- Lighthouse CI on the ten representative routes against the metric targets; a regression beyond threshold fails the build.
- Bundle budget assertions per route from the build manifest.
- The code-splitting manifest check for the five named heavy dependencies.
- Render profiling assertions for the nine interactions in section 2, run in CI with a tolerance band to accommodate runner variance while still catching real regressions.
- Virtualisation assertions with bounded DOM node counts for the five largest tables.
- A thirty-minute navigation soak test asserting bounded cache entry count and heap growth.

### Accessibility tests

- axe-core on every route in the enumerated manifest, per applicable role, with zero serious or critical violations.
- A route-manifest completeness test so a new route cannot ship without a scan.
- Focus-management assertions: route change, dialog open and close, validation failure, and async completion — asserted generically across a representative sample of twenty routes rather than only per-feature.
- Contrast assertions across both themes and every status colour including disabled and placeholder states.
- Reduced-motion assertions on the calendar, tile highlight, and dialog transitions.
- Touch-target size assertions on the four densest screens.
- Text-spacing and 400% reflow assertions on twenty representative routes.

### Responsive tests

- Visual regression at six widths for every route, plus 360px at 200% zoom for the twenty highest-traffic routes.
- Behavioural assertions for each of the ten deliberate mobile departures in section 4.
- Orientation-change assertions on the calendar, attendance grid, and count sheet.

### Cross-browser tests

- The full Playwright suite on Chromium, Firefox, and WebKit.
- The fifteen high-traffic flows plus the parent portal on mobile Safari and Chrome Android profiles.
- Safari-specific assertions for date inputs, `Intl` currency formatting, sticky positioning, and viewport-height behaviour.

### Offline and network tests

| ID | Scenario |
|---|---|
| `OFF-E2E-01` | Mark attendance for 30 students offline → the pending indicator shows the count → the detail view lists the queued changes → reconnect → all persist |
| `OFF-E2E-02` | Enter a count sheet offline, reload the browser, and confirm the queue survived with its entries intact |
| `OFF-E2E-03` | Write a session note offline → reconnect → it saves; the same note edited server-side in the interim produces a conflict showing both values and requiring a choice |
| `OFF-E2E-04` | Two devices mark the same student's attendance offline with different values → on flush the conflict is surfaced rather than silently resolved |
| `OFF-E2E-05` | A queue created by user A is not visible or flushable by user B on the same browser |
| `OFF-E2E-06` | 3G throttling: every primary action shows progress within 100 ms |
| `OFF-E2E-07` | A request timeout produces a retryable error and the retry succeeds |
| `OFF-E2E-08` | A payroll calculation and a report export both survive a reload and resume their progress display |

### Security tests

- An automated scan of the built bundle and of E2E-captured network traffic for tokens in URLs, storage, logs, or error payloads.
- CSP violation reporting verified with a deliberately injected violation in a test build.
- An enumeration test listing every `dangerouslySetInnerHTML` usage and asserting each is in the approved list.
- Sanitisation tests: a stored XSS payload in each of the four rich text surfaces renders inert.
- API response field audit for the three sensitive surfaces (salary, medical, parent contact), asserting the response contains no field beyond the documented contract.
- Session timeout: the warning appears, extension works, expiry redirects cleanly, and the intended destination is preserved.
- Session revocation produces a clean logout rather than cascading failures.
- `npm audit` and Snyk gates in CI.

### Error handling tests

- Error boundary tests at each of the three levels, asserting the correlation ID is displayed and a retry works.
- A client error report is emitted with route, role, and correlation ID, and scrubbed of tokens and personal data.
- Every backend error code in the final catalogue maps to a user-facing message; an unmapped code produces the generic message and a reported gap.
- Empty, loading, and error state presence asserted across every list, detail, and form route by enumeration.

### Print tests

- Visual regression on the print stylesheet output for all nineteen documents in section 9, including a multi-page case for each table-based document to verify repeated headers.

### i18n tests

- The lint rule for hard-coded strings passes with no exceptions.
- Pseudo-localisation visual regression at 40% expansion on the forty highest-traffic routes.
- Formatter usage enforced by lint; no manual date or currency formatting anywhere.

---

## 14. Exit criteria

Global Definition of Done, plus:

- [ ] All bundle budgets met and enforced as build failures.
- [ ] The code-splitting check passes for all five named heavy dependencies.
- [ ] Core Web Vitals targets met on all ten representative routes at mobile throttling.
- [ ] Lighthouse accessibility score of 100 on all ten routes.
- [ ] All nine render-profiling budgets met.
- [ ] The five largest tables are virtualised with bounded DOM node counts.
- [ ] The soak test shows no unbounded cache or heap growth.
- [ ] axe-core reports zero serious or critical violations on every route in the manifest, in every applicable role.
- [ ] The route-manifest completeness test prevents an unscanned route from shipping.
- [ ] Manual screen reader verification completed on the fifteen high-traffic flows with NVDA, VoiceOver desktop, and VoiceOver iOS.
- [ ] All fifteen flows completable keyboard-only with no traps and visible focus throughout.
- [ ] 200% zoom and 400% reflow verified with no function loss.
- [ ] Touch targets meet 44×44 px on the four densest screens.
- [ ] The WCAG 2.1 AA conformance record is filed, with every exception justified.
- [ ] Every route verified at six viewport widths, and all ten deliberate mobile departures behave as specified.
- [ ] The full suite passes on Chromium, Firefox, and WebKit, and the high-traffic flows pass on mobile Safari and Chrome Android.
- [ ] The shared mutation queue covers attendance, count sheets, session notes, and messaging, survives a browser restart, is scoped per user, and surfaces conflicts for user resolution.
- [ ] CSP is enforced without `unsafe-inline` or `unsafe-eval`, with violation reporting live.
- [ ] The token-handling scan finds no token in storage, URLs, logs, or error payloads.
- [ ] Every `dangerouslySetInnerHTML` usage is enumerated and justified, and all four rich text surfaces render injected payloads inert.
- [ ] The sensitive-data audit is complete and any over-broad response has been narrowed in the backend contract.
- [ ] No high or critical dependency findings.
- [ ] Error boundaries exist at all three levels and display a correlation ID that traces to a backend log.
- [ ] Every backend error code maps to a user-facing message.
- [ ] Empty, loading, and error states exist on every list, detail, and form route.
- [ ] Print stylesheets verified for all nineteen documents, including multi-page header repetition.
- [ ] The hard-coded-string lint rule passes and pseudo-localisation at 40% expansion reveals no clipping on the forty highest-traffic routes.
- [ ] UAT completed for all nine roles against a realistically seeded environment, with all blockers resolved.
- [ ] A rollback has been rehearsed, not merely documented.
- [ ] Monitoring, alerting, and the post-deploy smoke suite are live before launch.
