import { StudentStatusService } from './student-status.service';

describe('StudentStatusService', () => {
  let prisma: {
    student: { findFirst: jest.Mock; update: jest.Mock };
    studentStatusHistory: { create: jest.Mock };
  };
  let events: { emitAsync: jest.Mock };
  let service: StudentStatusService;

  const baseStudent = {
    id: 's1',
    status: 'pending_admission_fee',
    statusReason: null,
  };

  beforeEach(() => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({ ...baseStudent }),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...baseStudent,
          ...data,
        })),
      },
      studentStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    service = new StudentStatusService(prisma as never, events as never);
  });

  it('allows pending_admission_fee -> active and emits both events', async () => {
    const result = await service.changeStatus({
      studentId: 's1',
      toStatus: 'active',
      changedBy: 'u1',
      reason: 'fee paid',
    });

    expect(result.status).toBe('active');
    expect(prisma.studentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: 'pending_admission_fee',
          toStatus: 'active',
          isManualOverride: false,
        }),
      }),
    );
    expect(events.emitAsync).toHaveBeenCalledWith(
      'student.status_changed',
      expect.objectContaining({ studentId: 's1', toStatus: 'active' }),
    );
    expect(events.emitAsync).toHaveBeenCalledWith(
      'student.activated',
      expect.objectContaining({
        studentId: 's1',
        previousStatus: 'pending_admission_fee',
      }),
    );
  });

  it('rejects an illegal transition without override', async () => {
    prisma.student.findFirst.mockResolvedValue({
      ...baseStudent,
      status: 'active',
    });
    await expect(
      service.changeStatus({
        studentId: 's1',
        toStatus: 'pending_admission_fee',
        changedBy: 'u1',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_STATUS_TRANSITION',
    });
  });

  it('every legal transition succeeds', async () => {
    const cases: Array<[string, string]> = [
      ['pending_admission_fee', 'active'],
      ['active', 'on_leave'],
      ['active', 'inactive'],
      ['active', 'graduated'],
      ['active', 'transferred'],
      ['active', 'withdrawn'],
      ['on_leave', 'active'],
      ['on_leave', 'inactive'],
      ['inactive', 'active'],
    ];
    for (const [from, to] of cases) {
      prisma.student.findFirst.mockResolvedValue({
        ...baseStudent,
        status: from,
      });
      await expect(
        service.changeStatus({
          studentId: 's1',
          toStatus: to as never,
          changedBy: 'u1',
          reason: 'test',
        }),
      ).resolves.toMatchObject({ status: to });
    }
  });

  it('rejects a manual override with no reason', async () => {
    await expect(
      service.changeStatus({
        studentId: 's1',
        toStatus: 'graduated',
        changedBy: 'principal1',
        isManualOverride: true,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('allows a manual override with a reason even for an illegal path, and flags it', async () => {
    prisma.student.findFirst.mockResolvedValue({
      ...baseStudent,
      status: 'graduated',
    });
    const result = await service.changeStatus({
      studentId: 's1',
      toStatus: 'active',
      changedBy: 'principal1',
      reason: 'Re-admitted by principal decision',
      isManualOverride: true,
    });
    expect(result.status).toBe('active');
    expect(result.statusReason).toBe('Re-admitted by principal decision');
    expect(prisma.studentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isManualOverride: true }),
      }),
    );
  });

  it('blocks every illegal transition (terminal states) without override', async () => {
    for (const terminal of ['graduated', 'transferred', 'withdrawn']) {
      prisma.student.findFirst.mockResolvedValue({
        ...baseStudent,
        status: terminal,
      });
      await expect(
        service.changeStatus({
          studentId: 's1',
          toStatus: 'active',
          changedBy: 'u1',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    }
  });
});
