import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { AccountsService } from '../../src/modules/accounts/services/accounts.service';
import {
  DomainException,
  ErrorCode,
} from '../../src/shared/errors/domain-exception';
import { createHarnessApp } from './helpers/harness.helper';

/**
 * AC-01 pilot — DR=CR enforced via AccountsService.createPostedJournal.
 */
describe('Accounts DR=CR integration (harness pilot)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accounts: AccountsService;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
    accounts = app.get(AccountsService);
  }, 180000);

  it('rejects unbalanced journal lines (AC-01)', async () => {
    const accountsList = await prisma.chartOfAccount.findMany({
      where: { isGroup: false, isActive: true, allowManualPosting: true },
      take: 5,
    });
    if (accountsList.length < 2) return;

    const a = accountsList[0];
    const b = accountsList[1];

    await expect(
      prisma.$transaction(async (tx) =>
        accounts.createPostedJournal(
          {
            entryDate: new Date('2026-07-01'),
            entryType: 'manual',
            description: 'unbalanced pilot',
            lines: [
              {
                accountId: a.id,
                debitAmount: 100_00,
                creditAmount: 0,
              },
              {
                accountId: b.id,
                debitAmount: 0,
                creditAmount: 50_00,
              },
            ],
            skipBudgetCheck: true,
          },
          tx,
        ),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.JOURNAL_UNBALANCED,
    } as Partial<DomainException>);
  });
});
