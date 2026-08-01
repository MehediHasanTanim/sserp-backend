import { ProgressReportService } from './progress-report.service';

describe('ProgressReportService', () => {
  let prisma: {
    student: { findFirst: jest.Mock };
    progressReport: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    reportTemplate: { findFirst: jest.Mock };
    iepPlan: { findFirst: jest.Mock };
    progressReportGoalLink: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let events: { emitAsync: jest.Mock };
  let pdfQueue: { add: jest.Mock };
  let service: ProgressReportService;

  const student = { id: 'stu1', disabilityCategory: 'autism' };

  beforeEach(() => {
    prisma = {
      student: { findFirst: jest.fn().mockResolvedValue(student) },
      progressReport: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      reportTemplate: { findFirst: jest.fn() },
      iepPlan: { findFirst: jest.fn().mockResolvedValue(null) },
      progressReportGoalLink: { create: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    pdfQueue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new ProgressReportService(
      prisma as never,
      events as never,
      pdfQueue as never,
    );
  });

  describe('create — template resolution (P-06) and P-04/P-07', () => {
    it('prefers the disability-category-specific template over the catch-all', async () => {
      const specificTemplate = {
        id: 'tpl-autism',
        reportType: 'quarterly_iep',
      };
      prisma.progressReport.findUnique.mockResolvedValue(null);
      prisma.reportTemplate.findFirst.mockResolvedValueOnce(specificTemplate);
      prisma.progressReport.create.mockResolvedValue({ id: 'rep1' });

      await service.create('stu1', {
        reportType: 'quarterly_iep',
        periodStart: '2024-01-01',
        periodEnd: '2024-03-31',
        academicYearId: 'ay1',
      });

      expect(prisma.reportTemplate.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.reportTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ disabilityCategory: 'autism' }),
        }),
      );
      expect(prisma.progressReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ templateId: 'tpl-autism' }),
        }),
      );
    });

    it('falls back to the catch-all template when no category-specific one exists', async () => {
      prisma.progressReport.findUnique.mockResolvedValue(null);
      prisma.reportTemplate.findFirst
        .mockResolvedValueOnce(null) // category-specific lookup
        .mockResolvedValueOnce({ id: 'tpl-catchall' }); // catch-all lookup
      prisma.progressReport.create.mockResolvedValue({ id: 'rep1' });

      await service.create('stu1', {
        reportType: 'quarterly_iep',
        periodStart: '2024-01-01',
        periodEnd: '2024-03-31',
        academicYearId: 'ay1',
      });

      expect(prisma.reportTemplate.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.progressReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ templateId: 'tpl-catchall' }),
        }),
      );
    });

    it('throws NO_TEMPLATE when neither template exists', async () => {
      prisma.progressReport.findUnique.mockResolvedValue(null);
      prisma.reportTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.create('stu1', {
          reportType: 'quarterly_iep',
          periodStart: '2024-01-01',
          periodEnd: '2024-03-31',
          academicYearId: 'ay1',
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: 'NO_TEMPLATE' });
    });

    it('rejects a duplicate (student, type, period) with REPORT_EXISTS', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create('stu1', {
          reportType: 'monthly_progress',
          periodStart: '2024-01-01',
          periodEnd: '2024-01-31',
          academicYearId: 'ay1',
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'REPORT_EXISTS' });
    });

    it('requires at least one IEP goal link for a monthly report when the student has an active IEP', async () => {
      prisma.progressReport.findUnique.mockResolvedValue(null);
      prisma.reportTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      prisma.iepPlan.findFirst.mockResolvedValue({
        id: 'iep1',
        status: 'active',
      });

      await expect(
        service.create('stu1', {
          reportType: 'monthly_progress',
          periodStart: '2024-01-01',
          periodEnd: '2024-01-31',
          academicYearId: 'ay1',
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: 'GOAL_LINK_REQUIRED' });
    });

    it('allows a monthly report without goal links when the student has no active IEP', async () => {
      prisma.progressReport.findUnique
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({ id: 'rep1' }); // post-create refetch
      prisma.reportTemplate.findFirst.mockResolvedValue({ id: 'tpl1' });
      prisma.iepPlan.findFirst.mockResolvedValue(null);
      prisma.progressReport.create.mockResolvedValue({ id: 'rep1' });

      const result = await service.create('stu1', {
        reportType: 'monthly_progress',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        academicYearId: 'ay1',
      });
      expect(result).toEqual({ id: 'rep1' });
    });
  });

  describe('workflow transitions (P-01/P-02/P-03)', () => {
    it('submit: draft -> submitted', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'draft',
        submittedBy: null,
      });
      prisma.progressReport.update.mockImplementation(({ data }) => ({
        id: 'rep1',
        status: data.status,
        submittedBy: data.submittedBy,
      }));

      const result = await service.submit('rep1', 'teacher1');
      expect(result.status).toBe('submitted');
      expect(events.emitAsync).toHaveBeenCalledWith(
        'progress_report.submitted',
        expect.objectContaining({ reportId: 'rep1' }),
      );
    });

    it('submit: rejects submitting a non-draft report', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'submitted',
        submittedBy: 'teacher1',
      });

      await expect(service.submit('rep1', 'teacher1')).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_REPORT_TRANSITION',
      });
    });

    it('approve: submitted -> approved', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'submitted',
        submittedBy: 'teacher1',
      });
      prisma.progressReport.update.mockImplementation(({ data }) => ({
        id: 'rep1',
        status: data.status,
      }));

      const result = await service.approve('rep1', 'coordinator1');
      expect(result.status).toBe('approved');
      expect(events.emitAsync).toHaveBeenCalledWith(
        'progress_report.approved',
        expect.objectContaining({ reportId: 'rep1' }),
      );
    });

    it('approve: a teacher cannot approve their own report', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'submitted',
        submittedBy: 'teacher1',
      });

      await expect(service.approve('rep1', 'teacher1')).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('approve: rejects approving a non-submitted report', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'draft',
        submittedBy: null,
      });

      await expect(
        service.approve('rep1', 'coordinator1'),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_REPORT_TRANSITION',
      });
    });

    it('reject: requires a comment', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'submitted',
        submittedBy: 'teacher1',
      });

      await expect(
        service.reject('rep1', 'coordinator1', ''),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('reject: submitted -> draft, retaining the reviewer comment', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'submitted',
        submittedBy: 'teacher1',
      });
      prisma.progressReport.update.mockImplementation(({ data }) => ({
        id: 'rep1',
        status: data.status,
        reviewComment: data.reviewComment,
      }));

      const result = await service.reject(
        'rep1',
        'coordinator1',
        'Needs more detail',
      );
      expect(result.status).toBe('draft');
      expect(result.reviewComment).toBe('Needs more detail');
    });

    it('publish: approved -> published, enqueues a PDF job before notifying', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'approved',
      });
      prisma.progressReport.update.mockImplementation(({ data }) => ({
        id: 'rep1',
        status: data.status,
      }));

      const result = await service.publish('rep1');
      expect(result.status).toBe('published');
      expect(pdfQueue.add).toHaveBeenCalledWith(
        'render-progress-report',
        expect.objectContaining({ reportId: 'rep1' }),
      );
      const pdfCallOrder = pdfQueue.add.mock.invocationCallOrder[0];
      const eventCallOrder = events.emitAsync.mock.invocationCallOrder[0];
      expect(pdfCallOrder).toBeLessThan(eventCallOrder);
    });

    it('publish: rejects publishing a non-approved report', async () => {
      prisma.progressReport.findUnique.mockResolvedValue({
        id: 'rep1',
        studentId: 'stu1',
        status: 'draft',
      });

      await expect(service.publish('rep1')).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_REPORT_TRANSITION',
      });
    });
  });
});
