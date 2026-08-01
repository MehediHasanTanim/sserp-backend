import { ErrorCode } from '../../../shared/errors/domain-exception';
import { AppraisalService } from './appraisal.service';
import { RecruitmentService } from './recruitment.service';
import { TrainingService } from './training.service';
import { BenefitsService } from './benefits.service';

describe('Soft HR unit smoke', () => {
  it('AppraisalService rejects KPI weights not summing to 100', async () => {
    const prisma: any = {
      appraisal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a1',
          employeeId: 'e1',
          reviewCycleId: 'c1',
          status: 'self_submitted',
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      reviewCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          managerAppraisalDeadline: new Date(Date.now() + 86400000),
        }),
      },
      kpi: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'k1', weightPercent: 40 },
          { id: 'k2', weightPercent: 40 },
        ]),
      },
    };
    const service = new AppraisalService(prisma, {
      emitAsync: jest.fn(),
    } as never);
    await expect(
      service.submitManager(
        'a1',
        {
          overallRating: 4,
          kpiScores: [
            { kpiId: 'k1', managerScore: 4 },
            { kpiId: 'k2', managerScore: 3 },
          ],
        },
        'manager-user',
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.KPI_WEIGHTS_INVALID,
    });
  });

  it('RecruitmentService rejects skipped stage forward', async () => {
    const prisma: any = {
      applicant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'ap1', stage: 'applied' }),
      },
    };
    const service = new RecruitmentService(
      prisma,
      {} as never,
      { emitAsync: jest.fn() } as never,
      {} as never,
    );
    await expect(
      service.changeStage('ap1', 'interviewing'),
    ).rejects.toMatchObject({
      code: ErrorCode.INVALID_STAGE_TRANSITION,
    });
  });

  it('TrainingService rejects over-capacity enroll', async () => {
    const prisma: any = {
      trainingProgram: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          maxParticipants: 1,
          _count: { enrollments: 1 },
        }),
      },
    };
    const service = new TrainingService(
      prisma,
      {} as never,
      { emitAsync: jest.fn() } as never,
    );
    await expect(service.enroll('p1', ['e1'], 'actor')).rejects.toMatchObject({
      code: ErrorCode.CAPACITY_FULL,
    });
  });

  it('BenefitsService loan schedule length matches installment count', async () => {
    const repayments: unknown[] = [];
    const prisma: any = {
      employeeLoan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'l1',
          status: 'approved',
          principalAmount: 12000,
          installmentCount: 12,
          installmentAmount: 1000,
          firstDeductionMonth: 1,
          firstDeductionYear: 2026,
          employeeId: 'e1',
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'l1', ...data, repayments }),
          ),
      },
      loanRepayment: {
        createMany: jest.fn().mockImplementation(({ data }) => {
          repayments.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const ledger = {
      post: jest.fn().mockResolvedValue({ journalId: 'j1', deferred: false }),
    };
    const service = new BenefitsService(
      prisma,
      ledger as never,
      { emitAsync: jest.fn() } as never,
    );
    await service.disburseLoan('l1', 'actor');
    expect(repayments).toHaveLength(12);
  });
});
