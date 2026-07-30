import { BudgetCheckService } from './budget-check.service';
import { ErrorCode } from '../../../shared/errors/domain-exception';

describe('BudgetCheckService', () => {
  let service: BudgetCheckService;
  let prisma: any;
  let events: any;

  beforeEach(() => {
    prisma = {
      chartOfAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'exp1',
          accountCode: '5400',
          accountType: 'expense',
        }),
      },
      budget: {
        findFirst: jest.fn(),
      },
      budgetConsumption: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 900 } }),
      },
    };
    events = { emit: jest.fn() };
    service = new BudgetCheckService(prisma, events);
  });

  it('BU-01: under budget passes', async () => {
    prisma.budget.findFirst.mockResolvedValue({
      id: 'b1',
      enforcementMode: 'block',
      lines: [{ id: 'bl1', periodMonth: null, allocatedAmount: 1000, revisedAmount: null }],
    });
    await expect(
      service.checkExpenseLines(
        [{ accountId: 'exp1', debitAmount: 50, creditAmount: 0, costCenter: 'admin' }],
        new Date('2026-07-15'),
      ),
    ).resolves.toBeUndefined();
  });

  it('BU-01: one paisa over fails in block mode', async () => {
    prisma.budget.findFirst.mockResolvedValue({
      id: 'b1',
      enforcementMode: 'block',
      lines: [{ id: 'bl1', periodMonth: null, allocatedAmount: 1000, revisedAmount: null }],
    });
    prisma.budgetConsumption.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });
    await expect(
      service.checkExpenseLines(
        [{ accountId: 'exp1', debitAmount: 1, creditAmount: 0, costCenter: 'admin' }],
        new Date('2026-07-15'),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.BUDGET_EXCEEDED });
  });

  it('BU-01: warn mode posts with warning emit', async () => {
    prisma.budget.findFirst.mockResolvedValue({
      id: 'b1',
      enforcementMode: 'warn',
      lines: [{ id: 'bl1', periodMonth: null, allocatedAmount: 1000, revisedAmount: null }],
    });
    prisma.budgetConsumption.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });
    await service.checkExpenseLines(
      [{ accountId: 'exp1', debitAmount: 1, creditAmount: 0, costCenter: 'admin' }],
      new Date('2026-07-15'),
    );
    expect(events.emit).toHaveBeenCalled();
  });

  it('BU-02: principal override succeeds', async () => {
    prisma.budget.findFirst.mockResolvedValue({
      id: 'b1',
      enforcementMode: 'block',
      lines: [{ id: 'bl1', periodMonth: null, allocatedAmount: 1000, revisedAmount: null }],
    });
    prisma.budgetConsumption.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });
    await expect(
      service.checkExpenseLines(
        [{ accountId: 'exp1', debitAmount: 1, creditAmount: 0, costCenter: 'admin' }],
        new Date('2026-07-15'),
        { overrideReason: 'Principal approved overage for emergency' },
      ),
    ).resolves.toBeUndefined();
  });

  it('BU-04: no approved budget does not block', async () => {
    prisma.budget.findFirst.mockResolvedValue(null);
    await expect(
      service.checkExpenseLines(
        [{ accountId: 'exp1', debitAmount: 5000, creditAmount: 0, costCenter: 'admin' }],
        new Date('2026-07-15'),
      ),
    ).resolves.toBeUndefined();
  });
});
