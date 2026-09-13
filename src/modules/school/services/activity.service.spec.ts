import { ErrorCode } from '../../../shared/errors/domain-exception';
import {
  ActivityAttendanceService,
  ActivityEnrollmentService,
} from './activity.service';
import { EventNames } from '../../../shared/events/event-names';

describe('ActivityEnrollmentService', () => {
  const makeTx = (
    activityEnrollmentOverrides: Record<string, jest.Mock> = {},
  ) => ({
    $queryRaw: jest.fn(),
    activityEnrollment: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _max: { waitlistPosition: null } }),
      upsert: jest.fn().mockResolvedValue({
        id: 'e1',
        enrollmentState: 'confirmed',
        waitlistPosition: null,
      }),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      ...activityEnrollmentOverrides,
    },
    outdoorActivity: { update: jest.fn() },
    feeInvoice: { findUnique: jest.fn(), update: jest.fn() },
  });

  const prisma = {
    outdoorActivity: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    student: { findFirst: jest.fn() },
    activityEnrollment: {
      upsert: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(makeTx())),
    feeHead: { findUnique: jest.fn(), create: jest.fn() },
    feeInvoice: { findUnique: jest.fn(), create: jest.fn() },
  };
  const events = { emitAsync: jest.fn() };
  const numbering = { nextCode: jest.fn().mockResolvedValue('INV-1') };
  const ledger = { post: jest.fn() };

  const service = new ActivityEnrollmentService(
    prisma as never,
    events as never,
    numbering as never,
    ledger as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects after opt-in deadline', async () => {
    prisma.outdoorActivity.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'upcoming',
      optInDeadline: new Date('2020-01-01'),
      capacity: 3,
    });
    await expect(
      service.respond({
        activityId: 'a1',
        studentId: 's1',
        accept: true,
        channel: 'portal',
        actorUserId: 'u1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.OPTIN_CLOSED });
  });

  it('rejects non-active student', async () => {
    prisma.outdoorActivity.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'upcoming',
      optInDeadline: new Date(Date.now() + 86400000),
      capacity: 3,
      waitlistEnabled: true,
    });
    prisma.student.findFirst.mockResolvedValue({
      id: 's1',
      status: 'pending_admission_fee',
    });
    await expect(
      service.respond({
        activityId: 'a1',
        studentId: 's1',
        accept: true,
        channel: 'portal',
        actorUserId: 'u1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.STUDENT_NOT_ACTIVE });
  });

  it('emits confirmed on successful accept under capacity', async () => {
    prisma.outdoorActivity.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'upcoming',
      optInDeadline: new Date(Date.now() + 86400000),
      capacity: 3,
      waitlistEnabled: true,
    });
    prisma.student.findFirst.mockResolvedValue({ id: 's1', status: 'active' });
    await service.respond({
      activityId: 'a1',
      studentId: 's1',
      accept: true,
      channel: 'portal',
      actorUserId: 'u1',
    });
    expect(events.emitAsync).toHaveBeenCalledWith(
      EventNames.ACTIVITY_OPTIN_CONFIRMED,
      expect.objectContaining({ activityId: 'a1', studentId: 's1' }),
    );
  });

  it('waitlists with position when at capacity', async () => {
    prisma.outdoorActivity.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'upcoming',
      optInDeadline: new Date(Date.now() + 86400000),
      capacity: 2,
      waitlistEnabled: true,
    });
    prisma.student.findFirst.mockResolvedValue({ id: 's3', status: 'active' });

    const waitlisted = {
      id: 'e-wl',
      enrollmentState: 'waitlisted',
      waitlistPosition: 1,
    };
    prisma.$transaction.mockImplementation(async (fn) =>
      fn(
        makeTx({
          count: jest.fn().mockResolvedValue(2),
          upsert: jest.fn().mockResolvedValue(waitlisted),
        }),
      ),
    );

    const result = await service.respond({
      activityId: 'a1',
      studentId: 's3',
      accept: true,
      channel: 'portal',
      actorUserId: 'u1',
    });

    expect(result).toEqual(waitlisted);
    expect(events.emitAsync).not.toHaveBeenCalledWith(
      EventNames.ACTIVITY_OPTIN_CONFIRMED,
      expect.anything(),
    );
  });

  it('assigns sequential waitlist positions when already waitlisted students exist', async () => {
    prisma.outdoorActivity.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'upcoming',
      optInDeadline: new Date(Date.now() + 86400000),
      capacity: 1,
      waitlistEnabled: true,
    });
    prisma.student.findFirst.mockResolvedValue({ id: 's4', status: 'active' });

    let capturedUpsertData: { waitlistPosition?: number | null } | undefined;
    prisma.$transaction.mockImplementation(async (fn) => {
      const upsert = jest.fn().mockImplementation(({ create }) => {
        capturedUpsertData = create;
        return {
          id: 'e-wl2',
          enrollmentState: create.enrollmentState,
          waitlistPosition: create.waitlistPosition,
        };
      });
      return fn(
        makeTx({
          count: jest.fn().mockResolvedValue(1),
          aggregate: jest
            .fn()
            .mockResolvedValue({ _max: { waitlistPosition: 1 } }),
          upsert,
        }),
      );
    });

    const result = await service.respond({
      activityId: 'a1',
      studentId: 's4',
      accept: true,
      channel: 'portal',
      actorUserId: 'u1',
    });

    expect(capturedUpsertData?.waitlistPosition).toBe(2);
    expect(result.waitlistPosition).toBe(2);
    expect(result.enrollmentState).toBe('waitlisted');
  });

  it('promotes waitlist position 1 on withdrawal of a confirmed seat', async () => {
    const nextWaitlisted = {
      id: 'e-next',
      studentId: 's-wait',
      enrollmentState: 'waitlisted',
      waitlistPosition: 1,
      consentStatus: 'confirmed',
    };

    prisma.$transaction.mockImplementation(async (fn) => {
      const update = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'e-confirmed',
          enrollmentState: 'waitlisted',
          waitlistPosition: null,
          student: { id: 's1', fullName: 'A', studentCode: 'STU-1' },
        })
        .mockResolvedValueOnce({
          ...nextWaitlisted,
          enrollmentState: 'confirmed',
          waitlistPosition: null,
        });
      return fn({
        $queryRaw: jest.fn(),
        activityEnrollment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'e-confirmed',
            enrollmentState: 'confirmed',
            invoiceId: null,
          }),
          findFirst: jest.fn().mockResolvedValue(nextWaitlisted),
          update,
        },
        outdoorActivity: { update: jest.fn() },
        feeInvoice: { findUnique: jest.fn(), update: jest.fn() },
      });
    });

    await service.withdraw('a1', 's1');

    expect(events.emitAsync).toHaveBeenCalledWith(
      EventNames.ACTIVITY_WAITLIST_PROMOTED,
      expect.objectContaining({
        activityId: 'a1',
        studentId: 's-wait',
        enrollmentId: 'e-next',
      }),
    );
    expect(events.emitAsync).toHaveBeenCalledWith(
      EventNames.ACTIVITY_OPTIN_CONFIRMED,
      expect.objectContaining({
        activityId: 'a1',
        studentId: 's-wait',
        enrollmentId: 'e-next',
      }),
    );
  });
});

describe('ActivityAttendanceService isolation', () => {
  it('bulkMark and list only touch activityAttendance — never studentAttendance', async () => {
    const activityAttendance = {
      findMany: jest.fn().mockResolvedValue([{ id: 'aa1' }]),
      upsert: jest.fn().mockResolvedValue({ id: 'aa1', status: 'present' }),
    };
    const studentAttendance = {
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    };
    const prisma = {
      activityAttendance,
      studentAttendance,
    };
    const service = new ActivityAttendanceService(prisma as never);

    await service.list('a1');
    await service.bulkMark(
      'a1',
      [{ studentId: 's1', status: 'present' }],
      'marker1',
    );

    expect(activityAttendance.findMany).toHaveBeenCalledWith({
      where: { activityId: 'a1' },
    });
    expect(activityAttendance.upsert).toHaveBeenCalled();
    expect(studentAttendance.create).not.toHaveBeenCalled();
    expect(studentAttendance.update).not.toHaveBeenCalled();
    expect(studentAttendance.upsert).not.toHaveBeenCalled();
  });
});
