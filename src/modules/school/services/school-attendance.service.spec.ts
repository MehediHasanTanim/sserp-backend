import { SchoolAttendanceService } from './school-attendance.service';

describe('SchoolAttendanceService', () => {
  let prisma: {
    attendanceSetting: { findUnique: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    student: { findMany: jest.Mock };
    studentAttendance: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    studentEnrollment: { findFirst: jest.Mock };
    studentStatusHistory: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
    studentTeacherMapping: { findMany: jest.Mock };
    substituteAssignment: { findMany: jest.Mock };
    studentGuardian: { findMany: jest.Mock };
    attendanceAmendment: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let workingDays: {
    isHoliday: jest.Mock;
    listWorkingDates: jest.Mock;
    countWorkingDays: jest.Mock;
  };
  let events: { emitAsync: jest.Mock };
  let notifications: { notify: jest.Mock };
  let service: SchoolAttendanceService;

  beforeEach(() => {
    prisma = {
      attendanceSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
      student: { findMany: jest.fn().mockResolvedValue([]) },
      studentAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      studentEnrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      studentStatusHistory: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn() },
      studentTeacherMapping: { findMany: jest.fn().mockResolvedValue([]) },
      substituteAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      studentGuardian: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceAmendment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    workingDays = {
      isHoliday: jest.fn().mockResolvedValue(false),
      listWorkingDates: jest.fn().mockResolvedValue([]),
      countWorkingDays: jest.fn().mockResolvedValue(0),
    };
    events = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new SchoolAttendanceService(
      prisma as never,
      workingDays as never,
      events as never,
      notifications as never,
    );
  });

  describe('monthlySummary', () => {
    it('matches a hand-computed fixture: 10 working days, 5 present, 1 late, 1 half-day, 2 absent, 1 excused', async () => {
      const workingDates = Array.from(
        { length: 10 },
        (_, i) => new Date(Date.UTC(2026, 0, i + 1)),
      );
      workingDays.listWorkingDates.mockResolvedValue(workingDates);

      const dayKey = (i: number) => `2026-01-${String(i + 1).padStart(2, '0')}`;
      const records = [
        ...[0, 1, 2, 3, 4].map((i) => ({
          attendanceDate: new Date(dayKey(i)),
          status: 'present',
        })),
        { attendanceDate: new Date(dayKey(5)), status: 'late' },
        { attendanceDate: new Date(dayKey(6)), status: 'half_day' },
        { attendanceDate: new Date(dayKey(7)), status: 'absent' },
        { attendanceDate: new Date(dayKey(8)), status: 'absent' },
        { attendanceDate: new Date(dayKey(9)), status: 'excused_leave' },
      ];
      prisma.studentAttendance.findMany.mockResolvedValue(records);

      const summary = await service.monthlySummary('stu1', 2026, 1);

      // present-equivalent = 5 (present) + 1 (late) + 0.5 (half-day) = 6.5
      // denominator = 10 working days - 1 excused = 9
      // percentage = 6.5 / 9 * 100 = 72.222... -> rounded to 72.22
      expect(summary.workingDays).toBe(10);
      expect(summary.presentDays).toBe(5);
      expect(summary.lateDays).toBe(1);
      expect(summary.halfDays).toBe(1);
      expect(summary.absentDays).toBe(2);
      expect(summary.excusedDays).toBe(1);
      expect(summary.medicalDays).toBe(0);
      expect(summary.presentEquivalent).toBe(6.5);
      expect(summary.countedDays).toBe(9);
      expect(summary.percentage).toBeCloseTo(72.22, 2);
    });
  });

  describe('bulkSubmit guards', () => {
    it('rejects a holiday date', async () => {
      workingDays.isHoliday.mockResolvedValue(true);
      await expect(
        service.bulkSubmit(
          {
            attendanceDate: '2020-01-01',
            shiftId: 'shift1',
            items: [{ studentId: 'stu1', status: 'present' }],
          },
          { userId: 'u1', roles: ['coordinator'] },
        ),
      ).rejects.toMatchObject({ code: 'DATE_IS_HOLIDAY', statusCode: 422 });
    });

    it('rejects a future date', async () => {
      const future = new Date();
      future.setUTCFullYear(future.getUTCFullYear() + 1);
      await expect(
        service.bulkSubmit(
          {
            attendanceDate: future.toISOString().slice(0, 10),
            shiftId: 'shift1',
            items: [{ studentId: 'stu1', status: 'present' }],
          },
          { userId: 'u1', roles: ['coordinator'] },
        ),
      ).rejects.toMatchObject({ code: 'FUTURE_DATE', statusCode: 422 });
    });

    it('forbids an unmapped, non-coordinator teacher from marking', async () => {
      prisma.user.findUnique.mockResolvedValue({ employeeId: 'teacherEmp1' });
      prisma.studentTeacherMapping.findMany.mockResolvedValue([]);
      prisma.substituteAssignment.findMany.mockResolvedValue([]);
      prisma.student.findMany.mockResolvedValue([
        { id: 'stu1', enrollmentDate: null, status: 'active' },
      ]);

      await expect(
        service.bulkSubmit(
          {
            attendanceDate: '2020-01-02',
            shiftId: 'shift1',
            items: [{ studentId: 'stu1', status: 'present' }],
          },
          { userId: 'teacherUser1', roles: ['teacher'] },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('update (freeze window)', () => {
    it('rejects a direct correction once the record is frozen', async () => {
      const oldDate = new Date();
      oldDate.setUTCDate(oldDate.getUTCDate() - 30);
      prisma.studentAttendance.findUnique.mockResolvedValue({
        id: 'att1',
        attendanceDate: oldDate,
      });
      await expect(
        service.update('att1', { status: 'present' }),
      ).rejects.toMatchObject({ code: 'ATTENDANCE_FROZEN', statusCode: 409 });
    });

    it('allows a direct correction inside the freeze window', async () => {
      const recentDate = new Date();
      prisma.studentAttendance.findUnique.mockResolvedValue({
        id: 'att1',
        attendanceDate: recentDate,
      });
      prisma.studentAttendance.update.mockResolvedValue({
        id: 'att1',
        status: 'present',
      });
      await expect(
        service.update('att1', { status: 'present' }),
      ).resolves.toMatchObject({ status: 'present' });
    });
  });
});
