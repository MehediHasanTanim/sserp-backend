import { AcademicYearService } from './academic-year.service';

describe('AcademicYearService.carryForward', () => {
  it('dry-run reports wouldEnroll without writing', async () => {
    const prisma = {
      academicYear: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'y1',
            startDate: new Date('2025-01-01'),
            terms: [],
          })
          .mockResolvedValueOnce({
            id: 'y2',
            startDate: new Date('2026-01-01'),
            terms: [],
          }),
      },
      student: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's1', shiftId: 'sh1' },
          { id: 's2', shiftId: 'sh1' },
        ]),
      },
      studentEnrollment: {
        findMany: jest.fn().mockResolvedValue([{ studentId: 's1' }]),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const svc = new AcademicYearService(prisma as any);
    const result = await svc.carryForward('y1', {
      targetYearId: 'y2',
      dryRun: true,
    });
    expect(result).toMatchObject({
      dryRun: true,
      wouldEnroll: 1,
      alreadyEnrolled: 1,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
