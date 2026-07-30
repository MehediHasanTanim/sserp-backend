import { AccountsService, JournalLineInput } from './accounts.service';
import { DomainException, ErrorCode } from '../../../shared/errors/domain-exception';

describe('AccountsService', () => {
  let service: AccountsService;
  let numbering: any;
  let fiscalPeriods: any;
  let postingRules: any;
  let events: any;
  let tx: any;

  const debitAccount = {
    id: 'acc-dr',
    accountCode: '1210',
    isActive: true,
    isGroup: false,
    allowManualPosting: true,
    accountType: 'asset',
  };
  const creditAccount = {
    id: 'acc-cr',
    accountCode: '4200',
    isActive: true,
    isGroup: false,
    allowManualPosting: true,
    accountType: 'revenue',
  };

  beforeEach(() => {
    numbering = { nextCode: jest.fn().mockResolvedValue('JE-000001') };
    fiscalPeriods = {
      requireOpenForDate: jest.fn().mockResolvedValue({ id: 'fp1', status: 'open' }),
    };
    postingRules = {
      resolve: jest.fn().mockResolvedValue({
        debitAccountCode: '1210',
        creditAccountCode: '4200',
        costCenter: 'school',
      }),
    };
    events = { emit: jest.fn() };
    service = new AccountsService(
      numbering,
      fiscalPeriods,
      postingRules,
      events,
      undefined,
    );

    tx = {
      journalEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'j1',
            entryNumber: data.entryNumber,
            entryType: data.entryType,
            totalDebit: data.totalDebit,
            totalCredit: data.totalCredit,
            lines: data.lines.create,
          }),
        ),
      },
      chartOfAccount: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.accountCode === '1210' || where.id === 'acc-dr') return debitAccount;
          if (where.accountCode === '4200' || where.id === 'acc-cr') return creditAccount;
          return null;
        }),
        findMany: jest.fn().mockResolvedValue([debitAccount, creditAccount]),
      },
    };
  });

  function balancedLines(): JournalLineInput[] {
    return [
      { accountId: 'acc-dr', debitAmount: 1000, creditAmount: 0, costCenter: 'school' },
      { accountId: 'acc-cr', debitAmount: 0, creditAmount: 1000, costCenter: 'school' },
    ];
  }

  it('AC-01: balanced two-line posting succeeds', async () => {
    const journal = await service.createPostedJournal(
      {
        entryDate: new Date('2026-07-01'),
        entryType: 'system',
        description: 'test',
        costCenter: 'school',
        lines: balancedLines(),
      },
      tx,
    );
    expect(journal.totalDebit).toBe(1000);
    expect(journal.totalCredit).toBe(1000);
    expect(events.emit).toHaveBeenCalled();
  });

  it('AC-01: 1-paisa imbalance throws JOURNAL_UNBALANCED', async () => {
    await expect(
      service.createPostedJournal(
        {
          entryDate: new Date('2026-07-01'),
          entryType: 'system',
          description: 'bad',
          costCenter: 'school',
          lines: [
            { accountId: 'acc-dr', debitAmount: 1001, creditAmount: 0, costCenter: 'school' },
            { accountId: 'acc-cr', debitAmount: 0, creditAmount: 1000, costCenter: 'school' },
          ],
        },
        tx,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.JOURNAL_UNBALANCED });
  });

  it('AC-02: single-line posting throws', async () => {
    expect(() =>
      service.validateLines([
        { accountId: 'acc-dr', debitAmount: 100, creditAmount: 0 },
      ]),
    ).toThrow(/at least two/);
  });

  it('AC-03: line with both debit and credit throws', async () => {
    expect(() =>
      service.validateLines([
        { accountId: 'acc-dr', debitAmount: 50, creditAmount: 50 },
        { accountId: 'acc-cr', debitAmount: 0, creditAmount: 0 },
      ]),
    ).toThrow(/exactly one/);
  });

  it('AC-04: posting to group account throws', async () => {
    tx.chartOfAccount.findMany.mockResolvedValue([
      { ...debitAccount, isGroup: true },
      creditAccount,
    ]);
    await expect(
      service.createPostedJournal(
        {
          entryDate: new Date('2026-07-01'),
          entryType: 'manual',
          description: 'group',
          costCenter: 'school',
          lines: balancedLines(),
        },
        tx,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_ACCOUNT });
  });

  it('AC-05: closed period throws', async () => {
    fiscalPeriods.requireOpenForDate.mockRejectedValue(
      DomainException.withCode(ErrorCode.PERIOD_CLOSED, 409, 'closed'),
    );
    await expect(
      service.createPostedJournal(
        {
          entryDate: new Date('2026-07-01'),
          entryType: 'system',
          description: 'x',
          costCenter: 'school',
          lines: balancedLines(),
        },
        tx,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.PERIOD_CLOSED });
  });

  it('AC-09: duplicate idempotency returns existing', async () => {
    tx.journalEntry.findUnique.mockResolvedValue({
      id: 'existing',
      idempotencyReference: 'fee_invoice:1:default',
      lines: [],
    });
    const journal = await service.createPostedJournal(
      {
        entryDate: new Date('2026-07-01'),
        entryType: 'system',
        description: 'x',
        costCenter: 'school',
        idempotencyReference: 'fee_invoice:1:default',
        lines: balancedLines(),
      },
      tx,
    );
    expect(journal.id).toBe('existing');
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('AC-10: missing posting rule throws', async () => {
    postingRules.resolve.mockRejectedValue(
      DomainException.withCode(ErrorCode.POSTING_RULE_MISSING, 422, 'missing'),
    );
    await expect(
      service.postFromRequest(
        {
          referenceType: 'unknown',
          referenceId: 'x',
          amount: 100,
          costCenter: 'school',
          description: 'x',
          debitAccountCode: '1210',
          creditAccountCode: '4200',
          postingDate: new Date(),
        },
        tx,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.POSTING_RULE_MISSING });
  });

  it('AC-11: missing cost center throws', async () => {
    await expect(
      service.createPostedJournal(
        {
          entryDate: new Date('2026-07-01'),
          entryType: 'system',
          description: 'x',
          lines: [
            { accountId: 'acc-dr', debitAmount: 100, creditAmount: 0 },
            { accountId: 'acc-cr', debitAmount: 0, creditAmount: 100 },
          ],
        },
        tx,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.COST_CENTER_REQUIRED });
  });

  it('AC-12: missing tx throws', async () => {
    await expect(
      service.createPostedJournal(
        {
          entryDate: new Date('2026-07-01'),
          entryType: 'system',
          description: 'x',
          costCenter: 'school',
          lines: balancedLines(),
        },
        undefined as any,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TRANSACTION_REQUIRED });
  });
});
