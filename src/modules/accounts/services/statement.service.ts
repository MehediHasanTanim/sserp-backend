import { Injectable } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class StatementService {
  constructor(private readonly prisma: PrismaService) {}

  async pnl(from: Date, to: Date, costCenter?: string) {
    const types: AccountType[] = ['revenue', 'expense'];
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { accountType: { in: types }, isGroup: false, isActive: true },
    });
    let revenue = 0;
    let expense = 0;
    const lines = [];
    for (const account of accounts) {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          costCenter: costCenter ?? undefined,
          journal: { status: 'posted', entryDate: { gte: from, lte: to } },
        },
        _sum: { debitAmount: true, creditAmount: true },
      });
      const net =
        account.accountType === 'revenue'
          ? (agg._sum.creditAmount ?? 0) - (agg._sum.debitAmount ?? 0)
          : (agg._sum.debitAmount ?? 0) - (agg._sum.creditAmount ?? 0);
      if (net === 0) continue;
      if (account.accountType === 'revenue') revenue += net;
      else expense += net;
      lines.push({ accountCode: account.accountCode, accountName: account.accountName, amount: net });
    }
    return { from, to, costCenter, revenue, expense, netProfit: revenue - expense, lines };
  }

  async balanceSheet(asOf: Date, costCenter?: string) {
    const types: AccountType[] = ['asset', 'liability', 'equity'];
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { accountType: { in: types }, isGroup: false, isActive: true },
    });
    const sections = { assets: 0, liabilities: 0, equity: 0 };
    const lines: Record<string, Array<{ code: string; name: string; amount: number }>> = {
      assets: [],
      liabilities: [],
      equity: [],
    };
    for (const account of accounts) {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          costCenter: costCenter ?? undefined,
          journal: { status: 'posted', entryDate: { lte: asOf } },
        },
        _sum: { debitAmount: true, creditAmount: true },
      });
      const opening =
        account.normalBalance === 'debit' ? account.openingBalance : -account.openingBalance;
      const balance =
        account.normalBalance === 'debit'
          ? opening + (agg._sum.debitAmount ?? 0) - (agg._sum.creditAmount ?? 0)
          : opening + (agg._sum.creditAmount ?? 0) - (agg._sum.debitAmount ?? 0);
      if (balance === 0) continue;
      const key =
        account.accountType === 'asset'
          ? 'assets'
          : account.accountType === 'liability'
            ? 'liabilities'
            : 'equity';
      sections[key] += balance;
      lines[key].push({ code: account.accountCode, name: account.accountName, amount: balance });
    }
    const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
    const pnl = await this.pnl(yearStart, asOf, costCenter);
    sections.equity += pnl.netProfit;
    const balanced =
      Math.abs(sections.assets - (sections.liabilities + sections.equity)) < 1;
    return { asOf, sections, lines, currentPeriodProfit: pnl.netProfit, balanced };
  }

  /** Indirect method stub — reconciles net profit to cash movement. */
  async cashFlow(from: Date, to: Date) {
    const pnl = await this.pnl(from, to);
    const cashAccounts = await this.prisma.chartOfAccount.findMany({
      where: {
        OR: [{ accountType: 'asset', path: { contains: 'cash' } }],
        isGroup: false,
      },
    });
    let cashMovement = 0;
    for (const account of cashAccounts) {
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journal: { status: 'posted', entryDate: { gte: from, lte: to } },
        },
        _sum: { debitAmount: true, creditAmount: true },
      });
      cashMovement += (agg._sum.debitAmount ?? 0) - (agg._sum.creditAmount ?? 0);
    }
    const reconciliationDifference = cashMovement - pnl.netProfit;
    return {
      from,
      to,
      netProfit: pnl.netProfit,
      cashMovement,
      reconciliationDifference,
      indirectMethodStub: true,
    };
  }

  async costCenterProfitability(from: Date, to: Date) {
    const centers = await this.prisma.journalLine.findMany({
      where: {
        costCenter: { not: null },
        journal: { status: 'posted', entryDate: { gte: from, lte: to } },
      },
      select: { costCenter: true },
      distinct: ['costCenter'],
    });
    const results = [];
    for (const { costCenter } of centers) {
      if (!costCenter) continue;
      const pnl = await this.pnl(from, to, costCenter);
      results.push({ costCenter, netProfit: pnl.netProfit, revenue: pnl.revenue, expense: pnl.expense });
    }
    return results;
  }
}
