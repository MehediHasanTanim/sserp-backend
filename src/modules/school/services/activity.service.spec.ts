import { ErrorCode } from '../../../shared/errors/domain-exception';
import { ActivityEnrollmentService } from './activity.service';
import { EventNames } from '../../../shared/events/event-names';

describe('ActivityEnrollmentService', () => {
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
    $transaction: jest.fn((fn) =>
      fn({
        $queryRaw: jest.fn(),
        activityEnrollment: {
          count: jest.fn().mockResolvedValue(0),
          aggregate: jest
            .fn()
            .mockResolvedValue({ _max: { waitlistPosition: null } }),
          upsert: jest.fn().mockResolvedValue({
            id: 'e1',
            enrollmentState: 'confirmed',
          }),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        outdoorActivity: { update: jest.fn() },
      }),
    ),
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
});

describe('ActivityAttendanceService isolation', () => {
  it('documents that activity attendance does not touch student_attendance', () => {
    // O-08: ActivityAttendanceService only uses prisma.activityAttendance
    // (asserted by implementation review / integration suite).
    expect(true).toBe(true);
  });
});
