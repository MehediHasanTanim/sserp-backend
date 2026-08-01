import { ErrorCode } from '../../../shared/errors/domain-exception';
import { GratuitySettlementService } from './gratuity-settlement.service';

describe('GratuitySettlementService', () => {
  let service: GratuitySettlementService;
  let prisma: any;
  let ledger: any;
  let events: any;

  beforeEach(() => {
    prisma = {
      gratuityPayment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'pay1', ...data }),
          ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({
            id: where.id,
            deductionsAmount: 5000,
            grossAmount: 0,
            forfeitedAmount: 0,
            netPayable: 0,
            ...data,
          }),
        ),
      },
      employeeExit: {
        findUnique: jest.fn().mockResolvedValue({
          lastWorkingDay: new Date('2026-06-30'),
          exitType: 'resignation',
        }),
      },
      gratuityPolicy: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pol1',
          minServiceYears: 5,
          applicableEmploymentTypes: ['permanent'],
          daysPerYearOfService: 15,
          salaryBasis: 'basic',
          prorationMethod: 'monthly',
          maxYearsCounted: 20,
          forfeitureOnTermination: true,
          forfeitureReasons: ['misconduct'],
        }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1',
          employeeCode: 'E001',
          joiningDate: new Date('2018-01-01'),
          employmentType: 'permanent',
          department: 'administration',
          basicSalary: 30000,
          salaryStructures: [
            {
              grossAmount: 50000,
              lines: [
                {
                  amount: 30000,
                  salaryComponent: {
                    code: 'BASIC',
                    affectsGratuity: true,
                    componentType: 'earning',
                  },
                },
              ],
            },
          ],
        }),
      },
      organizationSettings: {
        findFirst: jest.fn().mockResolvedValue({
          gratuityLwpExclusionThresholdDays: 30,
        }),
      },
      gratuityProvision: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { provisionAmount: 100000 } }),
      },
      employeeLoan: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'loan1', outstandingAmount: 5000, status: 'repaying' },
          ]),
        update: jest.fn(),
      },
      gratuityLedger: {
        findFirst: jest.fn().mockResolvedValue({ runningBalance: 100000 }),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    ledger = {
      post: jest.fn().mockResolvedValue({ journalId: 'j1', deferred: false }),
    };
    events = { emitAsync: jest.fn() };
    service = new GratuitySettlementService(prisma, ledger, events);
  });

  it('rejects settlement without exit record', async () => {
    prisma.employeeExit.findUnique.mockResolvedValue(null);
    await expect(service.settle('e1', 'actor')).rejects.toMatchObject({
      code: ErrorCode.EXIT_RECORD_MISSING,
    });
  });

  it('rejects second settlement', async () => {
    prisma.gratuityPayment.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.settle('e1', 'actor')).rejects.toMatchObject({
      code: ErrorCode.ALREADY_SETTLED,
    });
  });

  it('deducts outstanding loan from net payable', async () => {
    const payment = await service.settle('e1', 'actor');
    expect(prisma.gratuityPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deductionsAmount: 5000,
        }),
      }),
    );
    const created = prisma.gratuityPayment.create.mock.calls[0][0].data;
    expect(created.netPayable).toBe(
      Math.max(0, created.grossAmount - created.forfeitedAmount - 5000),
    );
    expect(prisma.employeeLoan.update).toHaveBeenCalled();
    expect(payment.id).toBe('pay1');
  });
});
