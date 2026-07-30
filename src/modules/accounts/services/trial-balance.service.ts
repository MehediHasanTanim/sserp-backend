import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class TrialBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async asOf(asOfDate: Date) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { isActive: true, isGroup: false },
      orderBy: { accountCode: 'asc' },
    });

    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const account of accounts) {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journal: { status: 'posted', entryDate: { lte: asOfDate } },
        },
        _sum: { debitAmount: true, creditAmount: true },
      });
      const debit = (agg._sum.debitAmount ?? 0) + (account.normalBalance === 'debit' ? account.openingBalance : 0);
      const credit = (agg._sum.creditAmount ?? 0) + (account.normalBalance === 'credit' ? account.openingBalance : 0);
      const netDebit = Math.max(debit - credit, 0);
      const netCredit = Math.max(credit - debit, 0);
      if (netDebit === 0 && netCredit === 0) continue;
      totalDebit += netDebit;
      totalCredit += netCredit;
      rows.push({
        accountId: account.id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: netDebit,
        credit: netCredit,
      });
    }

    return { asOfDate, rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
  }
}
