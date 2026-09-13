import { ErrorCode } from '../../../shared/errors/domain-exception';
import { IepGoalService } from './iep-goal.service';

describe('IepGoalService', () => {
  let prisma: {
    iepPlan: { findUnique: jest.Mock };
    iepGoal: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    iepGoalProgressEntry: { create: jest.Mock };
    teacher: { findMany: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: IepGoalService;

  const goal = {
    id: 'goal1',
    iepId: 'iep1',
    status: 'not_started',
    progressPercentage: 0,
    responsibleTeacherId: 'teacher1',
    skillDomain: { id: 'domain1', name: 'Communication' },
  };

  const plan = {
    id: 'iep1',
    status: 'active',
  };

  beforeEach(() => {
    prisma = {
      iepPlan: { findUnique: jest.fn().mockResolvedValue(plan) },
      iepGoal: {
        findUnique: jest.fn().mockResolvedValue(goal),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({
          ...goal,
          status: 'in_progress',
          progressPercentage: 40,
        }),
      },
      iepGoalProgressEntry: { create: jest.fn().mockResolvedValue({}) },
      teacher: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'teacher1',
            employee: { fullName: 'Ms. Rahman', employeeCode: 'EMP-1' },
          },
        ]),
        findUnique: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    service = new IepGoalService(prisma as never);
  });

  describe('recordProgress — I-06 / I-07', () => {
    it('throws FORBIDDEN when a non-responsible teacher records progress', async () => {
      prisma.user.findUnique.mockResolvedValue({ employeeId: 'emp-other' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-other' });

      await expect(
        service.recordProgress(
          'goal1',
          { toStatus: 'in_progress', progressPercentage: 40 },
          { id: 'user-other', roles: ['teacher'] },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: ErrorCode.FORBIDDEN,
      });
      expect(prisma.iepGoalProgressEntry.create).not.toHaveBeenCalled();
    });

    it('allows a coordinator to record progress without being the responsible teacher', async () => {
      await service.recordProgress(
        'goal1',
        { toStatus: 'in_progress', progressPercentage: 40, narrative: 'ok' },
        { id: 'coord1', roles: ['coordinator'] },
      );

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.iepGoalProgressEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          goalId: 'goal1',
          fromStatus: 'not_started',
          toStatus: 'in_progress',
          progressPercentage: 40,
          recordedBy: 'coord1',
        }),
      });
    });

    it('allows a super_admin to record progress', async () => {
      await service.recordProgress(
        'goal1',
        { toStatus: 'achieved', progressPercentage: 100 },
        { id: 'admin1', roles: ['super_admin'] },
      );

      expect(prisma.iepGoalProgressEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: 'not_started',
          toStatus: 'achieved',
          recordedBy: 'admin1',
        }),
      });
    });

    it('appends a progress entry on every status change by the responsible teacher', async () => {
      prisma.user.findUnique.mockResolvedValue({ employeeId: 'emp1' });
      prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher1' });

      await service.recordProgress(
        'goal1',
        {
          toStatus: 'in_progress',
          progressPercentage: 25,
          narrative: 'Started',
        },
        { id: 'user1', roles: ['teacher'] },
      );

      expect(prisma.iepGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal1' },
        data: { status: 'in_progress', progressPercentage: 25 },
      });
      expect(prisma.iepGoalProgressEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          goalId: 'goal1',
          fromStatus: 'not_started',
          toStatus: 'in_progress',
          progressPercentage: 25,
          narrative: 'Started',
          recordedBy: 'user1',
        }),
      });
    });
  });
});
