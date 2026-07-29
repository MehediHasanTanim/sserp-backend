# Frontend Phase 7 — Reports, Analytics & Dashboards

| Field | Value |
|---|---|
| Duration | 3 weeks |
| Prerequisites | Frontend Phase 0–6; Backend Phase 7 contract published |
| Feature list coverage | 8.1–8.7 (Report Module), 12.1–12.3 (Dashboard & Analytics) |
| Backend counterpart | [backend/08-phase7-reports-dashboard.md](../backend/08-phase7-reports-dashboard.md) |

---

## 1. Objective and scope

Every prior phase deliberately deferred its reports and dashboard tiles to here. That was the right call for build order but it means this phase has a breadth problem: roughly sixty named reports across seven domains, plus seven role-specific dashboards. Building sixty bespoke pages would be both slow and inconsistent.

So the whole phase rests on one decision: **there is one report shell, and every report is configuration inside it.** A report page supplies a report key, a parameter schema, and a column definition; the shell supplies the parameter form, the run-and-cancel lifecycle, the result table with grouping and totals, the drill-through wiring, the export menu, the schedule action, and every accessibility affordance. Adding a report becomes a definition file, not a page.

The dashboard follows the same logic: one grid, a tile registry, and per-role layouts.

**In scope**

- Report framework: shell, parameter form generation, result rendering, drill-through, export, scheduling
- All named reports for School, Therapy, HR, Accounts, Finance, Inventory, Procurement
- Async export pipeline UI: request, progress, download, history
- Custom report builder
- Scheduled report management with email delivery configuration
- Role-based dashboards for all seven dashboard roles with KPI tiles, charts, alert panels, and quick actions
- Data-freshness indication wherever a figure comes from a materialised view

**Out of scope**

- The notification bell and real-time push into dashboards — Phase 8 (dashboards poll in this phase and switch to push in Phase 8 without a UI change)

---

## 2. Prerequisites

- All prior phases' domain routes exist, since drill-through targets them.
- Backend Phase 7 contract including the report registry endpoint, the async export job endpoints, and the materialised-view freshness metadata.
- Phase 4 `MoneyDisplay` and the accounting drill-through routes.

---

## 3. Routes and page tree

```
app/(app)/reports/
├── page.tsx                               # report catalogue, filtered by permission
├── [reportKey]/page.tsx                   # the report shell, driven by the registry
├── builder/
│   ├── page.tsx                           # saved custom reports
│   ├── new/page.tsx                       # builder
│   └── [id]/page.tsx
├── scheduled/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
└── exports/page.tsx                       # export job history + downloads

app/(app)/dashboard/page.tsx               # resolves the tile layout for the caller's role
```

A single dynamic `[reportKey]` route is the mechanism that makes sixty reports tractable. The catalogue page lists only reports the caller may run, and a direct URL to a forbidden report renders the standard forbidden state rather than an empty shell.

---

## 4. Report framework

### `ReportShell`

The shell owns the entire report lifecycle so no individual report re-implements it.

- **Parameter panel** generated from the report's parameter schema, supporting date, date range, fiscal period, select, multi-select, entity picker (student, patient, employee, vendor, account, cost center), boolean, and numeric range parameter types. Parameters marked required block the run action, with the missing ones named.
- **Run lifecycle**: idle → running → success or error. A run in progress shows elapsed time and a cancel action. Cancelling aborts the request and returns to idle with the previous result retained rather than cleared, because losing a result you were reading is worse than a stale header.
- **Result region** with the row count, the parameters the result was produced with restated in a compact summary, and the data-freshness indicator where applicable.
- **Result table** via a `ReportTable` supporting column groups, row grouping with subtotals, a grand-total row, per-column alignment and formatting by type (money, quantity, percentage, date, text), sorting, and column visibility toggles.
- **Drill-through** on cells the definition marks as drillable, navigating to the domain route with the filter pre-applied. Every money figure in every financial report is drillable to its ledger lines.
- **Export menu** offering the formats the definition allows, dispatching to the async pipeline for large results and downloading directly for small ones, with the threshold handled by the backend and the choice invisible to the user beyond a progress indicator appearing.
- **Schedule action** opening the schedule form pre-filled with the current parameters — the natural moment a user wants a report emailed is right after running it.
- **Empty state** that distinguishes "no rows matched these parameters" from "not run yet", and names the parameters most likely responsible.
- **Error state** mapping backend errors, including a timeout, with a suggestion to narrow the date range for a timeout rather than a bare failure message.

### Report definition shape

```typescript
type ReportDefinition = {
  key: string;
  title: string;
  domain: 'school' | 'therapy' | 'hr' | 'accounts' | 'finance' | 'inventory' | 'procurement';
  description: string;                 // shown in the catalogue and as the page subtitle
  permissions: string[];
  parameters: ReportParameter[];
  columns: ReportColumn[];             // type, alignment, format, drillTo, groupable
  defaultGrouping?: string;
  totals?: { column: string; type: 'sum' | 'avg' | 'count' }[];
  exportFormats: ('pdf' | 'excel' | 'csv')[];
  chart?: ReportChartConfig;           // optional visualisation alongside the table
  freshness?: 'live' | 'materialized';
};
```

Definitions live in `features/reports/definitions/<domain>.ts`. A test enumerates the registry and asserts that every report in the feature list has a definition, which is how sixty reports stay honest.

### The report catalogue

| Component | Notes |
|---|---|
| `ReportCatalogue` | Grouped by domain with search across titles and descriptions. Each card shows the title, description, and last-run time for the current user, since users re-run the same handful of reports constantly. |
| `ReportFavourites` | Pinned reports at the top, per user. |

### Named reports by domain

The definitions cover, at minimum, every report named in the feature list:

| Domain | Reports |
|---|---|
| School | Student list and demographics, enrollment trend, attendance summary and defaulters, IEP status, progress report status, fee collection, fee defaulters, discount register, activity participation, health incident log, behavioral incident log, student leave summary |
| Therapy | Session summary by therapist and by patient, therapist utilisation, session cancellation and no-show analysis, patient progress, treatment plan status, waiting list ageing, group occupancy, therapy revenue, outstanding therapy fees |
| HR | Employee list and demographics, joining and exit trend, attendance summary and late arrivals, leave balance and leave utilisation, payroll register, salary component summary, statutory deduction summary, gratuity liability and provision movement, encashment register, appraisal status, recruitment funnel, training attendance and cost, loan outstanding |
| Accounts | Trial balance, general ledger, day book, cash and bank book, receipts and payments, income and expenditure, P&L, balance sheet, cash flow, receivables and payables ageing, cheque register, bank reconciliation status, tax liability, budget variance and utilisation, cost-center profitability |
| Finance | Shareholder register, share transfer history, reserve fund movement, profit appropriation history, dividend register, withholding tax summary |
| Inventory | Stock levels, stock movement, low stock, expiring items, valuation, asset register, asset assignment, depreciation, audit discrepancy, disposal register |
| Procurement | Vendor list and performance, purchase request status, purchase order status, pending deliveries, GRN register, three-way match exceptions, vendor invoice ageing, procurement spend by category and by vendor |

Each is a definition file entry, not a page.

### Export pipeline

| Component | Notes |
|---|---|
| `ExportMenu` | Format selection; on dispatch shows an inline progress indicator that survives navigation, because a user should not have to sit on the report page while a large PDF renders. |
| `ExportJobToast` | Persistent, dismissible progress with a download action on completion and a retry on failure. |
| `ExportHistoryTable` | Report, parameters, format, requested time, status, size, download link with the expiry stated. Expired links say so rather than failing on click. |

### Custom report builder

| Component | Notes |
|---|---|
| `ReportBuilder` | Data-source selection from the permitted set, then field selection, filters, grouping, sorting, and aggregate configuration — all through structured pickers. **No free-text SQL or expression input exists anywhere in this UI**, because the backend's security model depends on the client never constructing a query. |
| `BuilderFieldPicker` | Available fields for the chosen source with type indicators; fields the caller's role may not see are absent, not disabled. |
| `BuilderFilterRow` | Field, operator appropriate to the field type, and a value input appropriate to the field type. |
| `BuilderPreview` | Runs against a limited row count with the limit stated, so a user can iterate quickly without expensive runs. |
| `SavedReportTable` | Saved definitions with owner, sharing state, and a run action that opens the same `ReportShell`. |

### Scheduling

| Component | Notes |
|---|---|
| `ScheduleForm` | Report, parameters (with relative date options such as "previous month" rather than fixed dates, since a fixed date in a recurring schedule is almost always a mistake), frequency, day and time, format, recipients, and an active toggle. |
| `SchedulePreview` | The next three run dates and the parameter values those runs would use — the only way a user can confirm a relative-date schedule does what they meant. |
| `ScheduleTable` | Schedules with last run status, next run, and recipient count. A failed last run is prominent with the error and a run-now action. |
| `ScheduleRunHistory` | Per-schedule history with delivery status per recipient. |

---

## 5. Dashboards

### `DashboardGrid`

- A responsive grid that resolves a per-role layout from a registry: which tiles, in what order, at what size.
- Tiles load independently. One failing tile shows its own error with a retry and does not blank the dashboard — a dashboard that dies because one KPI query timed out is worse than no dashboard.
- Each tile carries its own freshness indicator when backed by a materialised view.
- Tile order is fixed per role in this phase; user customisation is explicitly out of scope.

### Tile types

| Tile | Notes |
|---|---|
| `KpiTile` | A single figure with a label, an optional comparison against the previous period stated as both a delta and a direction word, and a click-through to the underlying report or list. |
| `ChartTile` | Recharts line, bar, or pie with an accessible data table alternative always present — collapsed by default but in the DOM and reachable, not rendered on demand. |
| `ListTile` | A short ranked or recent list with a "view all" link. |
| `AlertTile` | Items needing attention with counts and direct action links — low stock, expiring documents, overdue invoices, pending approvals. |
| `QuickActionTile` | Role-appropriate primary actions, so the dashboard is a starting point rather than only a summary. |

### Role layouts

| Role | Tiles |
|---|---|
| Principal | Enrollment and student count, staff count, monthly collection versus target, outstanding receivables, monthly surplus, pending approvals across every module with counts, attendance summary for students and staff, therapy utilisation, budget utilisation, incident alerts |
| Accountant | Cash and bank balances by account, today's receipts and payments, receivables and payables ageing summaries, unposted drafts, unreconciled bank lines, cheques pending clearance, period close status, budget variance alerts, tax liability due |
| HR Officer | Headcount and joining and exit this month, today's attendance summary, pending leave approvals, pending encashment approvals, payroll run status, gratuity liability, appraisal cycle progress, recruitment funnel, expiring employee documents |
| Teacher | My students, today's attendance entry status with a direct action, IEP reviews due, progress reports due, my leave balance, today's timetable, my substitute assignments |
| Therapist | Today's sessions with a status action per session, this week's schedule summary, pending session notes with a count and direct action, treatment plan reviews due, my patients, my utilisation this month |
| Coordinator | Today's session overview across therapists, unassigned waiting-list patients, room and slot conflicts, therapist availability, today's cancellations and no-shows, pending group enrollments |
| Parent | My children's attendance this month, upcoming sessions, outstanding fees with a pay action, latest progress report, recent notices, unread messages |

**Pending session notes** on the therapist dashboard and **today's attendance entry status** on the teacher dashboard are the two tiles that most change daily behaviour, because they turn the dashboard into a work queue rather than a report.

---

## 6. Server state

### Query keys

```typescript
reports: {
  registry: [...],
  catalogue: [...],                                  // permitted reports for the caller
  run: (reportKey, params) => ['reports','run',reportKey,params],
  builder: { sources: [...], fields: (source) => [...], saved: (f) => [...], saved1: (id) => [...],
             preview: (definition) => [...] },
  schedules: (f) => [...], schedule: (id) => [...], scheduleHistory: (id) => [...],
  exports: (f) => [...], exportJob: (id) => [...],
  lastRun: (reportKey) => [...], favourites: [...],
},
dashboard: {
  layout: (role) => [...],
  tile: (tileKey, params) => ['dashboard','tile',tileKey,params],
}
```

### Caching policy

Report results and dashboard tiles are the one place where aggressive caching is correct, because these queries are expensive and their inputs rarely change within a session.

| Query | staleTime | gcTime | Notes |
|---|---|---|---|
| `reports.registry`, `catalogue` | 1 hour | 1 hour | Effectively static per session |
| `reports.run` | 5 minutes | 15 minutes | Keyed by parameters, so re-running with the same parameters within five minutes is instant; an explicit refresh action always bypasses |
| `builder.sources`, `builder.fields` | 1 hour | 1 hour | Static |
| `builder.preview` | 0 | 1 minute | The user is iterating |
| `dashboard.tile` | 2 minutes | 10 minutes | With `refetchOnWindowFocus` enabled, so returning to a tab refreshes without a manual action |
| `exportJob` | polled at 2 s while pending or processing, then stopped | | Same pattern as the payroll run status |

Every report and tile also exposes a manual refresh that sets `staleTime: 0` for that one fetch, so a user who has just posted a journal can force a re-read without waiting or reloading.

### Freshness indication

Where a report or tile is backed by a materialised view, the response carries the view's last refresh time and the UI states it in words ("Figures as of 2:00 PM today"). Silently showing stale figures is the fastest way to destroy trust in a reporting module, and a relative timestamp with no absolute value is not enough for an accountant.

### Invalidation

Reports are read-only, so the invalidation direction is inbound: mutations from other phases must invalidate report and dashboard state. A shared helper is added and called from the relevant mutation sets.

```typescript
invalidateReportsFor(domain: ReportDomain)
// invalidates reports.run for every definition in that domain,
// plus dashboard.tile for every tile whose domain matches
```

| Mutation domain | Effect |
|---|---|
| Any accounting posting, including all outbound postings from HR, school, therapy, inventory | `invalidateReportsFor('accounts')` and `invalidateReportsFor('finance')` |
| Attendance, enrollment, fee, IEP, progress report changes | `invalidateReportsFor('school')` |
| Session, treatment plan, therapy billing changes | `invalidateReportsFor('therapy')` |
| Payroll, gratuity, leave, recruitment, training changes | `invalidateReportsFor('hr')` |
| Stock movements, assets, audits | `invalidateReportsFor('inventory')` |
| PR, PO, GRN, invoice changes | `invalidateReportsFor('procurement')` |

Because materialised views refresh on a schedule rather than on write, invalidating the query does not guarantee fresh figures — which is precisely why the freshness indicator exists rather than being optional polish.

---

## 7. Client state

- `reportParamStore` — per report key, the last-used parameters, persisted to `sessionStorage`. Re-entering a report you ran five minutes ago should not mean re-entering six parameters.
- `exportJobStore` — active export jobs so the progress toast survives navigation.
- `builderDraftStore` — the custom report definition being edited.
- `dashboardStore` — per-tile loading and error state and the last manual refresh time.

---

## 8. Forms and validation

| Form | Notable rules |
|---|---|
| Report parameters | Required parameters block the run with the missing ones named; a date range's start ≤ end; a range wider than the report's configured maximum warns about the likely runtime and suggests narrowing before the user waits; a fiscal period parameter offers only existing periods |
| Custom report definition | Name required and unique per owner; at least one field; at least one aggregate when grouping is used, with the reason stated; a filter value must match its field type; no free-text query input exists |
| Schedule | Report and frequency required; at least one recipient with a valid email; relative date parameters preferred, with a warning shown if a fixed date is used in a recurring schedule; the preview must render successfully before submit |

---

## 9. RBAC visibility

Report permissions are enforced twice: the catalogue lists only permitted reports, and the shell renders the forbidden state for a direct URL to a report the caller may not run.

| Domain | Roles |
|---|---|
| School reports | principal, teacher (own students only, enforced server-side and stated in the UI), coordinator, accountant (fee reports only) |
| Therapy reports | principal, coordinator, therapist (own sessions and patients only) |
| HR reports | hr_officer, principal; payroll and gratuity reports to accountant as well |
| Accounts and Finance reports | accountant, principal; finance reports to principal and super_admin |
| Inventory and Procurement reports | inventory_manager, accountant, principal |
| Custom report builder | principal, super_admin, and roles explicitly granted the builder permission |
| Schedule management | the schedule owner, plus super_admin |
| Parent | no access to `/reports` at all; the parent dashboard is the only analytics surface |

Where a report is scoped rather than forbidden — a teacher seeing only their own students — the UI states the scope in the result header ("Showing your assigned students only"), so a user does not mistake a scoped result for a complete one. That single sentence prevents a whole category of misreading.

Dashboard tiles are filtered by the same permission checks, so a role never sees a tile it cannot drill into.

---

## 10. Accessibility and responsive requirements

| Item | Requirement |
|---|---|
| Report catalogue | Grouped by domain with heading structure; search results announced with a count |
| Parameter panel | Every parameter labelled; required state programmatic; validation errors associated; the missing-parameter list announced on a blocked run |
| Run lifecycle | Running state in a live region with elapsed time; completion announced with the row count; cancellation announced |
| Result table | A real table with `scope` on headers, `<caption>` naming the report and its parameters, column groups using `colgroup` with accessible names, subtotal and grand-total rows marked as such in text |
| Drill-through cells | Rendered as links with an accessible name describing the destination ("View ledger lines for Tuition Income, March"), never a bare clickable number |
| Numeric columns | Right-aligned visually but with units and currency in the accessible name |
| Freshness indicator | Absolute time in text, not a relative-only timestamp and not a tooltip-only affordance |
| Scoped result notice | Rendered as text in the result header, in the accessible order before the table |
| Charts | An accessible data table alternative present in the DOM for every chart, reachable by keyboard, with the chart itself given `role="img"` and a summary accessible name stating the trend |
| Export | Dispatch announced; job progress in a live region; completion announced with the download action focusable |
| Export history | Expired links state their expiry in text |
| Builder | Field, operator, and value controls individually labelled; adding and removing a filter announced; the preview row limit stated in text |
| Schedule preview | The next three runs and their computed parameter values in a table, readable in sequence |
| Dashboard | Each tile is a labelled region with a heading; the grid has a logical tab order matching the visual order; a failing tile's error is announced without stealing focus |
| KPI tiles | The figure and its label in a single accessible name; a comparison stated with a direction word ("up 12 percent from last month"), never an arrow glyph alone |
| Alert tiles | Counts in text; each action a real link |
| Mobile report | Parameter panel collapses to a sheet; the result table becomes horizontally scrollable with the first column pinned, with the scroll region keyboard-focusable and labelled — for wide financial reports a card layout loses the row relationships that make the report meaningful, so a labelled scroll region is the honest trade-off |
| Mobile dashboard | Single-column tile stack in the role's priority order; quick actions first |
| Print | Every report has a print stylesheet with the parameters and freshness in the header and repeated table headers across pages |

---

## 11. Tests owed by this phase

### Component tests

| Target | Scenarios |
|---|---|
| `ReportShell` | Renders every parameter type from a schema; a missing required parameter blocks the run and names it; the running state shows elapsed time and cancels; cancellation retains the previous result; success shows the row count and the parameter summary; the two empty states are distinguished; a timeout error suggests narrowing the range |
| `ReportTable` | Column groups render; row grouping produces subtotals matching a fixture; the grand total matches the sum of subtotals; sorting; column visibility toggling; money and percentage formatting; drillable cells are links with descriptive accessible names |
| Registry completeness | Enumerate every report named in the feature list and assert a definition exists with permissions, parameters, columns, and export formats — the test that keeps the sixty-report surface honest |
| Registry validity | For every definition: at least one column, every drillable column's target route exists in the route manifest, every parameter type is supported, and declared permissions are known role permissions |
| `ReportCatalogue` | Only permitted reports listed per role, asserted across all nine roles; search matches titles and descriptions; last-run time renders |
| Scoped result notice | For a teacher and a therapist, the scope sentence is present in the result header |
| `ExportMenu` / `ExportJobToast` | Dispatch shows progress; progress survives a simulated navigation; completion offers a download; failure offers a retry |
| `ExportHistoryTable` | Expired links state expiry and do not offer a download |
| `ReportBuilder` | Source selection loads fields; a role's forbidden fields are absent from the picker; operators match field types; grouping without an aggregate is blocked with the reason; **no free-text query or expression input exists anywhere in the builder**, asserted by scanning the rendered form for text inputs bound to a query field |
| `BuilderPreview` | Runs with the stated row limit; the limit is displayed |
| `ScheduleForm` | Relative date parameters offered; a fixed date in a recurring schedule warns; at least one recipient enforced; email validation |
| `SchedulePreview` | The next three dates correct for daily, weekly, monthly, and quarterly frequencies; the computed relative parameter values shown |
| `ScheduleTable` | A failed last run is prominent with the error and a run-now action |
| `DashboardGrid` | Resolves the correct tile set for each of the seven dashboard roles, asserted against the layout registry; a single failing tile shows its own error while the others render; the tab order matches the visual order |
| `KpiTile` | Figure and label in one accessible name; the comparison uses a direction word; the click-through target is correct |
| `ChartTile` | The accessible data table is in the DOM for every chart type; the chart has a summary accessible name |
| `AlertTile` | Counts in text; each item links to the actionable destination |
| Therapist pending-notes tile | Count matches the fixture; the action navigates to the notes queue |
| Teacher attendance-status tile | Not-yet-entered state offers the direct entry action; entered state shows the summary |

### Hook tests

- `reports.run` caching: the same parameters within five minutes serve from cache; the manual refresh bypasses; different parameters produce a separate cache entry.
- `dashboard.tile` refetches on window focus and respects its stale time.
- `exportJob` polls at 2 s while processing and stops on completion or failure.
- `invalidateReportsFor` invalidates exactly the run keys and tile keys for the named domain and nothing else, asserted per domain.
- Cross-phase wiring: a journal-posting mutation triggers `invalidateReportsFor('accounts')` — asserted at the mutation-hook level for at least one representative mutation from each of the six domains.
- `reportParamStore` restores the last-used parameters on re-entry within a session and does not leak across users.

### E2E scenarios

| ID | Scenario |
|---|---|
| `RPT-E2E-01` | Open the catalogue → run a fee collection report with a date range → the row count and parameter summary appear → drill through a collection figure to the ledger lines → return with the result intact |
| `RPT-E2E-02` | Run a report, navigate away, return, and the last-used parameters are restored |
| `RPT-E2E-03` | Run a large report → export to PDF → navigate away → the progress toast persists → completion offers the download → the file downloads and appears in export history |
| `RPT-E2E-04` | Run a report and cancel mid-run; the previous result is retained |
| `RPT-E2E-05` | A teacher runs a student attendance report → the scope notice is present → the result contains only their assigned students |
| `RPT-E2E-06` | Direct URL to an accounts report as a teacher → the forbidden state renders and the report is absent from their catalogue |
| `RPT-E2E-07` | Build a custom report through the pickers → preview with the row limit → save → run from the saved list in the standard shell |
| `RPT-E2E-08` | Schedule a report with a relative "previous month" parameter → the preview shows the next three runs and their parameter values → the schedule appears with its next run time |
| `RPT-E2E-09` | Post a journal entry, then run the trial balance and confirm the new entry is reflected after a manual refresh; where a materialised view backs a figure, the freshness statement is present |
| `RPT-E2E-10` | A financial report on a 360px viewport: the parameter sheet opens, the table scrolls horizontally with the first column pinned, and the scroll region is keyboard-reachable |
| `DSH-E2E-01` | Each of the seven dashboard roles logs in and sees exactly its configured tiles, with every tile's drill-through reachable |
| `DSH-E2E-02` | With one tile's endpoint failing, the dashboard renders and that tile shows a retry that succeeds |
| `DSH-E2E-03` | A therapist's pending-notes tile count matches reality; completing a note decrements it on refresh |
| `DSH-E2E-04` | A teacher's attendance tile offers direct entry; after submitting attendance the tile shows the summary |
| `DSH-E2E-05` | A parent's dashboard shows their children's data only, with an outstanding-fee pay action, and no `/reports` access |
| `A11Y-E2E-08` | Keyboard-only: run a report from the catalogue, sort a column, drill through, and export |
| `A11Y-E2E-09` | Screen-reader assertions: report caption includes the parameters, chart data tables are reachable, and the freshness statement is read before the figures |

### Performance tests

Reports are the most likely place for the UI to feel slow, so this phase carries explicit budgets.

| Target | Budget |
|---|---|
| Report shell interactive after route load | < 1 s |
| Result table render for 1,000 rows | < 500 ms |
| Result table render for 10,000 rows | virtualised, < 1 s, with the row count stated |
| Sorting a 10,000-row result | < 300 ms |
| Dashboard first meaningful tile | < 1.5 s |
| All dashboard tiles settled | < 4 s |
| Export dispatch acknowledged | < 500 ms |

Row virtualisation is required above 500 rows. A test asserts that a 10,000-row result mounts a bounded number of DOM rows rather than all of them.

### Accessibility tests

- `jest-axe` on the shell in each lifecycle state, the table with grouping and totals, the catalogue, the builder at each step, the schedule form and preview, the export history, every tile type, and each of the seven dashboard layouts.
- Full-page axe scan on: the catalogue, one representative report per domain (seven pages) in the success state, the builder, the schedule list and form, the export history, and all seven dashboards.
- Live-region assertions for the run lifecycle, export progress, and tile errors.

### Visual regression

Baselines for: the shell in idle, running, success, empty, and error states; the table with column groups, grouping, subtotals, and a grand total; one representative report per domain; the mobile report view with the pinned first column; the builder; the schedule preview; the export toast and history; every tile type including its error state; all seven dashboards at desktop and 360px; and the print stylesheet output for one financial report.

---

## 12. Exit criteria

Global Definition of Done, plus:

- [ ] One `ReportShell` serves every report; no report page re-implements the parameter form, run lifecycle, table, export, or scheduling.
- [ ] The registry-completeness test proves a definition exists for every report named in the feature list.
- [ ] The registry-validity test proves every drillable column targets a real route.
- [ ] Every money figure in every financial report drills through to ledger lines.
- [ ] Scoped results state their scope in text in the result header.
- [ ] The catalogue lists only permitted reports for all nine roles, and a direct URL to a forbidden report renders the forbidden state.
- [ ] The custom builder contains no free-text query or expression input, asserted by test.
- [ ] Materialised-view-backed figures state their absolute freshness time in text.
- [ ] `invalidateReportsFor` is wired from at least one representative mutation in each of the six domains, asserted at the hook level.
- [ ] Export progress survives navigation.
- [ ] Results above 500 rows are virtualised, with a bounded DOM row count asserted at 10,000 rows.
- [ ] All seven dashboard layouts render their configured tiles, and one failing tile never blanks the dashboard.
- [ ] Every chart has a keyboard-reachable data table alternative in the DOM.
- [ ] All performance budgets in section 11 are met in CI.
- [ ] Zero axe violations across the catalogue, seven representative reports, the builder, scheduling, export history, and all seven dashboards.
