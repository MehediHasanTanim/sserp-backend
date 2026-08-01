import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JournalEntryType } from '@prisma/client';
import { NumberingService } from '../../admin/services/organization.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { PostingRequest } from '../../../shared/ports/ledger.port';
import { FiscalPeriodService } from './fiscal-period.service';
import { PostingRuleService } from './posting-rule.service';
import { BudgetCheckService } from './budget-check.service';

export interface JournalLineInput {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  costCenter?: string;
  narration?: string;
  referenceType?: string;
  referenceId?: string;
  taxId?: string;
}

export interface CreatePostedJournalInput {
  entryDate: Date;
  entryType: JournalEntryType;
  description: string;
  lines: JournalLineInput[];
  costCenter?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyReference?: string;
  postedBy?: string;
  budgetOverrideReason?: string;
  skipBudgetCheck?: boolean;
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly numbering: NumberingService,
    private readonly fiscalPeriods: FiscalPeriodService,
    private readonly postingRules: PostingRuleService,
    private readonly events: EventEmitter2,
    @Optional() private readonly budgetCheck?: BudgetCheckService,
  ) {}

  /**
   * System posting from LedgerPort / outbox replay.
   * MUST be called with a transaction client (AC-12).
   * Resolves accounts via posting_rules (AC-10); ignores caller account code literals.
   */
  async postFromRequest(request: PostingRequest, tx: TxClient) {
    if (!tx) {
      throw DomainException.withCode(
        ErrorCode.TRANSACTION_REQUIRED,
        500,
        'AccountsService.post must be called inside a transaction',
      );
    }
    if (!request.costCenter) {
      throw DomainException.withCode(
        ErrorCode.COST_CENTER_REQUIRED,
        422,
        'Cost center is required',
      );
    }

    const variant =
      (request.payload?.variant as string | undefined) ??
      (request.payload?.paymentMethod as string | undefined) ??
      '';

    const rule = await this.postingRules.resolve(
      request.referenceType,
      variant,
      tx,
    );

    const debit = await tx.chartOfAccount.findUnique({
      where: { accountCode: rule.debitAccountCode },
    });
    const credit = await tx.chartOfAccount.findUnique({
      where: { accountCode: rule.creditAccountCode },
    });
    if (!debit || !credit) {
      throw DomainException.withCode(
        ErrorCode.INVALID_ACCOUNT,
        422,
        'Posting rule points to missing account',
      );
    }

    const idempotencyReference = `${request.referenceType}:${request.referenceId}:${variant || 'default'}`;

    return this.createPostedJournal(
      {
        entryDate: request.postingDate,
        entryType: 'system',
        description: request.description,
        costCenter: rule.costCenter ?? request.costCenter,
        referenceType: request.referenceType,
        referenceId: request.referenceId,
        idempotencyReference,
        lines: [
          {
            accountId: debit.id,
            debitAmount: request.amount,
            creditAmount: 0,
            costCenter: rule.costCenter ?? request.costCenter,
            narration: request.description,
            referenceType: request.referenceType,
            referenceId: request.referenceId,
          },
          {
            accountId: credit.id,
            debitAmount: 0,
            creditAmount: request.amount,
            costCenter: rule.costCenter ?? request.costCenter,
            narration: request.description,
            referenceType: request.referenceType,
            referenceId: request.referenceId,
          },
        ],
      },
      tx,
    );
  }

  async createPostedJournal(input: CreatePostedJournalInput, tx: TxClient) {
    if (!tx) {
      throw DomainException.withCode(
        ErrorCode.TRANSACTION_REQUIRED,
        500,
        'AccountsService.post must be called inside a transaction',
      );
    }

    if (input.idempotencyReference) {
      const existing = await tx.journalEntry.findUnique({
        where: { idempotencyReference: input.idempotencyReference },
        include: { lines: true },
      });
      if (existing) return existing;
    }

    this.validateLines(input.lines);

    const totalDebit = input.lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = input.lines.reduce((s, l) => s + l.creditAmount, 0);
    if (totalDebit !== totalCredit) {
      throw DomainException.withCode(
        ErrorCode.JOURNAL_UNBALANCED,
        422,
        `Journal unbalanced: debit ${totalDebit} != credit ${totalCredit}`,
        { totalDebit, totalCredit, difference: totalDebit - totalCredit },
      );
    }

    if (!input.costCenter && !input.lines.every((l) => l.costCenter)) {
      throw DomainException.withCode(
        ErrorCode.COST_CENTER_REQUIRED,
        422,
        'Every posting must carry a cost center on header or each line',
      );
    }

    await this.assertAccountsPostable(
      input.lines,
      tx,
      input.entryType === 'manual',
    );

    const period = await this.fiscalPeriods.requireOpenForDate(
      input.entryDate,
      tx,
    );

    if (this.budgetCheck && !input.skipBudgetCheck) {
      await this.budgetCheck.checkExpenseLines(input.lines, input.entryDate, {
        overrideReason: input.budgetOverrideReason,
        tx,
      });
    }

    const entryNumber = await this.numbering.nextCode('journal_entry', tx);

    const journal = await tx.journalEntry.create({
      data: {
        entryNumber,
        entryDate: input.entryDate,
        fiscalPeriodId: period.id,
        entryType: input.entryType,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: input.description,
        status: 'posted',
        totalDebit,
        totalCredit,
        costCenter: input.costCenter,
        idempotencyReference: input.idempotencyReference,
        postedAt: new Date(),
        postedBy: input.postedBy,
        budgetOverrideReason: input.budgetOverrideReason,
        lines: {
          create: input.lines.map((l, i) => ({
            lineNumber: i + 1,
            accountId: l.accountId,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
            costCenter: l.costCenter ?? input.costCenter,
            narration: l.narration,
            referenceType: l.referenceType,
            referenceId: l.referenceId,
            taxId: l.taxId,
          })),
        },
      },
      include: { lines: true },
    });

    if (this.budgetCheck) {
      await this.budgetCheck.recordConsumption(journal.id, input.lines, tx);
    }

    this.events.emit(EventNames.JOURNAL_POSTED, {
      journalId: journal.id,
      entryNumber: journal.entryNumber,
      entryType: journal.entryType,
    });

    return journal;
  }

  validateLines(lines: JournalLineInput[]) {
    if (lines.length < 2) {
      throw DomainException.validation(
        'A journal must have at least two lines',
      );
    }
    for (const line of lines) {
      if (line.debitAmount < 0 || line.creditAmount < 0) {
        throw DomainException.validation('Amounts must be non-negative');
      }
      const debitSide = line.debitAmount > 0;
      const creditSide = line.creditAmount > 0;
      if (debitSide === creditSide) {
        throw DomainException.validation(
          'Each line must have exactly one of debit or credit nonzero',
        );
      }
    }
  }

  private async assertAccountsPostable(
    lines: JournalLineInput[],
    tx: TxClient,
    isManual: boolean,
  ) {
    const ids = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await tx.chartOfAccount.findMany({
      where: { id: { in: ids } },
    });
    if (accounts.length !== ids.length) {
      throw DomainException.withCode(
        ErrorCode.INVALID_ACCOUNT,
        422,
        'Unknown account',
      );
    }
    for (const a of accounts) {
      if (!a.isActive) {
        throw DomainException.withCode(
          ErrorCode.INVALID_ACCOUNT,
          422,
          `Account ${a.accountCode} is inactive`,
        );
      }
      if (a.isGroup) {
        throw DomainException.withCode(
          ErrorCode.INVALID_ACCOUNT,
          422,
          `Cannot post to group account ${a.accountCode}`,
        );
      }
      if (isManual && !a.allowManualPosting) {
        throw DomainException.withCode(
          ErrorCode.INVALID_ACCOUNT,
          422,
          `Account ${a.accountCode} does not allow manual posting`,
        );
      }
    }
  }
}
