-- Phase 4: Accounts & Finance Module Migration

-- Accounts & finance enums
CREATE TYPE "AccountType" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE "NormalBalance" AS ENUM ('debit', 'credit');
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('open', 'closed', 'locked');
CREATE TYPE "JournalEntryType" AS ENUM ('manual', 'system', 'recurring', 'opening', 'closing', 'reversal');
CREATE TYPE "JournalEntryStatus" AS ENUM ('draft', 'submitted', 'posted', 'rejected', 'reversed');
CREATE TYPE "RecurringFrequency" AS ENUM ('monthly', 'quarterly', 'annual');
CREATE TYPE "BankAccountType" AS ENUM ('current', 'savings', 'petty_cash');
CREATE TYPE "VoucherType" AS ENUM ('cash_receipt', 'cash_payment', 'bank_receipt', 'bank_payment', 'journal', 'contra');
CREATE TYPE "VoucherStatus" AS ENUM ('draft', 'posted', 'cancelled');
CREATE TYPE "PartyType" AS ENUM ('student', 'patient', 'employee', 'vendor', 'shareholder', 'other');
CREATE TYPE "ChequeDirection" AS ENUM ('issued', 'received');
CREATE TYPE "ChequeStatus" AS ENUM ('pending', 'presented', 'cleared', 'bounced', 'cancelled');
CREATE TYPE "BankStatementStatus" AS ENUM ('importing', 'reconciling', 'reconciled');
CREATE TYPE "BankMatchStatus" AS ENUM ('unmatched', 'auto_matched', 'manually_matched', 'ignored');
CREATE TYPE "ReconciliationStatus" AS ENUM ('in_progress', 'completed');
CREATE TYPE "ArSourceType" AS ENUM ('admission_fee', 'tuition_fee', 'activity_fee', 'therapy_individual', 'therapy_group');
CREATE TYPE "ArLedgerStatus" AS ENUM ('open', 'partially_settled', 'settled', 'written_off');
CREATE TYPE "ApSourceType" AS ENUM ('vendor_invoice', 'payroll', 'gratuity', 'encashment', 'expense_claim');
CREATE TYPE "ApPartyType" AS ENUM ('vendor', 'employee');
CREATE TYPE "CollectionChannel" AS ENUM ('call', 'sms', 'email', 'meeting');
CREATE TYPE "NoteType" AS ENUM ('credit_note', 'write_off', 'debit_note');
CREATE TYPE "NoteStatus" AS ENUM ('draft', 'approved', 'posted', 'cancelled');
CREATE TYPE "TaxType" AS ENUM ('vat', 'withholding', 'income', 'other');
CREATE TYPE "TaxDirection" AS ENUM ('input', 'output');
CREATE TYPE "BudgetStatus" AS ENUM ('draft', 'approved', 'revised', 'closed');
CREATE TYPE "BudgetEnforcementMode" AS ENUM ('warn', 'block');
CREATE TYPE "ShareholderType" AS ENUM ('individual', 'corporate');
CREATE TYPE "ShareholderStatus" AS ENUM ('active', 'exited');
CREATE TYPE "AppropriationStatus" AS ENUM ('draft', 'approved', 'disbursed');
CREATE TYPE "DisbursementStatus" AS ENUM ('pending', 'paid');

-- Organization settings additions
ALTER TABLE "organization_settings"
    ADD COLUMN "dividend_withholding_tax_percent" INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN "default_budget_enforcement_mode" TEXT NOT NULL DEFAULT 'warn',
    ADD COLUMN "bank_match_date_window_days" INTEGER NOT NULL DEFAULT 3;

-- Chart of accounts
CREATE TABLE "chart_of_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_code" VARCHAR(20) NOT NULL,
    "account_name" VARCHAR(200) NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "parent_id" UUID,
    "level" INTEGER NOT NULL DEFAULT 1,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "normal_balance" "NormalBalance" NOT NULL,
    "opening_balance" INTEGER NOT NULL DEFAULT 0,
    "opening_balance_date" DATE,
    "path" VARCHAR(200) NOT NULL,
    "allow_manual_posting" BOOLEAN NOT NULL DEFAULT true,
    "cost_center" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chart_of_accounts_account_code_key" ON "chart_of_accounts"("account_code");
CREATE INDEX "chart_of_accounts_parent_id_idx" ON "chart_of_accounts"("parent_id");
CREATE INDEX "chart_of_accounts_path_idx" ON "chart_of_accounts"("path");

ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fiscal periods
CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_or_fiscal_year" TEXT NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'open',
    "closed_by" UUID,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_periods_period_year_period_month_key" ON "fiscal_periods"("period_year", "period_month");

-- Posting rules
CREATE TABLE "posting_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_type" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "debit_account_code" TEXT NOT NULL,
    "credit_account_code" TEXT NOT NULL,
    "cost_center" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "posting_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "posting_rules_reference_type_variant_key" ON "posting_rules"("reference_type", "variant");

-- Journal entries
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_number" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "entry_type" "JournalEntryType" NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "description" TEXT NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'draft',
    "total_debit" INTEGER NOT NULL DEFAULT 0,
    "total_credit" INTEGER NOT NULL DEFAULT 0,
    "cost_center" TEXT,
    "reverses_journal_id" UUID,
    "posted_at" TIMESTAMP(3),
    "posted_by" UUID,
    "submitted_by" UUID,
    "approved_by" UUID,
    "rejection_reason" TEXT,
    "attachment_id" UUID,
    "idempotency_reference" TEXT,
    "budget_override_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journal_entries_posted_balance_chk" CHECK ("status" <> 'posted' OR "total_debit" = "total_credit")
);

CREATE UNIQUE INDEX "journal_entries_entry_number_key" ON "journal_entries"("entry_number");
CREATE UNIQUE INDEX "journal_entries_reverses_journal_id_key" ON "journal_entries"("reverses_journal_id");
CREATE UNIQUE INDEX "journal_entries_idempotency_reference_key" ON "journal_entries"("idempotency_reference");
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");
CREATE INDEX "journal_entries_reference_type_reference_id_idx" ON "journal_entries"("reference_type", "reference_id");
CREATE INDEX "journal_entries_fiscal_period_id_idx" ON "journal_entries"("fiscal_period_id");

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_period_id_fkey"
    FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reverses_journal_id_fkey"
    FOREIGN KEY ("reverses_journal_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Journal lines
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journal_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "debit_amount" INTEGER NOT NULL DEFAULT 0,
    "credit_amount" INTEGER NOT NULL DEFAULT 0,
    "cost_center" TEXT,
    "narration" TEXT,
    "reference_type" TEXT,
    "reference_id" UUID,
    "tax_id" UUID,
    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journal_lines_amounts_non_negative_chk" CHECK ("debit_amount" >= 0 AND "credit_amount" >= 0),
    CONSTRAINT "journal_lines_exactly_one_side_chk" CHECK (("debit_amount" = 0) <> ("credit_amount" = 0))
);

CREATE INDEX "journal_lines_account_id_journal_id_idx" ON "journal_lines"("account_id", "journal_id");
CREATE INDEX "journal_lines_journal_id_idx" ON "journal_lines"("journal_id");
CREATE INDEX "journal_lines_reference_type_reference_id_idx" ON "journal_lines"("reference_type", "reference_id");

ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_fkey"
    FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Recurring journal templates
CREATE TABLE "recurring_journal_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "frequency" "RecurringFrequency" NOT NULL,
    "next_run_date" DATE NOT NULL,
    "lines" JSON NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_generated_journal_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recurring_journal_templates_pkey" PRIMARY KEY ("id")
);

-- Bank accounts
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch" TEXT,
    "account_type" "BankAccountType" NOT NULL,
    "coa_account_id" UUID NOT NULL,
    "opening_balance" INTEGER NOT NULL DEFAULT 0,
    "currency_code" TEXT NOT NULL DEFAULT 'BDT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_coa_account_id_fkey"
    FOREIGN KEY ("coa_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vouchers
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "voucher_number" TEXT NOT NULL,
    "voucher_type" "VoucherType" NOT NULL,
    "voucher_date" DATE NOT NULL,
    "bank_account_id" UUID,
    "party_type" "PartyType",
    "party_id" UUID,
    "party_name" TEXT,
    "amount" INTEGER NOT NULL,
    "narration" TEXT NOT NULL,
    "journal_id" UUID,
    "status" "VoucherStatus" NOT NULL DEFAULT 'draft',
    "attachment_id" UUID,
    "prepared_by" UUID NOT NULL,
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vouchers_voucher_number_key" ON "vouchers"("voucher_number");
CREATE INDEX "vouchers_voucher_date_idx" ON "vouchers"("voucher_date");
CREATE INDEX "vouchers_voucher_type_status_idx" ON "vouchers"("voucher_type", "status");

ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_journal_id_fkey"
    FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cheques
CREATE TABLE "cheques" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cheque_number" TEXT NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "direction" "ChequeDirection" NOT NULL,
    "party_name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "cheque_date" DATE NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'pending',
    "cleared_date" DATE,
    "bounce_reason" TEXT,
    "voucher_id" UUID,
    "journal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cheques_status_cheque_date_idx" ON "cheques"("status", "cheque_date");

ALTER TABLE "cheques" ADD CONSTRAINT "cheques_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_voucher_id_fkey"
    FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_journal_id_fkey"
    FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bank statements
CREATE TABLE "bank_statements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bank_account_id" UUID NOT NULL,
    "statement_date" DATE NOT NULL,
    "opening_balance" INTEGER NOT NULL,
    "closing_balance" INTEGER NOT NULL,
    "attachment_id" UUID,
    "imported_by" UUID NOT NULL,
    "status" "BankStatementStatus" NOT NULL DEFAULT 'importing',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bank statement lines
CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statement_id" UUID NOT NULL,
    "transaction_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "debit_amount" INTEGER NOT NULL DEFAULT 0,
    "credit_amount" INTEGER NOT NULL DEFAULT 0,
    "running_balance" INTEGER NOT NULL,
    "matched_journal_line_id" UUID,
    "match_status" "BankMatchStatus" NOT NULL DEFAULT 'unmatched',
    "matched_by" UUID,
    "ignore_reason" TEXT,
    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_statement_lines_statement_id_match_status_idx" ON "bank_statement_lines"("statement_id", "match_status");

ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_fkey"
    FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matched_journal_line_id_fkey"
    FOREIGN KEY ("matched_journal_line_id") REFERENCES "journal_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reconciliations
CREATE TABLE "reconciliations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bank_account_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "statement_closing_balance" INTEGER NOT NULL,
    "system_closing_balance" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL DEFAULT 0,
    "unreconciled_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'in_progress',
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AR ledger
CREATE TABLE "ar_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_type" "PartyType" NOT NULL,
    "party_id" UUID NOT NULL,
    "source_type" "ArSourceType" NOT NULL,
    "source_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "settled_amount" INTEGER NOT NULL DEFAULT 0,
    "outstanding_amount" INTEGER NOT NULL,
    "status" "ArLedgerStatus" NOT NULL DEFAULT 'open',
    "cost_center" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ar_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ar_ledger_party_type_party_id_status_idx" ON "ar_ledger"("party_type", "party_id", "status");
CREATE INDEX "ar_ledger_due_date_status_idx" ON "ar_ledger"("due_date", "status");
CREATE INDEX "ar_ledger_cost_center_idx" ON "ar_ledger"("cost_center");

-- AP ledger
CREATE TABLE "ap_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "party_type" "ApPartyType" NOT NULL,
    "party_id" UUID NOT NULL,
    "source_type" "ApSourceType" NOT NULL,
    "source_id" UUID NOT NULL,
    "invoice_number" TEXT,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "settled_amount" INTEGER NOT NULL DEFAULT 0,
    "outstanding_amount" INTEGER NOT NULL,
    "status" "ArLedgerStatus" NOT NULL DEFAULT 'open',
    "cost_center" TEXT NOT NULL,
    "scheduled_pay_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ap_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ap_ledger_party_type_party_id_status_idx" ON "ap_ledger"("party_type", "party_id", "status");
CREATE INDEX "ap_ledger_due_date_status_idx" ON "ap_ledger"("due_date", "status");

-- Collection follow-ups
CREATE TABLE "collection_follow_ups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ar_ledger_id" UUID NOT NULL,
    "follow_up_date" DATE NOT NULL,
    "channel" "CollectionChannel" NOT NULL,
    "outcome" TEXT NOT NULL,
    "promised_payment_date" DATE,
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_follow_ups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "collection_follow_ups" ADD CONSTRAINT "collection_follow_ups_ar_ledger_id_fkey"
    FOREIGN KEY ("ar_ledger_id") REFERENCES "ar_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Credit / debit notes
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "note_number" TEXT NOT NULL,
    "party_type" "PartyType" NOT NULL,
    "party_id" UUID NOT NULL,
    "reference_invoice" TEXT,
    "ar_ledger_id" UUID,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note_type" "NoteType" NOT NULL,
    "approved_by" UUID,
    "journal_id" UUID,
    "status" "NoteStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_notes_note_number_key" ON "credit_notes"("note_number");

ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_ar_ledger_id_fkey"
    FOREIGN KEY ("ar_ledger_id") REFERENCES "ar_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_journal_id_fkey"
    FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Taxes
CREATE TABLE "taxes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_type" "TaxType" NOT NULL,
    "rate_percent" DECIMAL(6, 3) NOT NULL,
    "is_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "payable_account_id" UUID NOT NULL,
    "receivable_account_id" UUID,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "taxes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "taxes_code_key" ON "taxes"("code");

ALTER TABLE "taxes" ADD CONSTRAINT "taxes_payable_account_id_fkey"
    FOREIGN KEY ("payable_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_receivable_account_id_fkey"
    FOREIGN KEY ("receivable_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tax transactions
CREATE TABLE "tax_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "taxable_amount" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL,
    "direction" "TaxDirection" NOT NULL,
    "party_name" TEXT,
    "transaction_date" DATE NOT NULL,
    "filing_period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tax_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tax_transactions_tax_id_filing_period_idx" ON "tax_transactions"("tax_id", "filing_period");

ALTER TABLE "tax_transactions" ADD CONSTRAINT "tax_transactions_tax_id_fkey"
    FOREIGN KEY ("tax_id") REFERENCES "taxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_transactions" ADD CONSTRAINT "tax_transactions_journal_id_fkey"
    FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Budgets
CREATE TABLE "budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fiscal_year" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost_center" TEXT NOT NULL,
    "department" TEXT,
    "status" "BudgetStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "enforcement_mode" "BudgetEnforcementMode" NOT NULL DEFAULT 'warn',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_previous_version_id_fkey"
    FOREIGN KEY ("previous_version_id") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Budget lines
CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budget_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "period_month" INTEGER,
    "allocated_amount" INTEGER NOT NULL,
    "revised_amount" INTEGER,
    "notes" TEXT,
    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "budget_lines_budget_id_idx" ON "budget_lines"("budget_id");

ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey"
    FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Budget revisions
CREATE TABLE "budget_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budget_id" UUID NOT NULL,
    "from_version" INTEGER NOT NULL,
    "to_version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "changes" JSON NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_revisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_budget_id_fkey"
    FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Budget consumption
CREATE TABLE "budget_consumption" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "budget_line_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budget_consumption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "budget_consumption_budget_line_id_idx" ON "budget_consumption"("budget_line_id");

ALTER TABLE "budget_consumption" ADD CONSTRAINT "budget_consumption_budget_line_id_fkey"
    FOREIGN KEY ("budget_line_id") REFERENCES "budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_consumption" ADD CONSTRAINT "budget_consumption_journal_id_fkey"
    FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial statement notes
CREATE TABLE "financial_statement_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fiscal_year" TEXT NOT NULL,
    "statement_type" TEXT NOT NULL,
    "note_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "financial_statement_notes_pkey" PRIMARY KEY ("id")
);

-- Shareholders
CREATE TABLE "shareholders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "shareholder_type" "ShareholderType" NOT NULL,
    "share_percentage" DECIMAL(7, 4) NOT NULL,
    "shares_count" INTEGER NOT NULL DEFAULT 0,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "address" TEXT,
    "tax_identifier" TEXT,
    "bank_details" JSON,
    "joined_date" DATE NOT NULL,
    "exited_date" DATE,
    "status" "ShareholderStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shareholders_pkey" PRIMARY KEY ("id")
);

-- Share transfers
CREATE TABLE "share_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "from_shareholder_id" UUID NOT NULL,
    "to_shareholder_id" UUID,
    "to_name" TEXT,
    "percentage_transferred" DECIMAL(7, 4) NOT NULL,
    "transfer_date" DATE NOT NULL,
    "consideration_amount" INTEGER,
    "approved_by" UUID NOT NULL,
    "attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "share_transfers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "share_transfers" ADD CONSTRAINT "share_transfers_from_shareholder_id_fkey"
    FOREIGN KEY ("from_shareholder_id") REFERENCES "shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "share_transfers" ADD CONSTRAINT "share_transfers_to_shareholder_id_fkey"
    FOREIGN KEY ("to_shareholder_id") REFERENCES "shareholders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reserve funds
CREATE TABLE "reserve_funds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "coa_account_id" UUID NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reserve_funds_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reserve_funds" ADD CONSTRAINT "reserve_funds_coa_account_id_fkey"
    FOREIGN KEY ("coa_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Profit appropriations
CREATE TABLE "profit_appropriations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fiscal_year" TEXT NOT NULL,
    "net_profit_amount" INTEGER NOT NULL,
    "tax_provision_amount" INTEGER NOT NULL DEFAULT 0,
    "reserve_allocations" JSON NOT NULL,
    "distributable_amount" INTEGER NOT NULL,
    "retained_amount" INTEGER NOT NULL DEFAULT 0,
    "status" "AppropriationStatus" NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "journal_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "profit_appropriations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "profit_appropriations" ADD CONSTRAINT "profit_appropriations_journal_id_fkey"
    FOREIGN KEY ("journal_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Profit disbursements
CREATE TABLE "profit_disbursements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appropriation_id" UUID NOT NULL,
    "shareholder_id" UUID NOT NULL,
    "share_percentage" DECIMAL(7, 4) NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "tax_withheld_amount" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,
    "voucher_id" UUID,
    "payment_method" "PaymentMethod",
    "payment_date" DATE,
    "payment_reference" TEXT,
    "tax_certificate_number" TEXT,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "profit_disbursements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "profit_disbursements" ADD CONSTRAINT "profit_disbursements_appropriation_id_fkey"
    FOREIGN KEY ("appropriation_id") REFERENCES "profit_appropriations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "profit_disbursements" ADD CONSTRAINT "profit_disbursements_shareholder_id_fkey"
    FOREIGN KEY ("shareholder_id") REFERENCES "shareholders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "profit_disbursements" ADD CONSTRAINT "profit_disbursements_voucher_id_fkey"
    FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Numbering schemes for credit notes (CN-) and debit notes (DN-)
INSERT INTO "numbering_schemes" ("id", "entity_type", "prefix", "padding", "current_sequence", "reset_period", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'credit_note', 'CN-', 6, 0, 'yearly', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("entity_type") DO NOTHING;

INSERT INTO "numbering_schemes" ("id", "entity_type", "prefix", "padding", "current_sequence", "reset_period", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'debit_note', 'DN-', 6, 0, 'yearly', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("entity_type") DO NOTHING;
