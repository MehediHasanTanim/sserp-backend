import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { JournalLineInput } from './accounts.service';

export interface BudgetCheckOptions {
  overrideReason?: string;
  tx?: TxClient;
}

@Injectable()
export class BudgetCheckService {
  private readonly logger = new Logger(BudgetCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * For expense account lines, enforce approved budgets (BU-01–BU-06).
   * Non-expense lines are ignored.
   */
  async checkExpenseLines(
    lines: JournalLineInput[],
    entryDate: Date,
    options: BudgetCheckOptions = {},
  ) {
    const client = options.tx ?? this.prisma;
    const month = entryDate.getUTCMonth() + 1;
    const year = entryDate.getUTCFullYear();
    const fiscalYear = `${year}`;

    for (const line of lines) {
      if (line.debitAmount <= 0) continue; // expense typically debit

      const account = await client.chartOfAccount.findUnique({
        where: { id: line.accountId },
      });
      if (!account || account.accountType !== 'expense') continue;

      const costCenter = line.costCenter;
      if (!costCenter) continue;

      const budget = await client.budget.findFirst({
        where: {
          fiscalYear,
          costCenter,
          status: { in: ['approved', 'revised'] },
        },
        orderBy: { version: 'desc' },
        include: {
          lines: {
            where: {
              accountId: line.accountId,
              OR: [{ periodMonth: month }, { periodMonth: null }],
            },
          },
        },
      });

      if (!budget || !budget.lines.length) continue; // no budget = no block (BU-04 only approved)

      const budgetLine =
        budget.lines.find((l) => l.periodMonth === month) ??
        budget.lines.find((l) => l.periodMonth == null);
      if (!budgetLine) continue;

      const allocated = budgetLine.revisedAmount ?? budgetLine.allocatedAmount;
      const consumed = await client.budgetConsumption.aggregate({
        where: { budgetLineId: budgetLine.id },
        _sum: { amount: true },
      });
      const used = consumed._sum.amount ?? 0;
      const remaining = allocated - used;

      if (line.debitAmount <= remaining) continue;

      const overage = line.debitAmount - remaining;
      this.events.emit(EventNames.BUDGET_EXCEEDED, {
        budgetId: budget.id,
        accountId: line.accountId,
        overage,
      });

      if (budget.enforcementMode === 'warn') {
        this.logger.warn(
          `Budget exceeded by ${overage} for ${costCenter}/${account.accountCode} (warn mode)`,
        );
        continue;
      }

      // block mode
      if (options.overrideReason) {
        continue; // principal override
      }

      throw DomainException.withCode(
        ErrorCode.BUDGET_EXCEEDED,
        422,
        `Budget exceeded by ${overage} for ${costCenter} / ${account.accountCode}`,
        { remaining, requested: line.debitAmount, overage },
      );
    }
  }

  async recordConsumption(
    journalId: string,
    lines: JournalLineInput[],
    tx: TxClient,
  ) {
    for (const line of lines) {
      if (line.debitAmount <= 0 || !line.costCenter) continue;
      const account = await tx.chartOfAccount.findUnique({
        where: { id: line.accountId },
      });
      if (!account || account.accountType !== 'expense') continue;

      const budgetLine = await tx.budgetLine.findFirst({
        where: {
          accountId: line.accountId,
          budget: {
            costCenter: line.costCenter,
            status: { in: ['approved', 'revised'] },
          },
        },
        orderBy: { budget: { version: 'desc' } },
      });
      if (!budgetLine) continue;

      await tx.budgetConsumption.create({
        data: {
          budgetLineId: budgetLine.id,
          journalId,
          amount: line.debitAmount,
        },
      });
    }
  }

  async dryRun(params: {
    accountId: string;
    costCenter: string;
    amount: number;
    entryDate: Date;
  }) {
    try {
      await this.checkExpenseLines(
        [
          {
            accountId: params.accountId,
            debitAmount: params.amount,
            creditAmount: 0,
            costCenter: params.costCenter,
          },
        ],
        params.entryDate,
      );
      return { ok: true };
    } catch (e) {
      if (e instanceof DomainException && e.code === ErrorCode.BUDGET_EXCEEDED) {
        return { ok: false, details: e.details };
      }
      throw e;
    }
  }
}
