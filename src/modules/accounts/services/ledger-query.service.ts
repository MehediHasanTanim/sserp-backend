import { Injectable } from '@nestjs/common';
import { DomainException } from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class LedgerQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccountLedger(accountId: string, from: Date, to: Date) {
    const account = await this.prisma.chartOfAccount.findUnique({ where: { id: accountId } });
    if (!account) throw DomainException.notFound('Account not found');

    const priorLines = await this.prisma.journalLine.aggregate({
      where: {
        accountId,
        journal: { status: 'posted', entryDate: { lt: from } },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const priorDebit = priorLines._sum.debitAmount ?? 0;
    const priorCredit = priorLines._sum.creditAmount ?? 0;
    let runningBalance =
      account.normalBalance === 'debit'
        ? account.openingBalance + priorDebit - priorCredit
        : account.openingBalance + priorCredit - priorDebit;

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journal: { status: 'posted', entryDate: { gte: from, lte: to } },
      },
      include: {
        journal: { select: { entryNumber: true, entryDate: true, description: true } },
      },
      orderBy: [{ journal: { entryDate: 'asc' } }, { lineNumber: 'asc' }],
    });

    const entries = lines.map((line) => {
      const delta =
        account.normalBalance === 'debit'
          ? line.debitAmount - line.creditAmount
          : line.creditAmount - line.debitAmount;
      runningBalance += delta;
      return {
        ...line,
        runningBalance,
      };
    });

    return {
      account,
      from,
      to,
      openingBalance: runningBalance - entries.reduce((s, e) => {
        const d =
          account.normalBalance === 'debit'
            ? e.debitAmount - e.creditAmount
            : e.creditAmount - e.debitAmount;
        return s + d;
      }, 0),
      closingBalance: runningBalance,
      lines: entries,
    };
  }
}
