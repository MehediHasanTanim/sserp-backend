import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AccountsService } from '../services/accounts.service';
import { RecurringJournalService } from '../services/recurring-journal.service';
import { ReceivableService } from '../services/receivable.service';

@Injectable()
export class AccountsOpsJob {
  private readonly logger = new Logger(AccountsOpsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly recurring: RecurringJournalService,
    private readonly receivables: ReceivableService,
  ) {}

  @Cron('0 1 * * *')
  async recurringGenerate() {
    const result = await this.recurring.generateDue();
    this.logger.log(`recurring-journals generated ${result.generated}`);
  }

  @Cron('30 2 * * *')
  async ledgerIntegrityCheck() {
    const agg = await this.prisma.journalEntry.aggregate({
      where: { status: 'posted' },
      _sum: { totalDebit: true, totalCredit: true },
    });
    const debit = agg._sum.totalDebit ?? 0;
    const credit = agg._sum.totalCredit ?? 0;
    if (debit !== credit) {
      this.logger.error(
        `Ledger integrity failure: debit=${debit} credit=${credit}`,
      );
    } else {
      this.logger.log('Ledger integrity OK');
    }
  }

  @Cron('0 7 * * 1')
  async arAgingLog() {
    const aging = await this.receivables.aging();
    this.logger.log(
      `AR aging: ${JSON.stringify(aging.buckets)} (${aging.count} open)`,
    );
  }

  @Cron('0 8 25 * *')
  async periodCloseReminder() {
    const now = new Date();
    const open = await this.prisma.fiscalPeriod.findFirst({
      where: {
        periodYear: now.getUTCFullYear(),
        periodMonth: now.getUTCMonth() + 1,
        status: 'open',
      },
    });
    if (open) {
      this.logger.warn(
        `Fiscal period ${open.periodYear}-${open.periodMonth} still open near month-end`,
      );
    }
  }

  @Cron('0 9 * * *')
  async chequeReminder() {
    const stale = await this.prisma.cheque.count({
      where: {
        status: 'presented',
        chequeDate: { lt: new Date(Date.now() - 7 * 86400000) },
      },
    });
    if (stale > 0) {
      this.logger.warn(
        `${stale} cheque(s) presented >7 days without clearance`,
      );
    }
  }

  /** Process pending outbox postings in created_at order. */
  async outboxReplay(limit = 50) {
    const pending = await this.prisma.pendingLedgerPosting.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let posted = 0;
    let failed = 0;
    for (const row of pending) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const journal = await this.accounts.postFromRequest(
            {
              referenceType: row.referenceType,
              referenceId: row.referenceId,
              amount: row.amount,
              costCenter: row.costCenter,
              description: row.description,
              debitAccountCode: row.debitAccountCode,
              creditAccountCode: row.creditAccountCode,
              postingDate: row.postingDate,
              payload: (row.payload as Record<string, unknown>) ?? undefined,
            },
            tx,
          );
          await tx.pendingLedgerPosting.update({
            where: { id: row.id },
            data: { status: 'posted', postedJournalId: journal.id },
          });
        });
        posted++;
      } catch (e: any) {
        failed++;
        await this.prisma.pendingLedgerPosting.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            errorMessage: e?.message ?? 'Unknown error',
          },
        });
        this.logger.error(`Outbox replay failed for ${row.id}: ${e?.message}`);
      }
    }
    return { processed: pending.length, posted, failed };
  }

  @Cron('*/15 * * * *')
  async outboxReplayCron() {
    const result = await this.outboxReplay();
    if (result.processed > 0) {
      this.logger.log(
        `outbox-replay posted=${result.posted} failed=${result.failed}`,
      );
    }
  }
}
