import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainException, ErrorCode } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const DAY_MS = 86400000;

export interface CreateReconciliationDto {
  bankAccountId: string;
  periodStart: Date;
  periodEnd: Date;
  statementClosingBalance: number;
  notes?: string;
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(bankAccountId?: string) {
    return this.prisma.reconciliation.findMany({
      where: bankAccountId ? { bankAccountId } : undefined,
      orderBy: { periodEnd: 'desc' },
    });
  }

  async findById(id: string) {
    const r = await this.prisma.reconciliation.findUnique({ where: { id } });
    if (!r) throw DomainException.notFound('Reconciliation not found');
    return r;
  }

  async create(dto: CreateReconciliationDto) {
    const systemBalance = await this.computeSystemBalance(
      dto.bankAccountId,
      dto.periodEnd,
    );
    const difference = dto.statementClosingBalance - systemBalance;
    return this.prisma.reconciliation.create({
      data: {
        ...dto,
        systemClosingBalance: systemBalance,
        difference,
        status: 'in_progress',
      },
    });
  }

  async autoMatch(reconciliationId: string) {
    const recon = await this.findById(reconciliationId);
    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id: recon.bankAccountId },
    });
    if (!bankAccount) throw DomainException.notFound('Bank account not found');

    const stmtLines = await this.prisma.bankStatementLine.findMany({
      where: {
        matchStatus: 'unmatched',
        transactionDate: { gte: recon.periodStart, lte: recon.periodEnd },
        statement: { bankAccountId: recon.bankAccountId },
      },
    });

    const journalLines = await this.prisma.journalLine.findMany({
      where: {
        accountId: bankAccount.coaAccountId,
        journal: {
          status: 'posted',
          entryDate: { gte: recon.periodStart, lte: recon.periodEnd },
        },
      },
      include: { journal: true },
    });

    let matched = 0;
    for (const sl of stmtLines) {
      const amount = sl.debitAmount || sl.creditAmount;
      const candidates = journalLines.filter((jl) => {
        const jlAmount = jl.debitAmount || jl.creditAmount;
        if (jlAmount !== amount) return false;
        const diff = Math.abs(sl.transactionDate.getTime() - jl.journal.entryDate.getTime());
        return diff <= 3 * DAY_MS;
      });
      if (candidates.length === 1) {
        await this.prisma.bankStatementLine.update({
          where: { id: sl.id },
          data: { matchedJournalLineId: candidates[0].id, matchStatus: 'auto_matched' },
        });
        matched++;
      }
    }
    return { matched };
  }

  async manualMatch(statementLineId: string, journalLineId: string, userId: string) {
    return this.prisma.bankStatementLine.update({
      where: { id: statementLineId },
      data: {
        matchedJournalLineId: journalLineId,
        matchStatus: 'manually_matched',
        matchedBy: userId,
      },
    });
  }

  async complete(id: string, completedBy: string) {
    const recon = await this.findById(id);
    if (recon.difference !== 0) {
      throw DomainException.withCode(
        ErrorCode.RECONCILIATION_UNBALANCED,
        422,
        `Difference must be zero (current: ${recon.difference})`,
      );
    }
    const unmatched = await this.prisma.bankStatementLine.count({
      where: {
        matchStatus: 'unmatched',
        statement: { bankAccountId: recon.bankAccountId },
        transactionDate: { gte: recon.periodStart, lte: recon.periodEnd },
      },
    });
    if (unmatched > 0) {
      throw DomainException.withCode(
        ErrorCode.RECONCILIATION_UNBALANCED,
        422,
        `${unmatched} unmatched statement line(s) remain`,
      );
    }
    const updated = await this.prisma.reconciliation.update({
      where: { id },
      data: { status: 'completed', completedBy, completedAt: new Date() },
    });
    this.events.emit(EventNames.RECONCILIATION_COMPLETED, { reconciliationId: id });
    return updated;
  }

  private async computeSystemBalance(bankAccountId: string, asOf: Date) {
    const bank = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!bank) return 0;
    const agg = await this.prisma.journalLine.aggregate({
      where: {
        accountId: bank.coaAccountId,
        journal: { status: 'posted', entryDate: { lte: asOf } },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    return bank.openingBalance + (agg._sum.debitAmount ?? 0) - (agg._sum.creditAmount ?? 0);
  }
}
