import { IepService } from './iep.service';

describe('IepService', () => {
  let prisma: {
    iepPlan: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    iepGoal: { create: jest.Mock };
    iepReview: { create: jest.Mock };
    iepAcknowledgment: { findUnique: jest.Mock; create: jest.Mock };
    student: { findFirst: jest.Mock };
    teacher: { findMany: jest.Mock };
    progressReportGoalLink: { deleteMany: jest.Mock };
    behavioralIncident: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let events: { emitAsync: jest.Mock };
  let service: IepService;

  const activeTeacherGoal = {
    id: 'goal1',
    skillDomainId: 'domain1',
    learningObjectiveId: null,
    goalType: 'short_term',
    description: 'Improve eye contact',
    baselineDescription: null,
    measurementCriteria: null,
    targetDate: new Date('2025-01-01'),
    status: 'not_started',
    progressPercentage: 0,
    sequence: 0,
    responsibleTeacherId: 'teacher1',
    skillDomain: { id: 'domain1', name: 'Communication' },
  };

  beforeEach(() => {
    prisma = {
      iepPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue({ id: 'iep1' }),
      },
      iepGoal: { create: jest.fn() },
      iepReview: { create: jest.fn().mockResolvedValue({ id: 'review1' }) },
      iepAcknowledgment: { findUnique: jest.fn(), create: jest.fn() },
      student: { findFirst: jest.fn() },
      teacher: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'teacher1',
            employee: { fullName: 'Ms. Rahman', employeeCode: 'EMP-1' },
          },
        ]),
      },
      progressReportGoalLink: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      behavioralIncident: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    service = new IepService(prisma as never, events as never, undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('publish', () => {
    it('archives the previous active plan and activates the new one', async () => {
      const plan = {
        id: 'iep1',
        studentId: 'stu1',
        status: 'draft',
        version: 2,
        reviewFrequencyMonths: 3,
        goals: [activeTeacherGoal],
      };
      prisma.iepPlan.findUnique.mockResolvedValue(plan);
      prisma.iepPlan.update.mockImplementation(({ data }) => ({
        ...plan,
        ...data,
      }));

      const result = await service.publish('iep1', 'coordinator1');

      expect(prisma.iepPlan.updateMany).toHaveBeenCalledWith({
        where: { studentId: 'stu1', status: 'active' },
        data: { status: 'archived' },
      });
      expect(prisma.iepPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'iep1' },
          data: expect.objectContaining({ status: 'active' }),
        }),
      );
      expect(result.status).toBe('active');
      expect(prisma.iepReview.create).toHaveBeenCalledTimes(1);
      expect(events.emitAsync).toHaveBeenCalledWith(
        'iep.published',
        expect.objectContaining({ studentId: 'stu1', iepId: 'iep1' }),
      );
    });

    it('sets next_review_date across a month boundary and schedules a review', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-11-15T00:00:00.000Z'));
      const plan = {
        id: 'iep1',
        studentId: 'stu1',
        status: 'draft',
        version: 1,
        reviewFrequencyMonths: 3,
        goals: [activeTeacherGoal],
      };
      prisma.iepPlan.findUnique.mockResolvedValue(plan);
      prisma.iepPlan.update.mockImplementation(({ data }) => ({
        ...plan,
        ...data,
      }));

      const result = await service.publish('iep1', 'coordinator1');

      expect(result.nextReviewDate?.toISOString().slice(0, 10)).toBe(
        '2025-02-15',
      );
      expect(prisma.iepReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          iepId: 'iep1',
          reviewType: 'quarterly',
          status: 'scheduled',
        }),
      });
    });

    it('rejects publishing without any goals', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        studentId: 'stu1',
        status: 'draft',
        version: 1,
        reviewFrequencyMonths: 3,
        goals: [],
      });

      await expect(
        service.publish('iep1', 'coordinator1'),
      ).rejects.toMatchObject({ statusCode: 422, code: 'IEP_INCOMPLETE' });
    });

    it('rejects publishing when a goal is missing a responsible teacher', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        studentId: 'stu1',
        status: 'draft',
        version: 1,
        reviewFrequencyMonths: 3,
        goals: [{ ...activeTeacherGoal, responsibleTeacherId: null }],
      });

      await expect(
        service.publish('iep1', 'coordinator1'),
      ).rejects.toMatchObject({ statusCode: 422, code: 'IEP_INCOMPLETE' });
    });

    it('rejects publishing an already-active plan (only drafts are editable)', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        studentId: 'stu1',
        status: 'active',
        version: 1,
        reviewFrequencyMonths: 3,
        goals: [activeTeacherGoal],
      });

      await expect(
        service.publish('iep1', 'coordinator1'),
      ).rejects.toMatchObject({ statusCode: 409, code: 'IEP_NOT_EDITABLE' });
    });
  });

  describe('update (editing)', () => {
    it('rejects editing a non-draft plan', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        studentId: 'stu1',
        status: 'active',
        goals: [],
      });

      await expect(
        service.update('iep1', { reviewFrequencyMonths: 6 }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'IEP_NOT_EDITABLE' });
    });

    it('allows editing a draft plan', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        studentId: 'stu1',
        status: 'draft',
        goals: [],
      });
      prisma.iepPlan.update.mockResolvedValue({ id: 'iep1', status: 'draft' });

      const result = await service.update('iep1', { reviewFrequencyMonths: 6 });
      expect(result.status).toBe('draft');
    });
  });

  describe('deleteDraft', () => {
    it('deletes a draft plan and clears goal references', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        status: 'draft',
        goals: [{ id: 'goal1' }],
      });

      const result = await service.deleteDraft('iep1');

      expect(result).toEqual({ id: 'iep1', deleted: true });
      expect(prisma.progressReportGoalLink.deleteMany).toHaveBeenCalled();
      expect(prisma.iepPlan.delete).toHaveBeenCalledWith({
        where: { id: 'iep1' },
      });
    });

    it('rejects deleting a non-draft plan', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        status: 'active',
        goals: [],
      });

      await expect(service.deleteDraft('iep1')).rejects.toMatchObject({
        statusCode: 409,
        code: 'IEP_NOT_EDITABLE',
      });
    });
  });

  describe('revise', () => {
    it('copies goals and increments the version', async () => {
      const source = {
        id: 'iep1',
        studentId: 'stu1',
        academicYearId: 'ay1',
        version: 1,
        status: 'active',
        reviewFrequencyMonths: 3,
        startDate: null,
        goals: [activeTeacherGoal, { ...activeTeacherGoal, id: 'goal2' }],
      };
      prisma.iepPlan.findUnique
        .mockResolvedValueOnce(source) // this.get(id) inside revise
        .mockResolvedValueOnce({ ...source, id: 'iep2', version: 2 }); // final findUnique inside tx

      prisma.iepPlan.create.mockResolvedValue({ id: 'iep2', version: 2 });

      const result = await service.revise('iep1', 'teacher1');

      expect(prisma.iepPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'stu1',
            version: 2,
            status: 'draft',
            previousVersionId: 'iep1',
          }),
        }),
      );
      expect(prisma.iepGoal.create).toHaveBeenCalledTimes(2);
      expect(result!.version).toBe(2);
      expect(events.emitAsync).toHaveBeenCalledWith(
        'iep.revised',
        expect.objectContaining({ previousIepId: 'iep1', newIepId: 'iep2' }),
      );
    });
  });

  describe('acknowledge', () => {
    it('creates a new acknowledgment and emits the event', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        status: 'active',
      });
      prisma.iepAcknowledgment.findUnique.mockResolvedValue(null);
      prisma.iepAcknowledgment.create.mockResolvedValue({
        id: 'ack1',
        iepId: 'iep1',
        guardianId: 'guardian1',
        acknowledgedAt: new Date('2024-01-01'),
      });

      const result = await service.acknowledge('iep1', 'guardian1', {
        signatureText: 'Jane Doe',
      });

      expect(result.id).toBe('ack1');
      expect(prisma.iepAcknowledgment.create).toHaveBeenCalledTimes(1);
      expect(events.emitAsync).toHaveBeenCalledWith(
        'iep.acknowledged',
        expect.objectContaining({ iepId: 'iep1', guardianId: 'guardian1' }),
      );
    });

    it('is idempotent: a repeat call returns the original acknowledgment', async () => {
      const existing = {
        id: 'ack1',
        iepId: 'iep1',
        guardianId: 'guardian1',
        acknowledgedAt: new Date('2024-01-01'),
      };
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        status: 'active',
      });
      prisma.iepAcknowledgment.findUnique.mockResolvedValue(existing);

      const result = await service.acknowledge('iep1', 'guardian1', {
        signatureText: 'Jane Doe (again)',
      });

      expect(result).toBe(existing);
      expect(prisma.iepAcknowledgment.create).not.toHaveBeenCalled();
      expect(events.emitAsync).not.toHaveBeenCalled();
    });

    it('rejects acknowledgment of a draft plan', async () => {
      prisma.iepPlan.findUnique.mockResolvedValue({
        id: 'iep1',
        status: 'draft',
      });

      await expect(
        service.acknowledge('iep1', 'guardian1', { signatureText: 'x' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
