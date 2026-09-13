import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentAttendanceStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NotificationPort } from '../../../shared/ports/notification.port';
import { WorkingDaysService, toDateKey } from './working-days.service';

export interface BulkAttendanceItem {
  studentId: string;
  status: StudentAttendanceStatus;
  remarks?: string;
}

const TERMINAL_STATUSES = ['graduated', 'transferred', 'withdrawn'];
const DEFAULT_FREEZE_AFTER_DAYS = 7;

function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

@Injectable()
export class SchoolAttendanceService {
  private readonly logger = new Logger(SchoolAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workingDays: WorkingDaysService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationPort,
  ) {}

  private async getSettings(academicYearId?: string): Promise<{
    freezeAfterDays: number;
    allowTeacherMarking: boolean;
    unauthorizedAbsenceAlertEnabled: boolean;
  }> {
    const fallback = {
      freezeAfterDays: DEFAULT_FREEZE_AFTER_DAYS,
      allowTeacherMarking: true,
      unauthorizedAbsenceAlertEnabled: true,
    };
    if (academicYearId) {
      const settings = await this.prisma.attendanceSetting.findUnique({
        where: { academicYearId },
      });
      if (settings) return settings;
    }
    const current = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
    });
    if (current) {
      const settings = await this.prisma.attendanceSetting.findUnique({
        where: { academicYearId: current.id },
      });
      if (settings) return settings;
    }
    return fallback;
  }

  async getAttendanceSettings(academicYearId: string) {
    const settings = await this.prisma.attendanceSetting.findUnique({
      where: { academicYearId },
    });
    if (!settings)
      throw DomainException.notFound('Attendance settings not found');
    return settings;
  }

  async upsertAttendanceSettings(
    academicYearId: string,
    input: {
      freezeAfterDays?: number;
      allowTeacherMarking?: boolean;
      unauthorizedAbsenceAlertEnabled?: boolean;
    },
  ) {
    return this.prisma.attendanceSetting.upsert({
      where: { academicYearId },
      create: {
        academicYearId,
        freezeAfterDays: input.freezeAfterDays ?? DEFAULT_FREEZE_AFTER_DAYS,
        allowTeacherMarking: input.allowTeacherMarking ?? true,
        unauthorizedAbsenceAlertEnabled:
          input.unauthorizedAbsenceAlertEnabled ?? true,
      },
      update: input,
    });
  }

  private assertNotHolidayOrFuture(date: Date, isHoliday: boolean) {
    const today = startOfDayUtc(new Date());
    if (date.getTime() > today.getTime()) {
      throw DomainException.withCode(
        ErrorCode.FUTURE_DATE,
        422,
        'Attendance cannot be marked for a future date',
      );
    }
    if (isHoliday) {
      throw DomainException.withCode(
        ErrorCode.DATE_IS_HOLIDAY,
        422,
        'Attendance cannot be marked on a holiday',
      );
    }
  }

  private async assertWithinEnrollmentRange(
    student: {
      id: string;
      enrollmentDate: Date | null;
      status: StudentStatus;
    },
    date: Date,
  ) {
    if (
      student.enrollmentDate &&
      date.getTime() < student.enrollmentDate.getTime()
    ) {
      throw DomainException.withCode(
        ErrorCode.OUT_OF_ENROLLMENT_RANGE,
        422,
        `Attendance date precedes ${student.id}'s enrollment date`,
      );
    }
    if (TERMINAL_STATUSES.includes(student.status)) {
      const lastTerminal = await this.prisma.studentStatusHistory.findFirst({
        where: { studentId: student.id, toStatus: student.status },
        orderBy: { changedAt: 'desc' },
      });
      if (lastTerminal && date.getTime() > lastTerminal.changedAt.getTime()) {
        throw DomainException.withCode(
          ErrorCode.OUT_OF_ENROLLMENT_RANGE,
          422,
          `Attendance date is after the student's ${student.status} date`,
        );
      }
    }
  }

  /** A-04: only the mapped primary teacher, the assigned substitute, or a coordinator may mark. */
  async assertCanMark(
    actor: { userId: string; roles: string[] },
    shiftId: string,
    studentIds: string[],
    date: Date,
  ) {
    const privileged = ['coordinator', 'super_admin', 'principal'];
    if (actor.roles.some((r) => privileged.includes(r))) return;

    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      throw DomainException.forbidden(
        'No teacher profile linked to this account',
      );
    }

    const mappings = await this.prisma.studentTeacherMapping.findMany({
      where: {
        teacherEmployeeId: user.employeeId,
        shiftId,
        isActive: true,
        studentId: { in: studentIds },
      },
    });
    const mappedStudentIds = new Set(mappings.map((m) => m.studentId));

    const substituteRows = await this.prisma.substituteAssignment.findMany({
      where: {
        substituteTeacherId: user.employeeId,
        status: 'assigned',
        startDate: { lte: date },
        endDate: { gte: date },
        studentId: { in: studentIds },
      },
    });
    const substituteStudentIds = new Set(
      substituteRows.map((s) => s.studentId),
    );

    const unauthorized = studentIds.filter(
      (id) => !mappedStudentIds.has(id) && !substituteStudentIds.has(id),
    );
    if (unauthorized.length) {
      throw DomainException.forbidden(
        'You may only mark attendance for your mapped or covered students',
      );
    }
  }

  async roster(shiftId: string, dateStr: string) {
    const date = startOfDayUtc(new Date(dateStr));
    const isHoliday = await this.workingDays.isHoliday(date);
    const students = await this.prisma.student.findMany({
      where: { shiftId, status: 'active', deletedAt: null },
      orderBy: { fullName: 'asc' },
    });
    const marks = await this.prisma.studentAttendance.findMany({
      where: { shiftId, attendanceDate: date },
    });
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    return {
      date: dateStr,
      shiftId,
      isHoliday,
      roster: students.map((s) => ({
        studentId: s.id,
        studentCode: s.studentCode,
        fullName: s.fullName,
        existingMark: byStudent.get(s.id) ?? null,
      })),
    };
  }

  /** A-01/A-02/A-03/A-07: bulk submit is transactional and idempotent per (student, date). */
  async bulkSubmit(
    input: {
      attendanceDate: string;
      shiftId: string;
      items: BulkAttendanceItem[];
    },
    actor: { userId: string; roles: string[] },
  ) {
    const date = startOfDayUtc(new Date(input.attendanceDate));
    const isHoliday = await this.workingDays.isHoliday(date);
    this.assertNotHolidayOrFuture(date, isHoliday);

    const studentIds = input.items.map((i) => i.studentId);
    await this.assertCanMark(actor, input.shiftId, studentIds, date);

    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
    });
    const byId = new Map(students.map((s) => [s.id, s]));

    for (const item of input.items) {
      const student = byId.get(item.studentId);
      if (!student)
        throw DomainException.notFound(`Student ${item.studentId} not found`);
      await this.assertWithinEnrollmentRange(student, date);
    }

    const results = await this.prisma.$transaction(
      input.items.map((item) =>
        this.prisma.studentAttendance.upsert({
          where: {
            studentId_attendanceDate: {
              studentId: item.studentId,
              attendanceDate: date,
            },
          },
          create: {
            studentId: item.studentId,
            attendanceDate: date,
            shiftId: input.shiftId,
            status: item.status,
            remarks: item.remarks,
            markedBy: actor.userId,
            markedAt: new Date(),
          },
          update: {
            status: item.status,
            remarks: item.remarks,
            markedBy: actor.userId,
            markedAt: new Date(),
          },
        }),
      ),
    );

    return { submitted: results.length };
  }

  private async freezeAfterDaysFor(attendanceDate: Date): Promise<number> {
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { enrollmentDate: { lte: attendanceDate } },
      orderBy: { enrollmentDate: 'desc' },
      select: { academicYearId: true },
    });
    const settings = await this.getSettings(enrollment?.academicYearId);
    return settings.freezeAfterDays ?? DEFAULT_FREEZE_AFTER_DAYS;
  }

  /** A-05: direct PATCH is blocked once the freeze window has elapsed. */
  async update(
    id: string,
    input: { status: StudentAttendanceStatus; remarks?: string },
  ) {
    const record = await this.prisma.studentAttendance.findUnique({
      where: { id },
    });
    if (!record) throw DomainException.notFound('Attendance record not found');

    const freezeAfterDays = await this.freezeAfterDaysFor(
      record.attendanceDate,
    );
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - freezeAfterDays);
    if (record.attendanceDate.getTime() < startOfDayUtc(cutoff).getTime()) {
      throw DomainException.withCode(
        ErrorCode.ATTENDANCE_FROZEN,
        409,
        'This record is frozen; use the amendment workflow',
      );
    }

    return this.prisma.studentAttendance.update({
      where: { id },
      data: { status: input.status, remarks: input.remarks },
    });
  }

  async requestAmendment(
    attendanceId: string,
    input: { requestedStatus: StudentAttendanceStatus; reason: string },
    requestedBy: string,
  ) {
    const record = await this.prisma.studentAttendance.findUnique({
      where: { id: attendanceId },
    });
    if (!record) throw DomainException.notFound('Attendance record not found');
    return this.prisma.attendanceAmendment.create({
      data: {
        attendanceId,
        previousStatus: record.status,
        requestedStatus: input.requestedStatus,
        reason: input.reason,
        requestedBy,
        status: 'pending',
      },
    });
  }

  async decideAmendment(
    amendmentId: string,
    approve: boolean,
    reviewerId: string,
  ) {
    const amendment = await this.prisma.attendanceAmendment.findUnique({
      where: { id: amendmentId },
    });
    if (!amendment) throw DomainException.notFound('Amendment not found');
    if (amendment.status !== 'pending') {
      throw DomainException.conflict(
        `Amendment is already ${amendment.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceAmendment.update({
        where: { id: amendmentId },
        data: {
          status: approve ? 'approved' : 'rejected',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      });
      if (approve) {
        await tx.studentAttendance.update({
          where: { id: amendment.attendanceId },
          data: {
            status: amendment.requestedStatus,
            isAmended: true,
            amendedBy: reviewerId,
            amendedAt: new Date(),
            amendmentReason: amendment.reason,
            amendmentApprovedBy: reviewerId,
          },
        });
      }
      return updated;
    });
  }

  async history(studentId: string) {
    return this.prisma.studentAttendance.findMany({
      where: { studentId },
      orderBy: { attendanceDate: 'desc' },
    });
  }

  /** A-06: present-equivalent / working days; half-day = 0.5; excused_leave/medical excluded from both. */
  async monthlySummary(studentId: string, year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const workingDates = await this.workingDays.listWorkingDates(start, end);

    const records = await this.prisma.studentAttendance.findMany({
      where: { studentId, attendanceDate: { gte: start, lte: end } },
    });
    const byDate = new Map(
      records.map((r) => [toDateKey(r.attendanceDate), r]),
    );

    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let excusedDays = 0;
    let medicalDays = 0;
    let presentEquivalent = 0;
    let excludedCount = 0;
    let markedWorkingDays = 0;

    for (const date of workingDates) {
      const record = byDate.get(toDateKey(date));
      if (!record) continue;
      markedWorkingDays += 1;
      switch (record.status) {
        case 'present':
          presentDays += 1;
          presentEquivalent += 1;
          break;
        case 'late':
          lateDays += 1;
          presentEquivalent += 1;
          break;
        case 'half_day':
          halfDays += 1;
          presentEquivalent += 0.5;
          break;
        case 'excused_leave':
          excusedDays += 1;
          excludedCount += 1;
          markedWorkingDays -= 1;
          break;
        case 'medical':
          medicalDays += 1;
          excludedCount += 1;
          markedWorkingDays -= 1;
          break;
        case 'absent':
          absentDays += 1;
          break;
        default:
          break;
      }
    }

    const denominator = markedWorkingDays;
    const percentage =
      denominator > 0 ? (presentEquivalent / denominator) * 100 : 0;

    return {
      studentId,
      year,
      month,
      presentDays,
      absentDays,
      lateDays,
      halfDays,
      excusedDays,
      medicalDays,
      workingDays: workingDates.length,
      countedDays: denominator,
      excludedDays: excludedCount,
      presentEquivalent,
      percentage: Math.round(percentage * 100) / 100,
    };
  }

  async workingDaysBetween(dateFrom: string, dateTo: string) {
    const count = await this.workingDays.countWorkingDays(
      new Date(dateFrom),
      new Date(dateTo),
    );
    return { dateFrom, dateTo, workingDays: count };
  }

  /** Daily 11:00 job (A-08): notify guardians of same-day unexplained absences. */
  async unauthorizedAbsenceAlert(asOf = new Date()) {
    const today = startOfDayUtc(asOf);
    const settings = await this.getSettings();
    if (settings.unauthorizedAbsenceAlertEnabled === false) {
      return { alerted: 0 };
    }

    const absences = await this.prisma.studentAttendance.findMany({
      where: { attendanceDate: today, status: 'absent' },
    });
    if (!absences.length) return { alerted: 0 };

    let alerted = 0;
    for (const absence of absences) {
      await this.events.emitAsync(
        EventNames.STUDENT_ATTENDANCE_UNAUTHORIZED_ABSENCE,
        {
          studentId: absence.studentId,
          date: toDateKey(absence.attendanceDate),
        },
      );
      const guardians = await this.prisma.studentGuardian.findMany({
        where: { studentId: absence.studentId, portalAccessEnabled: true },
      });
      if (!guardians.length) continue;
      const users = await this.prisma.user.findMany({
        where: { guardianId: { in: guardians.map((g) => g.id) } },
      });
      for (const user of users) {
        await this.notifications.notify({
          userId: user.id,
          type: 'unauthorized_absence',
          title: 'Unexplained absence today',
          body: `Your ward was marked absent today with no approved leave on file.`,
          entityType: 'student',
          entityId: absence.studentId,
        });
      }
      alerted += 1;
    }
    this.logger.log(
      `Unauthorized-absence alert notified for ${alerted} student(s)`,
    );
    return { alerted };
  }
}
