import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import {
  AttendanceExcusedLeaveListener,
  StudentLeaveService,
} from './student-leave.service';
import { EventNames } from '../../../shared/events/event-names';

describe('StudentLeaveService', () => {
  const prisma = {
    studentLeaveRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const events = { emitAsync: jest.fn() };
  const workingDays = {
    countWorkingDays: jest.fn().mockResolvedValue(3),
    listWorkingDates: jest.fn().mockResolvedValue([]),
  };
  const service = new StudentLeaveService(
    prisma as never,
    events as never,
    workingDays as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects backdated leave', async () => {
    await expect(
      service.submit({
        studentId: 's1',
        requestedBy: 'u1',
        leaveType: 'family',
        startDate: '2020-01-01',
        endDate: '2020-01-02',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.BACKDATED_REQUEST });
  });

  it('rejects overlapping leave', async () => {
    prisma.studentLeaveRequest.findFirst.mockResolvedValue({ id: 'existing' });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
    await expect(
      service.submit({
        studentId: 's1',
        requestedBy: 'u1',
        leaveType: 'medical',
        startDate: tomorrow.toISOString().slice(0, 10),
        endDate: dayAfter.toISOString().slice(0, 10),
      }),
    ).rejects.toMatchObject({ code: ErrorCode.OVERLAPPING_LEAVE });
  });

  it('rejection without reason throws validation', async () => {
    prisma.studentLeaveRequest.findUnique.mockResolvedValue({
      id: 'l1',
      status: 'pending',
      student: {},
    });
    await expect(service.reject('l1', 'u1', '')).rejects.toBeInstanceOf(
      DomainException,
    );
  });

  it('approve emits STUDENT_LEAVE_APPROVED', async () => {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 1);
    prisma.studentLeaveRequest.findUnique.mockResolvedValue({
      id: 'l1',
      status: 'pending',
      studentId: 's1',
      startDate: start,
      endDate: start,
      student: {},
    });
    prisma.studentLeaveRequest.update.mockResolvedValue({
      id: 'l1',
      status: 'approved',
    });
    await service.approve('l1', 'coord1');
    expect(events.emitAsync).toHaveBeenCalledWith(
      EventNames.STUDENT_LEAVE_APPROVED,
      expect.objectContaining({ leaveRequestId: 'l1', studentId: 's1' }),
    );
  });
});

describe('AttendanceExcusedLeaveListener', () => {
  const day1 = new Date('2026-04-01T00:00:00.000Z');
  const day2 = new Date('2026-04-02T00:00:00.000Z');
  const day3 = new Date('2026-04-03T00:00:00.000Z');

  let prisma: {
    student: { findUnique: jest.Mock };
    studentAttendance: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let workingDays: { listWorkingDates: jest.Mock };
  let listener: AttendanceExcusedLeaveListener;

  beforeEach(() => {
    prisma = {
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          shiftId: 'shift1',
        }),
      },
      studentAttendance: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    workingDays = {
      listWorkingDates: jest.fn().mockResolvedValue([day1, day3]),
    };
    listener = new AttendanceExcusedLeaveListener(
      prisma as never,
      workingDays as never,
    );
  });

  it('marks only working days as excused_leave (skips holidays)', async () => {
    await listener.onApproved({
      leaveRequestId: 'l1',
      studentId: 's1',
      startDate: '2026-04-01',
      endDate: '2026-04-03',
      reviewedBy: 'coord1',
    });

    expect(workingDays.listWorkingDates).toHaveBeenCalled();
    expect(prisma.studentAttendance.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.studentAttendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          attendanceDate: day1,
          status: 'excused_leave',
        }),
      }),
    );
    expect(prisma.studentAttendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          attendanceDate: day3,
          status: 'excused_leave',
        }),
      }),
    );
    expect(prisma.studentAttendance.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ attendanceDate: day2 }),
      }),
    );
  });

  it('does not overwrite an existing present mark', async () => {
    prisma.studentAttendance.findUnique.mockImplementation(
      ({ where }: { where: { studentId_attendanceDate: { attendanceDate: Date } } }) => {
        const d = where.studentId_attendanceDate.attendanceDate;
        if (d === day1) {
          return Promise.resolve({ status: 'present' });
        }
        return Promise.resolve(null);
      },
    );

    await listener.onApproved({
      leaveRequestId: 'l1',
      studentId: 's1',
      startDate: '2026-04-01',
      endDate: '2026-04-03',
      reviewedBy: 'coord1',
    });

    expect(prisma.studentAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.studentAttendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          attendanceDate: day3,
          status: 'excused_leave',
        }),
      }),
    );
    expect(prisma.studentAttendance.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId_attendanceDate: expect.objectContaining({
            attendanceDate: day1,
          }),
        }),
      }),
    );
  });
});
