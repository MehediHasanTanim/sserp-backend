import { ErrorCode } from '../../../shared/errors/domain-exception';
import { PayrollRunService } from './payroll-run.service';

describe('PayrollRunService', () => {
  let service: PayrollRunService;
  let prisma: any;
  let numbering: any;
  let events: any;
  let accounts: any;
  let ledger: any;
  let calendar: any;
  let statutory: any;
  let bankFiles: any;
  let queue: any;

  beforeEach(() => {
    prisma = {
      payrollGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          name: 'Default',
          employmentTypes: ['permanent'],
        }),
      },
      payrollRun: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'run1',
          status: 'draft',
          periodMonth: 7,
          periodYear: 2026,
          runNumber: 1,
          payrollGroupId: 'g1',
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'run1', ...data }),
          ),
      },
      organizationSettings: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ payrollDefaultWorkingDays: 22 }),
      },
      salaryStructure: { findMany: jest.fn().mockResolvedValue([]) },
      payrollSlip: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      payrollSlipLine: { deleteMany: jest.fn() },
      payrollAdjustment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      bonus: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    numbering = { nextCode: jest.fn().mockResolvedValue('PSL-000001') };
    events = { emitAsync: jest.fn() };
    accounts = {
      createPostedJournal: jest.fn().mockResolvedValue({ id: 'j1' }),
    };
    ledger = { post: jest.fn() };
    calendar = { countWorkingDays: jest.fn().mockResolvedValue(22) };
    statutory = {
      resolveActive: jest.fn().mockResolvedValue(null),
      computePf: jest.fn().mockReturnValue(0),
      computeIncomeTaxMonthly: jest.fn().mockReturnValue(0),
    };
    bankFiles = {
      generate: jest.fn().mockResolvedValue({
        content: 'csv',
        checksum: 'abc',
        objectKey: 'payroll/run1/bank.csv',
      }),
    };
    queue = { add: jest.fn() };

    service = new PayrollRunService(
      prisma,
      numbering,
      events,
      accounts,
      ledger,
      calendar,
      statutory,
      bankFiles,
      queue,
    );
  });

  it('rejects duplicate open run for same period', async () => {
    prisma.payrollRun.findMany.mockResolvedValue([
      { runNumber: 1, status: 'calculated' },
    ]);
    await expect(
      service.createRun(
        { payrollGroupId: 'g1', periodMonth: 7, periodYear: 2026 },
        'actor',
      ),
    ).rejects.toMatchObject({ code: ErrorCode.PAYROLL_RUN_EXISTS });
  });

  it('creates run and enqueues calculation', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      status: 'calculating',
      periodMonth: 7,
      periodYear: 2026,
      runNumber: 1,
      payrollGroupId: 'g1',
      slips: [],
      payrollGroup: { id: 'g1', name: 'Default' },
    });
    const run = await service.createRun(
      { payrollGroupId: 'g1', periodMonth: 7, periodYear: 2026 },
      'actor',
    );
    expect(run.id).toBe('run1');
    expect(queue.add).toHaveBeenCalledWith('calculate', {
      payrollRunId: 'run1',
    });
  });

  it('rejects lock without approval', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      status: 'calculated',
      slips: [],
      periodMonth: 7,
      periodYear: 2026,
      runNumber: 1,
    });
    await expect(service.lock('run1', 'actor')).rejects.toMatchObject({
      code: ErrorCode.RUN_NOT_APPROVED,
    });
  });

  it('rejects mutations on locked run', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      status: 'locked',
    });
    await expect(service.recalculate('run1')).rejects.toMatchObject({
      code: ErrorCode.PAYROLL_LOCKED,
    });
    await expect(service.cancel('run1')).rejects.toMatchObject({
      code: ErrorCode.PAYROLL_LOCKED,
    });
  });

  it('rejects bank file before lock', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      status: 'approved',
      slips: [],
      payrollGroup: {},
    });
    // getRun used by bankFile
    await expect(service.bankFile('run1')).rejects.toMatchObject({
      code: ErrorCode.PAYROLL_NOT_LOCKED,
    });
  });
});
