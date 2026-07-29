import { SubstituteService } from './substitute.service';

function uniqueViolation() {
  return Object.assign(new Error('duplicate'), { code: 'P2002' });
}

describe('SubstituteService', () => {
  let prisma: {
    studentTeacherMapping: { findMany: jest.Mock };
    substituteAssignment: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    teacher: { findUnique: jest.Mock };
    hrAttendance: { findFirst: jest.Mock };
    hrLeaveRequest: { findFirst: jest.Mock };
  };
  let events: { emitAsync: jest.Mock };
  let service: SubstituteService;

  beforeEach(() => {
    prisma = {
      studentTeacherMapping: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ studentId: 'stu1' }, { studentId: 'stu2' }]),
      },
      substituteAssignment: {
        create: jest.fn().mockResolvedValue({ id: 'sub1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'sub1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      teacher: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', status: 'active' }),
      },
      hrAttendance: { findFirst: jest.fn().mockResolvedValue(null) },
      hrLeaveRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    service = new SubstituteService(prisma as never, events as never);
  });

  it('creates one pending row per mapped student on absence', async () => {
    const result = await service.createForAbsence({
      id: 'att1',
      employeeId: 'teacher1',
      date: '2026-01-05',
    });
    expect(result.created).toBe(2);
    expect(prisma.substituteAssignment.create).toHaveBeenCalledTimes(2);
    expect(prisma.substituteAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggerType: 'absence',
          triggerReferenceId: 'att1',
          status: 'pending',
        }),
      }),
    );
  });

  it('creates one row per student spanning the full leave range', async () => {
    const result = await service.createForLeaveApproved({
      leaveRequestId: 'leave1',
      employeeId: 'teacher1',
      startDate: '2026-02-01',
      endDate: '2026-02-05',
    });
    expect(result.created).toBe(2);
    expect(prisma.substituteAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggerType: 'leave',
          triggerReferenceId: 'leave1',
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-02-05'),
        }),
      }),
    );
  });

  it('replaying the same absence event creates no duplicates', async () => {
    prisma.substituteAssignment.create.mockRejectedValue(uniqueViolation());
    const result = await service.createForAbsence({
      id: 'att1',
      employeeId: 'teacher1',
      date: '2026-01-05',
    });
    expect(result.created).toBe(0);
  });

  it('rejects assigning a substitute who is themselves on leave', async () => {
    prisma.substituteAssignment.findUnique.mockResolvedValue({
      id: 'sub1',
      status: 'pending',
      startDate: new Date('2026-01-05'),
      endDate: new Date('2026-01-05'),
      studentId: 'stu1',
    });
    prisma.hrLeaveRequest.findFirst.mockResolvedValue({ id: 'leaveX' });

    await expect(
      service.assign('sub1', 'substituteTeacher1', 'actor1'),
    ).rejects.toMatchObject({
      code: 'SUBSTITUTE_UNAVAILABLE',
      statusCode: 409,
    });
  });

  it('one substitute can cover three students across two shifts without error', async () => {
    const rows = ['sub1', 'sub2', 'sub3'].map((id) => ({
      id,
      status: 'pending',
      startDate: new Date('2026-01-05'),
      endDate: new Date('2026-01-05'),
      studentId: `stu-${id}`,
    }));
    for (const row of rows) {
      prisma.substituteAssignment.findUnique.mockResolvedValueOnce(row);
      await expect(
        service.assign(row.id, 'substituteTeacher1', 'actor1'),
      ).resolves.toMatchObject({ status: 'assigned' });
    }
    expect(prisma.substituteAssignment.update).toHaveBeenCalledTimes(3);
  });

  it('cancels pending rows when leave is cancelled', async () => {
    await service.cancelForLeaveCancelled({
      leaveRequestId: 'leave1',
      employeeId: 'teacher1',
      startDate: '2026-02-01',
      endDate: '2026-02-05',
    });
    expect(prisma.substituteAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        triggerType: 'leave',
        triggerReferenceId: 'leave1',
        status: 'pending',
      },
      data: { status: 'cancelled' },
    });
  });

  it('auto-revert flips only elapsed assignments', async () => {
    await service.autoRevertElapsed(new Date('2026-03-10T00:00:00Z'));
    expect(prisma.substituteAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'assigned',
          endDate: { lt: new Date('2026-03-10T00:00:00.000Z') },
        },
        data: expect.objectContaining({ status: 'auto_reverted' }),
      }),
    );
  });
});
