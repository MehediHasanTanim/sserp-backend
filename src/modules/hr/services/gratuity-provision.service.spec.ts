import { ErrorCode } from '../../../shared/errors/domain-exception';
import { GratuityProvisionService } from './gratuity-provision.service';

describe('GratuityProvisionService', () => {
  let service: GratuityProvisionService;
  let prisma: any;
  let ledger: any;
  let events: any;

  beforeEach(() => {
    prisma = {
      gratuityPolicy: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pol1',
          minServiceYears: 5,
          applicableEmploymentTypes: ['permanent'],
          daysPerYearOfService: 15,
          salaryBasis: 'basic',
          prorationMethod: 'monthly',
          maxYearsCounted: 20,
        }),
      },
      organizationSettings: {
        findFirst: jest.fn().mockResolvedValue({
          gratuityLwpExclusionThresholdDays: 30,
        }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            employeeCode: 'E001',
            department: 'administration',
            employmentType: 'permanent',
            joiningDate: new Date('2018-01-01'),
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
          },
        ]),
      },
      gratuityProvision: {
        findUnique: jest.fn().mockResolvedValue(null),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { provisionAmount: 0 } }),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'prov1', ...data }),
          ),
        update: jest.fn(),
      },
      gratuityLedger: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      gratuityEntitlement: { upsert: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    ledger = {
      post: jest.fn().mockResolvedValue({ journalId: 'j1', deferred: false }),
    };
    events = { emitAsync: jest.fn() };
    service = new GratuityProvisionService(prisma, ledger, events);
  });

  it('first provision equals full entitlement (positive delta)', async () => {
    const result = await service.runMonthly(2026, 7);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].provisionAmount).toBeGreaterThan(0);
    expect(ledger.post).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'gratuity_provision',
        debitAccountCode: '',
        creditAccountCode: '',
      }),
      expect.anything(),
    );
  });

  it('re-run skips existing month (idempotent)', async () => {
    prisma.gratuityProvision.findUnique.mockResolvedValue({
      id: 'existing',
      provisionAmount: 1000,
    });
    const result = await service.runMonthly(2026, 7);
    expect(result.results[0].skipped).toBe(true);
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('salary decrease produces negative delta provision', async () => {
    prisma.gratuityProvision.aggregate.mockResolvedValue({
      _sum: { provisionAmount: 999_999_999 },
    });
    const result = await service.runMonthly(2026, 7);
    expect(result.results[0].provisionAmount).toBeLessThan(0);
  });

  it('adjust without reason is forbidden', async () => {
    await expect(
      service.adjust('e1', { amount: 100, reason: '' }, 'actor'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });
});
