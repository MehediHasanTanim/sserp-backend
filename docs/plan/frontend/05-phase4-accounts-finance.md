# Frontend Phase 4 — Accounts, Ledger & Finance

| Field | Value |
|---|---|
| Duration | 5 weeks |
| Prerequisites | Frontend Phase 0, 1, 2, 3; Backend Phase 4 contract published |
| Feature list coverage | 4.1–4.11 (Accounts / Ledger), 5.1–5.4 (Finance) |
| Backend counterpart | [backend/05-phase4-accounts-finance.md](../backend/05-phase4-accounts-finance.md) |

---

## 1. Objective and scope

Build the accounting interface for a user — the accountant — who is precise, works in long focused sessions, and will immediately distrust the system if a figure is ever ambiguous or a balance ever fails to tie. The design priorities here differ from the rest of the application: density over whitespace, keyboard efficiency over discoverability, and unambiguous numbers over friendly summaries.

The centrepiece is the **journal entry form**, which must make an unbalanced entry impossible to submit and make the debit/credit difference visible at every keystroke.

**In scope**

- Chart of accounts tree with hierarchy management
- Fiscal periods with close and reopen
- Journal entry form with live balance validation, approval workflow, reversal, recurring templates
- General ledger and trial balance views
- Bank accounts, vouchers, cheque register, bank statement import, reconciliation workspace
- Receivables with aging, collection follow-ups, write-offs, credit notes
- Payables with aging, payment scheduling, debit notes, vendor advances
- Tax configuration and liability views
- Budget builder, approval, revision, variance and utilisation views
- Financial statements: P&L, balance sheet, cash flow, cost-center profitability, notes to accounts
- Finance: shareholders, share transfers, reserve funds, profit computation, appropriation, disbursement, dividend register

**Out of scope**

- Financial report exports and the accountant dashboard — Phase 7 (the statement views here are on-screen; export tooling is unified in Phase 7)

---

## 2. Prerequisites

- Phase 0 `MoneyInput`, `MoneyDisplay`, `DataTable`.
- Backend Phase 4 contract including `GET /accounts/budget/check` for the dry-run budget feedback used in several forms.

---

## 3. Routes and page tree

```
app/(app)/accounts/
├── chart/
│   ├── page.tsx                          # tree view + management
│   └── [id]/page.tsx                     # account detail + ledger link
├── fiscal-periods/page.tsx
├── posting-rules/page.tsx                # super_admin
├── journals/
│   ├── page.tsx                          # list with status filters
│   ├── new/page.tsx                      # journal entry form
│   ├── [id]/page.tsx                     # detail + approval actions
│   └── recurring/
│       ├── page.tsx
│       └── [id]/page.tsx
├── ledger/
│   ├── page.tsx                          # account selector + ledger
│   └── trial-balance/page.tsx
├── bank/
│   ├── accounts/page.tsx
│   ├── vouchers/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── cheques/page.tsx
│   └── reconciliation/
│       ├── page.tsx                      # list of reconciliations
│       ├── import/page.tsx               # statement import
│       └── [id]/page.tsx                 # reconciliation workspace
├── receivables/
│   ├── page.tsx
│   ├── aging/page.tsx
│   ├── [id]/page.tsx                     # detail + follow-ups
│   └── credit-notes/page.tsx
├── payables/
│   ├── page.tsx
│   ├── aging/page.tsx
│   ├── [id]/page.tsx
│   ├── debit-notes/page.tsx
│   └── advances/page.tsx
├── taxes/
│   ├── page.tsx                          # configuration
│   └── liability/page.tsx
├── budgets/
│   ├── page.tsx
│   ├── new/page.tsx                      # budget builder
│   ├── [id]/page.tsx
│   ├── [id]/revise/page.tsx
│   ├── variance/page.tsx
│   └── utilization/page.tsx
└── statements/
    ├── pnl/page.tsx
    ├── balance-sheet/page.tsx
    ├── cash-flow/page.tsx
    ├── cost-centers/page.tsx
    └── notes/page.tsx

app/(app)/finance/
├── shareholders/
│   ├── page.tsx
│   ├── [id]/page.tsx
│   └── transfers/page.tsx
├── reserves/page.tsx
├── profit/
│   ├── page.tsx                          # computation for a fiscal year
│   ├── appropriations/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   └── disbursements/
│       ├── page.tsx
│       └── [id]/page.tsx
└── dividend-register/page.tsx
```

---

## 4. Component inventory

### The journal entry form

`JournalEntryForm` is the component this phase lives or dies by.

- A line grid where each row is: account (searchable combobox over the postable accounts only — group accounts and inactive accounts are not offered), description, debit amount, credit amount, cost center, and an optional reference.
- **Entering a debit clears the credit field on that line and vice versa**, because a line is one side by definition and allowing both invites the most common data-entry error.
- A persistent **balance strip** pinned at the bottom of the grid showing total debits, total credits, and the difference. The difference is the number the accountant watches, so it is the largest element in the strip and turns from neutral to success only at exactly zero.
- Submit is disabled while the difference is non-zero, with the strip explaining why rather than a separate error message.
- Keyboard efficiency: Tab moves across a line, Enter at the last field adds a new line and focuses its account field, and a keyboard shortcut duplicates the previous line's account and cost center. An accountant entering a twelve-line entry should not touch the mouse.
- Cost center defaults from the previous line, since entries are usually single-center.
- The entry date is validated against the open fiscal period, with the period status shown next to the field so a rejection is anticipated rather than surprising.
- A minimum of two lines is enforced structurally: the grid starts with two empty rows.
- Attachment upload for supporting documents.

| Other component | Notes |
|---|---|
| `BalanceStrip` | Extracted so the reconciliation workspace and the trial balance reuse the same visual language for "these two numbers must match". |
| `AccountSelect` | Combobox over the chart, showing the account code and name, indented by hierarchy level, with group accounts rendered as non-selectable section headers rather than omitted — so the accountant can see where they are in the tree. |
| `JournalDetail` | Header with status, type, period, and reversal links; the line grid read-only; the approval trail; and the actions available for the caller's role. A reversed entry shows a prominent link to its reversal and vice versa. |
| `JournalApprovalBar` | Submit, Approve, Reject — filtered by role and status. The creator never sees Approve on their own entry. |
| `JournalReverseDialog` | Reason required; shows the exact mirrored lines that will be created, so the accountant confirms the effect rather than trusting it. |
| `RecurringJournalForm` | Template lines plus frequency and next run date, with a preview of the next three generation dates. |

### Chart of accounts and periods

| Component | Notes |
|---|---|
| `ChartOfAccountsTree` | Expandable tree with code, name, type, and current balance per node. Group accounts show aggregated subtree balances and are visually distinguished from postable leaves. Search filters the tree while preserving ancestor context. |
| `AccountForm` | Code, name, parent, type, normal balance, group flag, manual-posting flag. Changing the parent warns about the effect on subtree aggregation. |
| `FiscalPeriodTable` | Period rows with status; close and reopen actions. |
| `PeriodCloseDialog` | Pre-close checklist: unposted drafts, unreconciled bank lines, unbalanced subledgers. Each item links to where it can be resolved. Closing with outstanding items is possible only with an explicit acknowledgement, because a hard block with no explanation is worse than an informed decision. |
| `PeriodReopenDialog` | super_admin only; reason required; states that the action is audited. |

### Ledger and statements

| Component | Notes |
|---|---|
| `LedgerView` | Account selector, date range, opening balance, transaction lines with a running balance column, closing balance. Each line links to its source journal and, where a source reference exists, to the originating record (invoice, payment, payroll run). This drill-through is what makes the ledger trustworthy — an accountant must be able to answer "where did this come from" in one click. |
| `TrialBalanceTable` | Account rows with debit and credit columns and a totals row using `BalanceStrip` semantics. A non-zero difference is rendered as a prominent error, since it indicates a system problem rather than user error. |
| `StatementView` | Shared scaffold for P&L, balance sheet, and cash flow: period selector, comparative period toggle, cost-center filter, a collapsible hierarchical figure table, and a data-freshness indicator. Every figure is drillable to the underlying ledger lines. |
| `BalanceSheetView` | Adds an explicit assets = liabilities + equity check line, displayed always, not only on failure. |
| `CashFlowView` | Indirect-method sections with the reconciliation-to-cash-movement line shown explicitly. |
| `CostCenterProfitability` | Revenue, expense, and margin per cost center with a comparison period. |
| `StatementNotesEditor` | Numbered notes per statement and fiscal year. |

### Bank, cash, reconciliation

| Component | Notes |
|---|---|
| `VoucherForm` | Type, date, bank or cash account, party selector (polymorphic across students, patients, employees, vendors, shareholders, or free text), amount, narration, attachment. The resulting journal preview is shown before posting so the accountant sees the accounting effect of a voucher they are creating in business terms. |
| `ChequeRegister` | Filterable by status and date, with status transition actions inline. |
| `ChequeStatusDialog` | Present, clear, or bounce; a bounce requires a reason and shows the reversing entry plus any bank charge that will be posted. |
| `StatementImportWizard` | Upload → column mapping → preview with row-level validation → import. The mapping step is essential because bank CSV formats vary, and hardcoding one format guarantees rework. |
| `ReconciliationWorkspace` | Two-panel layout: statement lines on the left, unmatched system transactions on the right. Auto-match runs first and pre-pairs the obvious matches. Manual matching by selecting one line on each side. Ignore action for legitimately unmatchable lines with a reason. A persistent `BalanceStrip` shows the statement closing balance, the system closing balance, and the difference. Completion is blocked while the difference is non-zero, with the count of unmatched lines shown. |
| `MatchSuggestionBadge` | For auto-matched pairs, indicates why they matched (exact amount, date within window, reference similarity) so the accountant can accept or reject the suggestion knowingly. |

### Receivables and payables

| Component | Notes |
|---|---|
| `AgingTable` | Party rows with columns for current, 0–30, 31–60, 61–90, and 90+, plus totals. Source column distinguishes school fees, activity fees, individual therapy, and group therapy — the cross-source view is a stated requirement. Drill-through to the underlying invoices. |
| `AgingSummaryCards` | Total outstanding per bucket with proportions. |
| `ReceivableDetail` | Invoice details, settlement history, and the follow-up timeline. |
| `FollowUpForm` | Channel, outcome, promised payment date, notes. |
| `WriteOffDialog` | Principal only; reason required; shows the bad-debt posting that will be created. |
| `CreditNoteForm` / `DebitNoteForm` | Party, reference invoice, amount, reason. |
| `PaymentScheduleForm` | Scheduled date and amount for a payable. |
| `VendorAdvanceForm` | Vendor, PO reference, amount, with the adjustment state displayed for existing advances. |

### Tax and budget

| Component | Notes |
|---|---|
| `TaxConfigForm` | Code, name, type, rate, inclusive flag, linked accounts, effective dating. A rate change warns that it applies only to transactions from the effective date. |
| `TaxLiabilityView` | Input and output tax by period with the net payable, and a filing-period grouping. |
| `BudgetBuilder` | Cost center and department selection, then a line grid of account × period × amount. Supports annual lines and monthly lines in the same budget, with the distinction made explicit per line. A running total per cost center and an overall total. Copy-from-previous-year action, because building a budget from scratch every year is needless work. |
| `BudgetApprovalBar` | Submit and approve actions by role. |
| `BudgetRevisionForm` | Shows the current approved figures alongside editable revised figures with a per-line delta column, plus a mandatory reason. |
| `BudgetVarianceTable` | Budget, actual, variance amount, and variance percentage per line, with over-budget rows flagged in text as well as colour. Drill-through to the actual postings. |
| `BudgetUtilizationGauge` | Percentage consumed per cost center with the remaining amount stated in text. |
| `BudgetCheckIndicator` | A small reusable component showing the remaining budget for a selected cost center and account, used inline in the journal form, the voucher form, and (from Phase 6) the purchase request form. It calls the dry-run endpoint so the user learns about a constraint before submitting rather than after. |
| `BudgetOverrideDialog` | Principal only; reason required; states the overage amount explicitly. |

### Finance

| Component | Notes |
|---|---|
| `ShareholderTable` | Name, type, percentage, shares, status, with a **prominent total percentage indicator** that shows the sum across active shareholders and flags any deviation from 100%. This is the invariant the whole module rests on, so it is always visible rather than discovered at save time. |
| `ShareholderForm` | Details plus percentage, with a live preview of the resulting total and a block when it would not equal 100%. |
| `ShareTransferForm` | From, to (existing or new entrant), percentage, date, consideration, attachment. Shows both parties' resulting percentages and the new total before submit. |
| `ReserveFundTable` / `ReserveFundForm` | Fund list with current balances from the linked accounts. |
| `ProfitComputationView` | Fiscal year selector, net profit pulled from the P&L (read-only, with a link to the statement), tax provision input, reserve allocation lines, and a computed distributable amount that updates live. An allocation exceeding available profit is blocked with the excess stated. |
| `AppropriationDetail` | The computation as submitted, the approval trail, and the posted journal link. |
| `DisbursementTable` | Per shareholder: percentage, gross, tax withheld, net, payment status. A totals row that must equal the distributable amount exactly — displayed with a match indicator, because the rounding-remainder rule means the accountant should be able to verify it ties. |
| `DisbursementPayDialog` | Method, reference, date; generates a voucher and shows the resulting posting. |
| `TaxCertificateButton` | Downloads the withholding certificate for a paid disbursement. |
| `DividendRegisterTable` | Historical disbursements by year and shareholder. |

---

## 5. Server state

### Query keys

```typescript
accounts: {
  chart:  { tree: [...], flat: [...], detail: (id) => [...] },
  fiscalPeriods: [...],
  postingRules:  [...],
  journals: { list: (f) => [...], detail: (id) => [...], recurring: [...] },
  ledger:  { account: (id, range) => [...], trialBalance: (asOf) => [...] },
  bank:    { accounts: [...], vouchers: (f) => [...], voucher: (id) => [...],
             cheques: (f) => [...], statements: (f) => [...],
             statementLines: (id) => [...], reconciliations: (f) => [...],
             reconciliation: (id) => [...] },
  receivables: { list: (f) => [...], aging: (asOf) => [...], detail: (id) => [...],
                 followUps: (id) => [...], creditNotes: (f) => [...] },
  payables:    { list: (f) => [...], aging: (asOf) => [...], detail: (id) => [...],
                 debitNotes: (f) => [...], advances: (f) => [...] },
  taxes:   { list: [...], liability: (period) => [...] },
  budgets: { list: (f) => [...], detail: (id) => [...], variance: (f) => [...],
             utilization: (f) => [...], check: (params) => [...] },
  statements: { pnl: (p) => [...], balanceSheet: (p) => [...],
                cashFlow: (p) => [...], costCenters: (p) => [...], notes: (year) => [...] },
},
finance: {
  shareholders: { list: [...], detail: (id) => [...], transfers: (f) => [...] },
  reserves: [...],
  profit: { computation: (year) => [...], appropriations: (f) => [...],
            appropriation: (id) => [...], disbursements: (f) => [...],
            disbursement: (id) => [...], dividendRegister: (f) => [...] },
}
```

### Staleness and caching

| Data | staleTime | Reason |
|---|---|---|
| Chart of accounts, posting rules, taxes | 15 min | Reference data |
| Fiscal periods | 5 min | Changes on close |
| Journal list and detail | 30 s | |
| Ledger, trial balance | 0 | An accountant reading a balance must see the current one |
| Statements for a **closed** period | `Infinity` | Deterministic by definition; the backend caches these too |
| Statements for an **open** period | 60 s | |
| Aging | 60 s | |
| Budget check | 0 | It is a pre-submit decision input |
| Shareholder list | 0 | The 100% invariant must never be evaluated against stale data |

The closed-period `Infinity` choice is deliberate and safe: a closed period's figures cannot change without a reopen, and a reopen invalidates the key.

### Invalidation

| Mutation | Invalidates |
|---|---|
| Post or approve a journal | `journals.*`, `ledger.*`, `statements.*`, `trialBalance`, `budgets.variance`, `budgets.utilization`, `budgets.check`, and `receivables`/`payables` when the entry touches those accounts |
| Reverse a journal | Same as above, both journals' details |
| Close a period | `fiscalPeriods`, `statements.*`, `journals.list` |
| Reopen a period | Same, plus the previously-`Infinity` statement keys for that period |
| Post a voucher | `bank.vouchers`, `bank.accounts`, `journals.*`, `ledger.*`, and the relevant subledger |
| Cheque status change | `bank.cheques`, `journals.*`, `ledger.*` |
| Complete a reconciliation | `bank.reconciliations`, `bank.statementLines`, `bank.accounts` |
| Record a receivable settlement | `receivables.*`, `ledger.*`, `statements.*` |
| Write off a receivable | `receivables.*`, `creditNotes`, `journals.*`, `ledger.*`, `statements.*` |
| Approve a budget | `budgets.*`, and `budgets.check` everywhere since enforcement changes |
| Create or update a shareholder, or transfer shares | `finance.shareholders.*` |
| Approve an appropriation | `finance.profit.*`, `journals.*`, `ledger.*`, `statements.*`, `reserves` |
| Pay a disbursement | `finance.profit.disbursements`, `bank.vouchers`, `ledger.*` |

The pattern here is that almost every accounting mutation invalidates the ledger and the statements. Rather than enumerating this per hook, a shared `invalidateAccountingViews(queryClient)` helper is called by every posting mutation, with the specific additional keys listed per mutation. This prevents the classic bug of a new posting path forgetting to refresh the trial balance.

---

## 6. Client state

- `journalDraftStore` — the journal entry line grid persisted to `sessionStorage`, because a twelve-line entry lost to an accidental navigation is a serious annoyance.
- `reconciliationStore` — in-progress manual match selections for the workspace, held until submitted.
- `budgetDraftStore` — the budget builder grid.
- `filterStore` additions for the journal list, aging views, voucher list, cheque register, and variance view.
- `accountingPreferencesStore` — table density (accountants prefer compact), default cost center, and whether to show account codes alongside names.

---

## 7. Forms and validation

| Form | Notable rules |
|---|---|
| Journal entry | Date within an open period; at least two lines; every line has an account, a cost center, and exactly one of debit or credit; every amount positive; total debits equal total credits exactly; description required on the header; a line's account must be postable |
| Journal rejection | Reason minimum 20 characters |
| Journal reversal | Reason minimum 20 characters; date within an open period |
| Recurring journal template | Frequency required; next run date in the future; lines balanced (validated with the same rule as a journal) |
| Account | Code unique and matching the configured pattern; parent must be a group account; a group account cannot be changed to postable while it has children; normal balance required |
| Period close | Acknowledgement required when outstanding items exist |
| Period reopen | Reason minimum 20 characters |
| Voucher | Type, date, amount positive, party required for non-journal types, narration minimum 10 characters; date within an open period |
| Cheque | Number required; amount positive; cheque date required; a bounce requires a reason |
| Statement import | File required; every required column mapped; at least one valid row; rows failing validation listed and excluded rather than blocking the whole import |
| Reconciliation completion | Difference must be zero; every statement line must be matched or explicitly ignored |
| Follow-up | Channel and outcome required; promised date not in the past |
| Write-off | Amount not exceeding outstanding; reason minimum 20 characters |
| Credit / debit note | Amount positive; reason required; reference invoice required where applicable |
| Tax configuration | Rate 0–100 with up to three decimals; effective dates non-overlapping for the same code; payable account required |
| Budget | At least one line; every line has an account and an amount; monthly lines require a month; amounts non-negative; the total is displayed and must be non-zero to submit |
| Budget revision | At least one line changed; reason minimum 20 characters |
| Budget override | Reason minimum 20 characters; the overage amount is displayed |
| Shareholder | Percentage between 0 and 100 with four decimals; the resulting active total must equal 100 exactly, with the current total and the delta shown live |
| Share transfer | Percentage not exceeding the transferor's holding; either an existing recipient or a new entrant's details; date not in the future; resulting totals displayed |
| Profit appropriation | Fiscal year must be closed; tax provision non-negative; reserve allocations non-negative and summing to no more than net profit after tax; the distributable amount displayed live |
| Disbursement payment | Method and reference required; date not in the future |

---

## 8. RBAC visibility

| Element | Visible to |
|---|---|
| Accounts navigation | accountant, principal (read), super_admin |
| Chart of accounts management | accountant, super_admin |
| Posting rules | super_admin only |
| Journal create / edit | accountant |
| Journal approve / reject / reverse | principal, super_admin — and never the entry's creator |
| Period close | accountant with principal approval |
| Period reopen | super_admin only |
| Vouchers | accountant; receptionist limited to cash receipts |
| Cheque management | accountant |
| Reconciliation | accountant |
| Receivables and payables | accountant, principal (read) |
| Write-off | principal |
| Tax configuration | accountant, super_admin |
| Budget create / revise | accountant, principal |
| Budget approve | principal |
| Budget override | principal |
| Budget variance (own cost center) | department heads and coordinators, read-only |
| Financial statements | accountant, principal |
| Finance navigation | principal, accountant, super_admin |
| Shareholder management, transfers | principal |
| Appropriation create | accountant |
| Appropriation approve, disburse | principal |
| Disbursement payment | accountant |

Note the self-approval rule appears in the UI as the Approve action being **absent** on an entry the current user created, with a short explanatory line in the approval bar rather than a disabled button that looks like a bug.

---

## 9. Accessibility and responsive requirements

Accounting screens are dense and numeric, which creates specific accessibility obligations.

| Item | Requirement |
|---|---|
| Balance strip | `aria-live="polite"` announcing the difference as it changes, phrased usefully: "Difference: 500 taka debit excess". Silent numeric change is useless to a screen reader user entering a long journal. |
| Journal line grid | A real table with column headers; each input's accessible name includes its line number and column ("Line 3 debit amount"); adding a line announces the new line number |
| Currency figures | `MoneyDisplay` uses tabular numerals and right alignment; the accessible text includes the currency and never relies on a symbol alone; negative amounts are stated as negative in text, not conveyed only by parentheses or colour |
| Trial balance and statements | Proper table semantics with row and column headers; hierarchical rows use `aria-level`; totals rows marked as such |
| Statement drill-through | Every figure that is drillable is a button or link with an accessible name stating what will open |
| Balance check lines | The assets = liabilities + equity check and the cash flow reconciliation line are always present in text, not only shown on failure |
| Reconciliation workspace | Two panels are labelled landmarks; matching announces the pairing and the updated difference; the difference is in a live region |
| Aging table | Bucket headers are explicit date ranges, not just labels like "60 days" |
| Over-budget indication | Text label plus icon in addition to colour |
| Shareholder total | Always visible in text with an explicit statement when it is not 100% |
| Disbursement totals | The match against the distributable amount stated in text |
| Keyboard efficiency | Documented shortcuts for the journal form and the reconciliation workspace, discoverable via a keyboard-accessible help affordance |
| Mobile journal form | Lines become stacked cards; the balance strip is pinned to the bottom of the viewport; entry remains possible but the desktop layout is clearly the intended one and the UI says so rather than pretending otherwise |
| Mobile ledger and statements | Horizontal scroll with a frozen first column and a clear scroll affordance; a summary-first view with expandable detail |
| Mobile reconciliation | Sequential single-panel flow: review a statement line, then choose a match from a filtered list |

The reconciliation workspace and the journal grid are genuinely desktop-oriented tools. The plan's position is that they remain usable on mobile but are optimised for desktop, and that the mobile experience is honest about being a review-and-light-edit surface rather than a pretend equal.

---

## 10. Tests owed by this phase

### Component tests

| Target | Scenarios |
|---|---|
| `JournalEntryForm` | Entering a debit clears the credit on that line; the balance strip updates on every keystroke; submit disabled while unbalanced; enabled at exactly zero difference; a one-paisa imbalance blocks; a single-line entry cannot be submitted; Enter at the last field adds and focuses a new line; duplicate-line shortcut copies account and cost center; a date outside an open period shows the period status and blocks; group accounts absent from the account combobox; draft persists across remount; axe clean with the live region asserted |
| `BalanceStrip` | Renders debit, credit, and difference; difference direction stated in text; announces changes |
| `AccountSelect` | Group accounts rendered as non-selectable headers; hierarchy indentation; search preserves ancestor context; inactive accounts absent |
| `JournalDetail` / `JournalApprovalBar` | The creator sees no Approve action and sees the explanatory line; a principal sees Approve and Reject; a posted entry shows no edit action; a reversed entry links to its reversal |
| `JournalReverseDialog` | Mirrored lines previewed correctly; reason required |
| `PeriodCloseDialog` | Outstanding items listed with links; acknowledgement required when items exist; close proceeds when clean |
| `LedgerView` | Opening balance, running balance arithmetic across 20 lines, closing balance; drill-through links present for every line with a source reference |
| `TrialBalanceTable` | Balanced totals render as matched; a non-zero difference renders as a prominent error |
| `BalanceSheetView` | The equality check line is always present; an imbalance is rendered as an error |
| `CashFlowView` | The reconciliation line is present and ties |
| `StatementView` | Comparative period toggle; cost-center filter; hierarchical collapse; freshness indicator; drill-through |
| `VoucherForm` | Journal preview reflects the entered voucher; party selector handles all five party types plus free text; period validation |
| `ChequeStatusDialog` | Bounce requires a reason and previews the reversal and charge; invalid transitions unavailable |
| `StatementImportWizard` | Column mapping required; invalid rows listed and excluded; a valid import proceeds; a file with no valid rows is rejected with an explanation |
| `ReconciliationWorkspace` | Auto-match pre-pairs with a reason badge; manual match updates the difference; ignore requires a reason; completion blocked while the difference is non-zero or lines are unmatched; the difference is announced |
| `AgingTable` | Bucket boundaries correct for invoices due 30, 31, 60, 61, 90, and 91 days ago; all four source types appear; totals tie; drill-through present |
| `WriteOffDialog` | Principal only; posting previewed; reason required |
| `BudgetBuilder` | Line addition; monthly versus annual distinction; running totals; copy-from-previous-year populates correctly |
| `BudgetVarianceTable` | Variance arithmetic; over-budget rows flagged in text; drill-through to postings |
| `BudgetCheckIndicator` | Shows remaining budget; updates on cost center change; shows an over-budget warning before submit |
| `BudgetOverrideDialog` | Principal only; overage stated; reason required |
| `ShareholderTable` | The total percentage indicator is always visible; a deviation from 100% is flagged in text |
| `ShareholderForm` | Live resulting total; a submission that would break 100% is blocked with the delta stated |
| `ShareTransferForm` | Over-holding transfer blocked; both parties' resulting percentages shown; new-entrant path works |
| `ProfitComputationView` | Net profit is read-only with a statement link; distributable updates live as allocations change; an allocation exceeding profit blocks with the excess stated |
| `DisbursementTable` | Per-shareholder gross computed from percentages; the totals row matches the distributable amount and the match is stated in text |
| `MoneyDisplay` (regression) | Tabular alignment; negative rendering in text; accessible name includes the currency |

### Hook tests

- `invalidateAccountingViews` is called by every posting mutation — asserted for journal post, journal approve, journal reverse, voucher post, cheque status change, receivable settlement, write-off, appropriation approval, and disbursement payment. This single test set is what prevents a stale trial balance after a new posting path is added.
- Closed-period statement queries use `staleTime: Infinity` and are invalidated by a period reopen.
- `useBudgetCheck` fires on cost center and account change and not on unrelated field changes.

### E2E scenarios

| ID | Scenario |
|---|---|
| `ACC-E2E-01` | Create an unbalanced journal → submit blocked with the difference shown → correct it → submit → principal approves → the entry appears in the ledger and the trial balance still balances (mirrors TDD ACC-E2E-01) |
| `ACC-E2E-02` | The creator cannot approve their own entry; a second user with the principal role can |
| `ACC-E2E-03` | Reverse a posted entry → both entries link to each other and the net ledger effect is zero |
| `ACC-E2E-04` | View AR aging with school fee, activity fee, individual therapy, and group therapy receivables at varying ages → every source appears in the correct bucket (mirrors ACC-E2E-02) |
| `ACC-E2E-05` | Approve a budget → post expenses to exhaust it → the budget check indicator warns before the next entry → the posting is rejected → a principal override with a reason succeeds (mirrors ACC-E2E-03) |
| `ACC-E2E-06` | Close a fiscal period → attempt a journal dated within it → blocked with the period status shown → super_admin reopens with a reason → the entry now posts |
| `ACC-E2E-07` | Import a bank statement with a custom column layout → map columns → auto-match → manually match the remainder → completion blocked at a non-zero difference → resolve → complete |
| `ACC-E2E-08` | Issue a cheque → mark presented → mark bounced with a reason → the reversal and bank charge appear in the ledger |
| `ACC-E2E-09` | Generate an annual P&L → appropriate profit to two reserves → approve → disburse to two shareholders → each disbursement's gross ties and the total equals the distributable amount (mirrors ACC-E2E-04) |
| `ACC-E2E-10` | Attempt to add a shareholder that would make the total 105% → blocked with the delta stated → adjust an existing holder → succeeds |
| `ACC-E2E-11` | Drill from a P&L figure to the ledger to a source journal to the originating fee payment — the full traceability chain |
| `ACC-E2E-12` | Balance sheet balances and cash flow reconciles on the seeded book, asserted from the rendered UI |
| `RBAC-E2E-03` | Coordinator role: sees budget variance for their cost center only; has no access to journals, the chart, or finance |
| `A11Y-E2E-05` | Keyboard-only: enter a six-line balanced journal and submit it, with the balance strip announcements verified |

### Accessibility tests

- `jest-axe` on every component in section 4.
- Full-page axe scan on: chart of accounts, journal form, journal detail, ledger, trial balance, each statement view, voucher form, cheque register, statement import, reconciliation workspace, both aging views, budget builder, variance view, shareholder list, profit computation, and the disbursement table.
- The balance strip live region and the reconciliation difference announcement verified by a screen-reader-oriented test.
- A manual screen reader pass on the journal form and the reconciliation workspace, documented.

### Visual regression

Baselines for: the journal form empty, partially filled and unbalanced, and balanced; the balance strip in all three states; the chart of accounts tree expanded; the ledger with running balances; the trial balance; each statement view with comparatives; the reconciliation workspace before and after auto-match; both aging views; the budget builder and variance table with over-budget rows; the shareholder table at 100% and in a deviation state; the disbursement table; and mobile viewports of the journal form, ledger, and reconciliation flow.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] An unbalanced journal cannot be submitted, and the difference is visible and announced at every keystroke.
- [ ] A line can never hold both a debit and a credit.
- [ ] Group and inactive accounts are never offered as posting targets.
- [ ] Self-approval is impossible in the UI, and the absence of the action is explained rather than left as an apparent bug.
- [ ] The trial balance, balance sheet equality, and cash flow reconciliation are all displayed as explicit always-present checks.
- [ ] Full drill-through works from a statement figure to the originating business record, proven by `ACC-E2E-11`.
- [ ] `invalidateAccountingViews` is called by every posting mutation, asserted by test.
- [ ] The reconciliation workspace blocks completion at a non-zero difference and announces the difference on every match.
- [ ] The budget check indicator warns before submission in the journal, voucher, and (from Phase 6) purchase request forms.
- [ ] The shareholder 100% invariant is always visible and enforced client-side before submit.
- [ ] The disbursement total ties exactly to the distributable amount, verified in the UI.
- [ ] Zero axe violations on all 17 scanned pages; screen reader passes for the journal form and reconciliation workspace documented.
- [ ] Money is never rendered by anything other than `MoneyDisplay`, and no floating-point arithmetic appears in this phase's code — enforced by lint.
