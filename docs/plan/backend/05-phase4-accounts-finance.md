# Backend Phase 4 — Accounts, Ledger & Finance

| Field | Value |
|---|---|
| Duration | 5 weeks |
| Prerequisites | Phase 0, 1, 2, 3 merged |
| Feature list coverage | 4.1–4.11 (Accounts / Ledger), 5.1–5.4 (Finance) |
| TDD sections | 6.5, 7.3 (Accounts), 9.3 Financial Posting Architecture |

---

## 1. Objective and scope

Build the double-entry accounting core and switch every module's financial output from the `LedgerPort` outbox onto real journal entries. This phase is the point at which the system becomes financially authoritative, so the guiding constraint is: **no posting path may ever create an unbalanced or unattributed entry.**

**In scope**

- Hierarchical chart of accounts with cost centers
- Journal entries with lines, DR=CR enforcement, approval workflow, reversals, recurring templates
- General ledger queries
- Bank and cash management: accounts, vouchers, deposits, withdrawals, cheque lifecycle, bank reconciliation
- Accounts receivable fed from School fees, Therapy billing, and activity fees, with aging and collection follow-up
- Accounts payable (schema and posting paths; Procurement feeds it in Phase 6)
- Trial balance, Profit & Loss, Balance Sheet, Cash Flow, notes to accounts
- Tax configuration and liability tracking
- Budgets per department/cost center, variance, over-budget blocking, revision workflow
- Cost center profitability
- Finance: shareholders, share transfers, annual profit computation, reserves, profit disbursement, dividend register
- **The outbox replay** that converts every Phase 1–3 posting into real journal entries

**Out of scope**

- Payroll and gratuity postings (Phase 5) — the posting rules are defined here, the sources arrive later
- Procurement AP feed (Phase 6)
- Financial report *presentation* endpoints beyond the core statements (Phase 7 adds export and dashboards)

---

## 2. Prerequisites

- Phases 1–3 complete, so `pending_ledger_postings` contains a representative body of real postings to replay.
- `NumberingService` schemes for `journal_entry` and `voucher`.

---

## 3. Prisma schema additions

#### `chart_of_accounts`
Per TDD 6.5 plus `level INTEGER`, `is_group BOOLEAN` (group accounts cannot be posted to directly), `normal_balance` (`debit`|`credit`), `opening_balance INTEGER`, `opening_balance_date`, `path VARCHAR` (materialised ancestry path like `1000.1200.1201` for fast subtree aggregation), `allow_manual_posting BOOLEAN`.

#### `fiscal_periods`
`id`, `academic_or_fiscal_year`, `period_month`, `period_year`, `start_date`, `end_date`, `status` (`open`|`closed`|`locked`), `closed_by`, `closed_at`. Postings into a `closed` or `locked` period are rejected. Essential for preventing retroactive tampering.

#### `posting_rules`
Reference table resolving a business event into account codes, replacing hardcoded codes. `id`, `reference_type`, `variant` (e.g. payment method or fee head), `debit_account_code`, `credit_account_code`, `cost_center`, `is_active`, `description`.

Seeded with every posting listed in phases 1, 2, 3, 5, and 6. This is what makes the outbox replay possible and makes the chart of accounts configurable without code changes.

#### `journal_entries`
Per TDD 6.5 plus `fiscal_period_id`, `entry_type` (`manual`|`system`|`recurring`|`opening`|`closing`|`reversal`), `total_debit INTEGER`, `total_credit INTEGER`, `reversed_by_journal_id`, `reverses_journal_id`, `posted_at`, `posted_by`, `submitted_by`, `rejection_reason`, `attachment_id`, `idempotency_reference VARCHAR` (unique when not null — the key that makes system postings replay-safe).

Constraint: `CHECK (status <> 'posted' OR total_debit = total_credit)`.

#### `journal_lines`
Per TDD 6.5 plus `line_number`, `reference_type`, `reference_id` (line-level source traceability), `tax_id`.

Constraints: `CHECK (debit_amount >= 0 AND credit_amount >= 0)`, `CHECK ((debit_amount = 0) <> (credit_amount = 0))` — every line is exactly one side.

#### `recurring_journal_templates`
`id`, `name`, `frequency` (`monthly`|`quarterly`|`annual`), `next_run_date`, `lines JSONB`, `description`, `is_active`, `last_generated_journal_id`.

#### `bank_accounts`
`id`, `account_name`, `account_number`, `bank_name`, `branch`, `account_type` (`current`|`savings`|`petty_cash`), `coa_account_id`, `opening_balance`, `currency_code`, `is_active`.

#### `vouchers`
`id`, `voucher_number` (unique), `voucher_type` (`cash_receipt`|`cash_payment`|`bank_receipt`|`bank_payment`|`journal`|`contra`), `voucher_date`, `bank_account_id`, `party_type` (`student`|`patient`|`employee`|`vendor`|`shareholder`|`other`), `party_id`, `party_name`, `amount`, `narration`, `journal_id`, `status` (`draft`|`posted`|`cancelled`), `attachment_id`, `prepared_by`, `approved_by`.

#### `cheques`
`id`, `cheque_number`, `bank_account_id`, `direction` (`issued`|`received`), `party_name`, `amount`, `cheque_date`, `status` (`pending`|`presented`|`cleared`|`bounced`|`cancelled`), `cleared_date`, `bounce_reason`, `voucher_id`, `journal_id`.

#### `bank_statements` / `bank_statement_lines`
`bank_statements`: `id`, `bank_account_id`, `statement_date`, `opening_balance`, `closing_balance`, `attachment_id`, `imported_by`, `status` (`importing`|`reconciling`|`reconciled`).
`bank_statement_lines`: `id`, `statement_id`, `transaction_date`, `description`, `reference`, `debit_amount`, `credit_amount`, `running_balance`, `matched_journal_line_id`, `match_status` (`unmatched`|`auto_matched`|`manually_matched`|`ignored`), `matched_by`.

#### `reconciliations`
`id`, `bank_account_id`, `period_start`, `period_end`, `statement_closing_balance`, `system_closing_balance`, `difference`, `unreconciled_count`, `status` (`in_progress`|`completed`), `completed_by`, `completed_at`, `notes`.

#### `ar_ledger` (receivable subledger)
Denormalised per-party running receivable, maintained transactionally alongside journals so aging queries do not have to scan the general ledger. `id`, `party_type` (`student`|`patient`), `party_id`, `source_type` (`admission_fee`|`tuition_fee`|`activity_fee`|`therapy_individual`|`therapy_group`), `source_id`, `invoice_number`, `invoice_date`, `due_date`, `gross_amount`, `settled_amount`, `outstanding_amount`, `status` (`open`|`partially_settled`|`settled`|`written_off`), `cost_center`.

#### `ap_ledger`
Mirror of `ar_ledger` for payables. `party_type` (`vendor`|`employee`), `source_type` (`vendor_invoice`|`payroll`|`gratuity`|`encashment`|`expense_claim`).

#### `collection_follow_ups`
`id`, `ar_ledger_id`, `follow_up_date`, `channel` (`call`|`sms`|`email`|`meeting`), `outcome`, `promised_payment_date`, `notes`, `recorded_by`.

#### `credit_notes` / `debit_notes`
`id`, `note_number`, `party_type`, `party_id`, `reference_invoice`, `amount`, `reason`, `note_type` (`credit_note`|`write_off`|`debit_note`), `approved_by`, `journal_id`, `status`.

#### `taxes`
`id`, `code`, `name`, `tax_type` (`vat`|`withholding`|`income`|`other`), `rate_percent NUMERIC(6,3)`, `is_inclusive`, `payable_account_id`, `receivable_account_id`, `effective_from`, `effective_to`, `is_active`.

#### `tax_transactions`
`id`, `tax_id`, `journal_id`, `taxable_amount`, `tax_amount`, `direction` (`input`|`output`), `party_name`, `transaction_date`, `filing_period`.

#### `budgets`
`id`, `fiscal_year`, `name`, `cost_center`, `department`, `status` (`draft`|`approved`|`revised`|`closed`), `version`, `previous_version_id`, `total_amount`, `approved_by`, `approved_at`, `enforcement_mode` (`warn`|`block`).

#### `budget_lines`
`id`, `budget_id`, `account_id`, `period_month` (nullable = annual), `allocated_amount`, `revised_amount`, `notes`.

#### `budget_revisions`
`id`, `budget_id`, `from_version`, `to_version`, `reason`, `requested_by`, `approved_by`, `approved_at`, `changes JSONB`.

#### `budget_consumption`
Maintained transactionally on every expense posting: `id`, `budget_line_id`, `journal_id`, `amount`, `posted_at`. Enables a fast `SUM` for the over-budget check rather than aggregating the ledger.

#### `shareholders`
`id`, `name`, `shareholder_type` (`individual`|`corporate`), `share_percentage NUMERIC(7,4)`, `shares_count`, `contact_phone`, `contact_email`, `address`, `tax_identifier`, `bank_details JSONB`, `joined_date`, `exited_date`, `status` (`active`|`exited`).

Constraint enforced in service: the sum of `share_percentage` across active shareholders must equal 100 (within a 0.0001 tolerance).

#### `share_transfers`
`id`, `from_shareholder_id`, `to_shareholder_id` (nullable for new entrant), `to_name`, `percentage_transferred`, `transfer_date`, `consideration_amount`, `approved_by`, `attachment_id`.

#### `reserve_funds`
`id`, `name` (general reserve, capital reserve, expansion fund), `coa_account_id`, `description`, `is_active`.

#### `profit_appropriations`
`id`, `fiscal_year`, `net_profit_amount`, `tax_provision_amount`, `reserve_allocations JSONB`, `distributable_amount`, `retained_amount`, `status` (`draft`|`approved`|`disbursed`), `approved_by`, `journal_id`.

#### `profit_disbursements`
`id`, `appropriation_id`, `shareholder_id`, `share_percentage`, `gross_amount`, `tax_withheld_amount`, `net_amount`, `voucher_id`, `payment_method`, `payment_date`, `payment_reference`, `tax_certificate_number`, `status` (`pending`|`paid`).

#### `financial_statement_notes`
`id`, `fiscal_year`, `statement_type`, `note_number`, `title`, `body`, `created_by`. Backs "notes to accounts (manual)" (4.8).

### Indexes added

```
chart_of_accounts (account_code), (parent_id), (path)
journal_entries (entry_date), (status), (reference_type, reference_id), (fiscal_period_id), unique (idempotency_reference)
journal_lines (account_id, journal_id), (journal_id), (reference_type, reference_id)
ar_ledger (party_type, party_id, status), (due_date, status), (cost_center)
ap_ledger (party_type, party_id, status), (due_date, status)
budget_consumption (budget_line_id)
vouchers (voucher_date), (voucher_type, status)
cheques (status, cheque_date)
bank_statement_lines (statement_id, match_status)
tax_transactions (tax_id, filing_period)
```

---

## 4. Module and file structure

```
src/modules/accounts/
├── accounts.module.ts
├── controllers/
│   ├── chart-of-accounts.controller.ts
│   ├── fiscal-period.controller.ts
│   ├── journal.controller.ts
│   ├── ledger.controller.ts
│   ├── bank-account.controller.ts
│   ├── voucher.controller.ts
│   ├── cheque.controller.ts
│   ├── reconciliation.controller.ts
│   ├── receivable.controller.ts
│   ├── payable.controller.ts
│   ├── tax.controller.ts
│   ├── budget.controller.ts
│   └── statements.controller.ts
├── services/
│   ├── chart-of-accounts.service.ts
│   ├── fiscal-period.service.ts
│   ├── posting-rule.service.ts
│   ├── accounts.service.ts             # THE central posting service (implements LedgerPort)
│   ├── journal.service.ts              # manual entries, approval, reversal
│   ├── recurring-journal.service.ts
│   ├── ledger-query.service.ts
│   ├── voucher.service.ts
│   ├── cheque.service.ts
│   ├── reconciliation.service.ts
│   ├── receivable.service.ts
│   ├── payable.service.ts
│   ├── tax.service.ts
│   ├── budget.service.ts
│   ├── budget-check.service.ts
│   ├── trial-balance.service.ts
│   └── statement.service.ts            # P&L, balance sheet, cash flow
├── adapters/accounts-ledger.adapter.ts # LedgerPort implementation replacing the outbox adapter
├── jobs/
│   ├── outbox-replay.job.ts
│   ├── recurring-journal.job.ts
│   ├── ar-aging-refresh.job.ts
│   └── period-close-reminder.job.ts
└── dto/

src/modules/finance/
├── finance.module.ts
├── controllers/{shareholder,appropriation,disbursement,reserve}.controller.ts
├── services/{shareholder,share-transfer,profit-appropriation,disbursement,reserve}.service.ts
└── dto/
```

---

## 5. API endpoints

### Chart of accounts and periods

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/accounts/chart` | accountant, principal(R), super_admin | Tree or flat |
| POST/PATCH | `/accounts/chart` , `/accounts/chart/:id` | accountant, super_admin |
| POST | `/accounts/chart/:id/deactivate` | accountant, super_admin |
| GET/POST | `/accounts/fiscal-periods` | accountant, super_admin |
| POST | `/accounts/fiscal-periods/:id/close` | accountant + principal approval |
| POST | `/accounts/fiscal-periods/:id/reopen` | super_admin | Audited, reason mandatory |
| GET/PATCH | `/accounts/posting-rules` | super_admin, accountant |

### Journals and ledger

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/accounts/journal-entries` | accountant, principal(R) |
| POST | `/accounts/journal-entries` | accountant | Creates `draft` |
| GET | `/accounts/journal-entries/:id` | accountant, principal(R) |
| PATCH | `/accounts/journal-entries/:id` | accountant | Draft only |
| POST | `/accounts/journal-entries/:id/submit` | accountant |
| PATCH | `/accounts/journal-entries/:id/approve` | principal, super_admin | Posts the entry |
| POST | `/accounts/journal-entries/:id/reject` | principal | Reason mandatory |
| POST | `/accounts/journal-entries/:id/reverse` | principal, super_admin | Creates a reversal entry |
| GET/POST/PATCH | `/accounts/recurring-journals` | accountant |
| GET | `/accounts/ledger/:accountId` | accountant, principal(R) | Date range, running balance |
| GET | `/accounts/ledger/:accountId/export` | accountant | CSV/PDF (async via Phase 7 export in the general case; direct for small ranges) |
| GET | `/accounts/trial-balance` | accountant, principal(R) | As-of date, period comparison |

### Bank, cash, cheques, reconciliation

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/accounts/bank-accounts` | accountant, super_admin |
| GET/POST | `/accounts/vouchers` | accountant, receptionist(cash receipt only) |
| POST | `/accounts/vouchers/:id/post` | accountant |
| POST | `/accounts/vouchers/:id/cancel` | accountant, principal |
| GET/POST | `/accounts/cheques` | accountant |
| PATCH | `/accounts/cheques/:id/status` | accountant | present / clear / bounce with reason |
| POST | `/accounts/bank-statements/import` | accountant | CSV upload |
| GET | `/accounts/bank-statements/:id/lines` | accountant |
| POST | `/accounts/bank-statements/:id/auto-match` | accountant |
| PATCH | `/accounts/bank-statement-lines/:id/match` | accountant | Manual match / ignore |
| GET/POST | `/accounts/reconciliations` | accountant |
| POST | `/accounts/reconciliations/:id/complete` | accountant | Blocks if difference ≠ 0 |

### Receivables and payables

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/accounts/receivables` | accountant, principal(R) | Filter party, source, status |
| GET | `/accounts/receivables/aging` | accountant, principal(R) | 0–30 / 31–60 / 61–90 / 90+ buckets |
| GET/POST | `/accounts/receivables/:id/follow-ups` | accountant |
| POST | `/accounts/receivables/:id/write-off` | principal | Creates a credit note and posting |
| GET/POST | `/accounts/credit-notes` | accountant |
| GET | `/accounts/payables` | accountant, principal(R) |
| GET | `/accounts/payables/aging` | accountant, principal(R) |
| POST | `/accounts/payables/:id/schedule-payment` | accountant |
| POST | `/accounts/payables/:id/pay` | accountant | Creates a payment voucher |
| GET/POST | `/accounts/debit-notes` | accountant |
| POST | `/accounts/vendor-advances` | accountant |

### Tax

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/accounts/taxes` | accountant, super_admin |
| GET | `/accounts/taxes/liability` | accountant, principal(R) |
| GET | `/accounts/taxes/filing-summary` | accountant | By filing period |

### Budget

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST | `/accounts/budgets` | accountant, principal |
| GET | `/accounts/budgets/:id` | accountant, principal, department heads(R) |
| PATCH | `/accounts/budgets/:id` | accountant | Draft only |
| POST | `/accounts/budgets/:id/approve` | principal |
| POST | `/accounts/budgets/:id/revise` | accountant | Creates a new version |
| POST | `/accounts/budget-revisions/:id/approve` | principal |
| GET | `/accounts/budget/variance` | accountant, principal, coordinator(R) | Budget vs actual by cost center |
| GET | `/accounts/budget/check` | internal + accountant | Dry-run availability check for a proposed posting |
| GET | `/accounts/budget/utilization` | accountant, principal |

### Financial statements

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/accounts/reports/pnl` | accountant, principal | Period, comparative, per cost center |
| GET | `/accounts/reports/balance-sheet` | accountant, principal | As-of date |
| GET | `/accounts/reports/cash-flow` | accountant, principal | Indirect method |
| GET | `/accounts/reports/cost-center-profitability` | accountant, principal |
| GET/POST | `/accounts/statement-notes` | accountant, principal |

### Finance

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/finance/shareholders` | principal, accountant, super_admin |
| POST | `/finance/share-transfers` | principal |
| GET/POST | `/finance/shareholders/:id/documents` | principal, accountant |
| GET/POST/PATCH | `/finance/reserve-funds` | principal, accountant |
| GET | `/finance/profit/computation` | principal, accountant | Pulls net profit from the P&L for a fiscal year |
| POST | `/finance/appropriations` | accountant | Draft appropriation with reserve allocations |
| POST | `/finance/appropriations/:id/approve` | principal | Posts reserve and retained-earnings entries |
| POST | `/finance/appropriations/:id/disburse` | principal | Generates per-shareholder disbursements |
| POST | `/finance/disbursements/:id/pay` | accountant | Records payment, generates voucher |
| GET | `/finance/disbursements/:id/tax-certificate` | accountant, shareholder-facing print |
| GET | `/finance/dividend-register` | principal, accountant |

---

## 6. Business rules and invariants

### Posting core

| # | Rule | Error |
|---|---|---|
| AC-01 | **Every posted journal must satisfy `SUM(debit) = SUM(credit)`**, checked in the service, by a DB check constraint on the header totals, and by a nightly integrity job over the whole table. | `JOURNAL_UNBALANCED` 422 |
| AC-02 | A journal must have at least two lines. | `VALIDATION_ERROR` 400 |
| AC-03 | Each line is exactly one of debit or credit, and the amount must be positive. | `VALIDATION_ERROR` 400 |
| AC-04 | Postings to `is_group = true` accounts, inactive accounts, or accounts with `allow_manual_posting = false` (for manual entries) are rejected. | `INVALID_ACCOUNT` 422 |
| AC-05 | Postings into a `closed` or `locked` fiscal period are rejected. Reopening a period requires `super_admin` and a reason, and is audited. | `PERIOD_CLOSED` 409 |
| AC-06 | Manual entries follow `draft → submitted → posted`, or `submitted → rejected → draft`. Only `principal`/`super_admin` may post. The creator may not approve their own entry. | `SELF_APPROVAL_FORBIDDEN` 403 |
| AC-07 | Posted entries are immutable. Correction is only by reversal, which creates a new entry with mirrored lines, links both directions, and can itself never be reversed. | `JOURNAL_IMMUTABLE` 409 |
| AC-08 | System postings (from `AccountsService.post()`) skip the approval workflow and post directly — the source module's own approval was the control. They are flagged `entry_type = 'system'`. | — |
| AC-09 | Every system posting carries a unique `idempotency_reference` of the form `{referenceType}:{referenceId}:{variant}`. A duplicate insert is caught and the existing journal returned, making all event replays safe. | — |
| AC-10 | `AccountsService.post()` accepts the `PostingRequest` shape from TDD 9.3 and resolves account codes through `posting_rules`, never from caller-supplied literals. An unresolvable rule is a hard error. | `POSTING_RULE_MISSING` 422 |
| AC-11 | Every posting must carry a cost center on the header or on each line. | `COST_CENTER_REQUIRED` 422 |
| AC-12 | `AccountsService.post()` **must** be called inside the caller's transaction. It throws if invoked outside one. | — |
| AC-13 | Opening balances are entered as a single `entry_type = 'opening'` journal per fiscal year and may not be edited once a period in that year is closed. | `PERIOD_CLOSED` 409 |

### Receivables and payables

| # | Rule | Error |
|---|---|---|
| AR-01 | Every invoice-issuing event creates an `ar_ledger` row in the same transaction as the journal. The subledger total per account must equal the general ledger balance for that account — verified nightly and by test. | — |
| AR-02 | Payments settle `ar_ledger` rows oldest-due-first unless a specific invoice is targeted. | — |
| AR-03 | Aging buckets are computed from `due_date` against the query date: 0–30, 31–60, 61–90, 90+. A settled row never appears in aging. | — |
| AR-04 | Write-off requires principal approval and a reason, creates a credit note, and posts to a bad-debt expense account. | `FORBIDDEN` 403 |
| AR-05 | AR aging must include both School (admission, tuition, activity) and Therapy (individual, group) sources — asserted by test per TDD ACC-E2E-02. | — |

### Bank and reconciliation

| # | Rule | Error |
|---|---|---|
| BK-01 | A voucher posts a journal on `post`, not on create. Cancellation of a posted voucher requires a reversal. | `VOUCHER_POSTED` 409 |
| BK-02 | Cheque lifecycle: `pending → presented → cleared \| bounced`, or `pending → cancelled`. A bounce requires a reason and posts a reversing entry plus any bank charge. | `INVALID_CHEQUE_TRANSITION` 409 |
| BK-03 | Auto-match pairs statement lines to journal lines on exact amount plus a date window of ±3 days plus reference similarity. Ambiguous matches are left unmatched rather than guessed. | — |
| BK-04 | A reconciliation cannot be completed while `difference ≠ 0` or unmatched lines remain unignored. | `RECONCILIATION_UNBALANCED` 422 |
| BK-05 | Petty cash accounts cannot go negative. | `INSUFFICIENT_CASH` 422 |

### Budget

| # | Rule | Error |
|---|---|---|
| BU-01 | Expense postings call `BudgetCheckService` before posting. In `block` mode an overage is rejected; in `warn` mode it posts and returns a warning. | `BUDGET_EXCEEDED` 422 |
| BU-02 | A `block`-mode overage can be overridden only by `principal`, with a reason, recorded in the audit log and on the journal. | `FORBIDDEN` 403 |
| BU-03 | Budget consumption is recorded transactionally in `budget_consumption`, so the availability check is a single indexed `SUM`, not a ledger scan. | — |
| BU-04 | Only `approved` budgets are enforced. Draft budgets never block anything. | — |
| BU-05 | Revision creates a new version and preserves the previous one; the enforced figure is the latest approved version's `revised_amount`. | — |
| BU-06 | Budget lines may be monthly or annual. Monthly lines are enforced against that month's postings; annual lines against the fiscal year to date. | — |

### Tax

| # | Rule | Error |
|---|---|---|
| TX-01 | Tax-inclusive amounts are decomposed as `base = round(gross × 100 / (100 + rate))`, with the remainder assigned to tax so `base + tax = gross` exactly. No paisa is created or lost. | — |
| TX-02 | Every tax computation writes a `tax_transactions` row linked to its journal. | — |
| TX-03 | Rate changes are effective-dated; a transaction uses the rate in force on its transaction date. | — |

### Financial statements

| # | Rule | Error |
|---|---|---|
| FS-01 | Trial balance total debits must equal total credits for any date range. | — |
| FS-02 | P&L = revenue accounts − expense accounts for the period, aggregated over the `path` subtree, optionally filtered by cost center. | — |
| FS-03 | Balance Sheet must balance: `assets = liabilities + equity + current-period profit`. Asserted by test on a seeded book of at least 50 entries. | — |
| FS-04 | Cash flow uses the indirect method: net profit, adjusted for non-cash items and working-capital movements, reconciling to the actual movement in cash and bank accounts. The reconciliation difference must be zero. | — |
| FS-05 | Statements for a closed period are deterministic — running the same query twice returns identical figures. Results for closed periods are cached in Redis for 24 hours. | — |

### Finance

| # | Rule | Error |
|---|---|---|
| FI-01 | Active shareholders' `share_percentage` must sum to exactly 100 (±0.0001). Any create, update, or transfer that breaks this is rejected. | `SHARE_PERCENTAGE_INVALID` 422 |
| FI-02 | A share transfer cannot exceed the transferor's holding. | `INSUFFICIENT_SHARES` 422 |
| FI-03 | Net profit is read from the P&L service for the fiscal year, never entered manually. | — |
| FI-04 | `distributable = net_profit − tax_provision − Σ reserve_allocations`. Reserve allocations may not exceed net profit after tax. | `ALLOCATION_EXCEEDS_PROFIT` 422 |
| FI-05 | Appropriation approval posts reserve transfers and the retained-earnings movement in one journal. | — |
| FI-06 | Disbursement generates one row per active shareholder, `gross = distributable × share_percentage / 100`. **Rounding remainder is allocated to the largest shareholder** so the sum of gross amounts equals `distributable` exactly. | — |
| FI-07 | Withholding tax is computed per the configured dividend tax rate; a tax certificate number is generated on payment. | — |
| FI-08 | Disbursement requires an `approved` appropriation and a closed fiscal year. | `PERIOD_NOT_CLOSED` 409 |

### Outbox replay

| # | Rule | Error |
|---|---|---|
| OB-01 | `OutboxReplayJob` processes `pending_ledger_postings` in `created_at` order, resolving each through `posting_rules` and posting via `AccountsService`. | — |
| OB-02 | Replay is idempotent — a row already `posted` is skipped, and the `idempotency_reference` prevents duplicate journals even if the status write failed previously. | — |
| OB-03 | A row with no matching posting rule is marked `failed` with the reason and reported. Replay does not abort the batch on a single failure. | — |
| OB-04 | After replay, `SUM(pending_ledger_postings.amount WHERE status='posted')` must reconcile against the corresponding journal totals per reference type. Asserted by an integration test and a one-off verification report. | — |
| OB-05 | Once the outbox is drained and the `LedgerPort` binding is switched to `AccountsLedgerAdapter`, new postings go straight to journals. The outbox table is retained read-only for audit. | — |

---

## 7. Domain events

**Emitted:** `journal.posted`, `journal.reversed`, `period.closed`, `period.reopened`, `budget.exceeded`, `budget.approved`, `cheque.bounced`, `reconciliation.completed`, `receivable.written_off`, `appropriation.approved`, `disbursement.paid`.

**Consumed**

| Event | Handler | Action |
|---|---|---|
| `fee.invoice.generated`, `fee.payment.received`, `fee.payment.reversed`, `fee.invoice.waived` | `SchoolPostingListener` | Post AR / receipt / waiver journals; maintain `ar_ledger` |
| `admission_fee.paid`, `admission_fee.waived` | `SchoolPostingListener` | Post journals |
| `therapy_invoice.generated`, `therapy.payment.received`, `therapy.refund.issued` | `TherapyPostingListener` | Post journals; maintain `ar_ledger` |
| `payroll.run.completed`, `gratuity.provision.monthly`, `encashment.approved` | `HrPostingListener` (wired in Phase 5) | Post expense and payable journals |
| `procurement.invoice.approved`, `procurement.po.approved` | `ProcurementPostingListener` (wired in Phase 6) | Post AP journals |

Note: from this phase onwards, source modules call `LedgerPort.post()` **synchronously inside their transaction** (rule AC-12) rather than relying on event listeners for the posting itself. The listeners above exist for the subledger and notification side-effects and for backward compatibility with the Phase 1–3 event contracts.

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `outbox-replay` | On demand + hourly during migration window | Drain `pending_ledger_postings` |
| `recurring-journal` | Daily 01:15 | Generate due recurring entries as drafts |
| `ledger-integrity-check` | Nightly 02:15 | Assert DR=CR globally, AR subledger vs GL agreement, orphan line detection; alerts on any breach |
| `ar-aging-refresh` | Nightly 02:45 | Refresh the aging materialised view |
| `period-close-reminder` | Monthly, 3 days after month end | Remind the accountant to close the period |
| `cheque-status-reminder` | Weekly | Flag cheques pending clearance beyond 15 days |

---

## 9. Configuration and secrets

New settings:

- `organization_settings.fiscal_year_start_month` (already present; now enforced)
- `organization_settings.dividend_withholding_tax_percent`
- `organization_settings.default_budget_enforcement_mode` (`warn` | `block`)
- `organization_settings.bank_match_date_window_days` (default 3)

Reference seed additions: a complete starter chart of accounts (assets 1000-series, liabilities 2000, equity 3000, revenue 4000, expenses 5000), the four cost centers, and the full `posting_rules` set for every event in phases 1–6.

---

## 10. Tests owed by this phase

### Factories added

`accountFactory` (with `groupAccount`, `postableAccount` traits), `fiscalPeriodFactory`, `journalFactory` (`balancedJournal`, `unbalancedJournal`), `journalLineFactory`, `bankAccountFactory`, `voucherFactory`, `chequeFactory`, `statementLineFactory`, `arLedgerFactory`, `taxFactory`, `budgetFactory`, `budgetLineFactory`, `shareholderFactory`, `appropriationFactory`.

### Unit tests — `AccountsService` (the highest-risk service in the phase)

- A balanced two-line posting succeeds.
- An unbalanced posting throws `JOURNAL_UNBALANCED`, tested with a 1-paisa imbalance.
- A single-line posting throws.
- A line with both debit and credit non-zero throws.
- A negative amount throws.
- Posting to a group account throws.
- Posting to an inactive account throws.
- Posting into a closed period throws.
- Missing posting rule throws `POSTING_RULE_MISSING`.
- Missing cost center throws.
- Calling outside a transaction throws.
- Duplicate `idempotency_reference` returns the existing journal without creating a second.
- Posting rule resolution honours the `variant` (e.g. cash vs bank payment method selects different debit accounts).

### Unit tests — `JournalService`

- Draft → submit → approve posts and sets `posted_at`.
- Creator approving own entry throws `SELF_APPROVAL_FORBIDDEN`.
- Editing a posted entry throws.
- Reversal mirrors every line, links both journals, and is itself non-reversible.
- Rejection requires a reason and returns the entry to `draft`.

### Unit tests — `BudgetCheckService`

- Under budget passes.
- Exactly at budget passes.
- One paisa over fails in `block` mode and warns in `warn` mode.
- Principal override succeeds and records the reason.
- Draft budget does not block.
- Monthly line enforced against that month only; annual line against the year to date.
- Latest approved revision is the enforced figure.

### Unit tests — `ReceivableService`

- Aging boundary cases: due exactly 30, 31, 60, 61, 90, 91 days ago land in the expected buckets.
- Oldest-due-first settlement across three open invoices.
- Targeted settlement of a specific invoice.
- Settled rows excluded from aging.
- Write-off posts to bad debt and closes the row.

### Unit tests — `TaxService`, `TrialBalanceService`, `StatementService`

- Tax-inclusive decomposition: for gross 1000 at 15%, `base + tax = 1000` exactly; tested across 20 random amounts with a property-style assertion that no paisa is created or lost.
- Effective-dated rate selection.
- Trial balance debits equal credits on a randomly generated book of 200 balanced journals.
- P&L subtree aggregation with a three-level account hierarchy.
- Balance sheet balances on the same generated book.
- Cash flow reconciles to actual cash and bank movement.
- Cost center filtering excludes other centers' lines.

### Unit tests — Finance services

- Shareholder percentages summing to 99.99 or 100.01 rejected.
- Share transfer exceeding holding rejected.
- Transfer to a new entrant creates the shareholder and preserves the 100% invariant.
- `distributable` computation across reserve allocations.
- Allocation exceeding profit rejected.
- Disbursement rounding: for a distributable amount of 1,000,001 paisa across three shareholders at 33.3333/33.3333/33.3334, the sum of gross amounts equals 1,000,001 exactly.
- Withholding tax computed and net derived.
- Disbursement on an open fiscal year rejected.

### Integration tests

| Suite | Assertions |
|---|---|
| `journal-approval.integration.spec.ts` | Unbalanced entry rejected at the API; balanced entry posts and appears in the ledger (mirrors ACC-E2E-01) |
| `ar-aging-cross-source.integration.spec.ts` | Seed school fee, activity fee, individual therapy, and group therapy receivables at varying ages; assert every source appears and the 60-day bucket is correct (mirrors ACC-E2E-02) |
| `budget-block.integration.spec.ts` | Set a department budget, post to exhaust it, assert the next posting is rejected, then assert a principal override succeeds and is audited (mirrors ACC-E2E-03) |
| `outbox-replay.integration.spec.ts` | Run phases 1–3 flows to fill the outbox, run replay, assert every row is `posted`, every journal balances, and totals reconcile per reference type; run replay a second time and assert zero new journals |
| `period-close.integration.spec.ts` | Close a period, assert postings into it are rejected from every source module (school fee payment, therapy payment, manual journal) |
| `bank-reconciliation.integration.spec.ts` | Import a statement, auto-match, manually match the remainder, assert completion is blocked while a difference exists and succeeds at zero |
| `cheque-lifecycle.integration.spec.ts` | Issue → present → bounce posts a reversal and a bank charge; a second bounce attempt is rejected |
| `statements.integration.spec.ts` | On a seeded book: trial balance balances, balance sheet balances, P&L for the period matches a hand-computed figure, cash flow reconciles |
| `profit-disbursement.integration.spec.ts` | Generate an annual P&L, appropriate to two reserves, disburse to two shareholders, assert individual vouchers and that the total equals the distributable amount (mirrors ACC-E2E-04) |
| `ledger-integrity.integration.spec.ts` | After the full integration suite, run the integrity job and assert zero breaches |

### Performance tests

- `k6/scripts/ledger-query-load.js` — `GET /accounts/ledger/:id` over a 12-month range on an account with 20,000 lines, 20 VU, p95 < 3,000 ms.
- `k6/scripts/pnl-generation.js` — annual P&L, asserting it is routed to the async queue rather than blocking.

### Mutation testing

`AccountsService`, `JournalService`, `BudgetCheckService`, `ReceivableService`, `TaxService`, `StatementService`, `ProfitAppropriationService`, `DisbursementService` at ≥ 75%. `AccountsService` should target ≥ 85%.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] `LedgerPort` is bound to `AccountsLedgerAdapter` and the outbox is fully drained with zero `failed` rows.
- [ ] The outbox replay reconciliation report is committed to `docs/reports/phase4-outbox-reconciliation.md` showing per-reference-type totals matching.
- [ ] A property-style test generates 200 random balanced journals and asserts the trial balance, balance sheet, and DR=CR invariants all hold.
- [ ] The nightly integrity job exists, runs in CI against the integration database, and reports zero breaches.
- [ ] Period closing blocks postings from **every** source module — one test per source.
- [ ] `posting_rules` covers every event listed in phases 1, 2, 3, 5, and 6, verified by a test that enumerates the event constants and asserts a rule exists for each.
- [ ] No account code appears as a literal anywhere in `src/modules/{school,therapy,hr,procurement}` — enforced by a Semgrep rule.
- [ ] Disbursement rounding leaves no residual paisa, proven across at least 10 percentage splits.
