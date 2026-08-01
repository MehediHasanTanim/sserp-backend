import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ChartOfAccountsController } from './controllers/chart-of-accounts.controller';
import { FiscalPeriodController } from './controllers/fiscal-period.controller';
import {
  JournalController,
  RecurringJournalController,
} from './controllers/journal.controller';
import { LedgerController } from './controllers/ledger.controller';
import { BankAccountController } from './controllers/bank-account.controller';
import { VoucherController } from './controllers/voucher.controller';
import { ChequeController } from './controllers/cheque.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { ReceivableController } from './controllers/receivable.controller';
import { PayableController } from './controllers/payable.controller';
import { TaxController } from './controllers/tax.controller';
import {
  BudgetController,
  BudgetRevisionController,
} from './controllers/budget.controller';
import { StatementsController } from './controllers/statements.controller';
import { StatementNoteController } from './controllers/statement-note.controller';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { FiscalPeriodService } from './services/fiscal-period.service';
import { PostingRuleService } from './services/posting-rule.service';
import { AccountsService } from './services/accounts.service';
import { JournalService } from './services/journal.service';
import { RecurringJournalService } from './services/recurring-journal.service';
import { LedgerQueryService } from './services/ledger-query.service';
import { TrialBalanceService } from './services/trial-balance.service';
import { VoucherService } from './services/voucher.service';
import { ChequeService } from './services/cheque.service';
import { ReconciliationService } from './services/reconciliation.service';
import { ReceivableService } from './services/receivable.service';
import { PayableService } from './services/payable.service';
import { TaxService } from './services/tax.service';
import { BudgetService } from './services/budget.service';
import { BudgetCheckService } from './services/budget-check.service';
import { StatementService } from './services/statement.service';
import { StatementNoteService } from './services/statement-note.service';
import { AccountsLedgerAdapter } from './adapters/accounts-ledger.adapter';
import { AccountsOpsJob } from './jobs/accounts-ops.job';
import { SchoolTherapyArListener } from './listeners/school-therapy-ar.listener';
import { HrPostingListener } from './listeners/hr-posting.listener';

@Module({
  imports: [AdminModule],
  controllers: [
    ChartOfAccountsController,
    FiscalPeriodController,
    JournalController,
    RecurringJournalController,
    LedgerController,
    BankAccountController,
    VoucherController,
    ChequeController,
    ReconciliationController,
    ReceivableController,
    PayableController,
    TaxController,
    BudgetController,
    BudgetRevisionController,
    StatementsController,
    StatementNoteController,
  ],
  providers: [
    ChartOfAccountsService,
    FiscalPeriodService,
    PostingRuleService,
    AccountsService,
    JournalService,
    RecurringJournalService,
    LedgerQueryService,
    TrialBalanceService,
    VoucherService,
    ChequeService,
    ReconciliationService,
    ReceivableService,
    PayableService,
    TaxService,
    BudgetService,
    BudgetCheckService,
    StatementService,
    StatementNoteService,
    AccountsLedgerAdapter,
    AccountsOpsJob,
    SchoolTherapyArListener,
    HrPostingListener,
  ],
  exports: [
    AccountsService,
    ReceivableService,
    BudgetCheckService,
    AccountsLedgerAdapter,
    StatementService,
    TrialBalanceService,
    PayableService,
    BudgetService,
    LedgerQueryService,
    TaxService,
    ReconciliationService,
  ],
})
export class AccountsModule {}
