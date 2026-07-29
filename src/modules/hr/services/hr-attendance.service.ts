import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HrAttendanceStatus, HrDepartment, Prisma } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { EventNames } from '../../../shared/events/event-names';
import { OrgClockService } from '../../../shared/datetime/org-clock.service';

export interface BulkAttendanceItemInput {
  employeeId: string;
  attendanceDate: string;
  status: HrAttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  remarks?: string;
}

export interface AttendanceListQuery {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  department?: HrDepartment;
  status?: HrAttendanceStatus;
  employeeId?: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateAttendanceInput {
  status?: HrAttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  overtimeMinutes?: number;
  remarks?: string;
}

export interface MonthlySummaryQuery {
  year: number;
  month: number;
  employeeId?: string;
  department?: HrDepartment;
}

@Injectable()
export class HrAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly orgClock: OrgClockService,
  ) {}

  async list(query: AttendanceListQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const where: Prisma.HrAttendanceWhereInput = {};
    if (query.date) where.attendanceDate = new Date(query.date);
    if (query.dateFrom || query.dateTo) {
      where.attendanceDate = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    if (query.status) where.status = query.status;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.department) where.employee = { department: query.department };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.hrAttendance.count({ where }),
      this.prisma.hrAttendance.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ attendanceDate: 'desc' }],
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              fullName: true,
              department: true,
            },
          },
        },
      }),
    ]);
    return { items, page, pageSize, total };
  }

  /** Computes minutes late relative to the employee's active shift, if any. */
  private async computeLateMinutes(
    tx: TxClient | PrismaService,
    employeeId: string,
    attendanceDate: Date,
    checkIn: Date | undefined,
  ): Promise<number> {
    if (!checkIn) return 0;
    const assignment = await tx.employeeShiftAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: attendanceDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: attendanceDate } }],
      },
      include: { hrShift: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!assignment) return 0;

    const tz = this.orgClock.getTimezone();
    const [checkInHour, checkInMinute] = formatInTimeZone(checkIn, tz, 'HH:mm')
      .split(':')
      .map(Number);
    const shiftStart = assignment.hrShift.startTime;
    const shiftStartMinutes =
      shiftStart.getUTCHours() * 60 + shiftStart.getUTCMinutes();
    const checkInMinutes = checkInHour * 60 + checkInMinute;
    const rawLate = checkInMinutes - shiftStartMinutes;
    if (rawLate <= assignment.hrShift.graceMinutes) return 0;
    return rawLate;
  }

  async bulkSubmit(items: BulkAttendanceItemInput[], markedBy: string) {
    const absences: Array<{ id: string; employeeId: string; date: string }> =
      [];
    const corrections: Array<{
      id: string;
      employeeId: string;
      date: string;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const attendanceDate = new Date(item.attendanceDate);
        const checkIn = item.checkIn ? new Date(item.checkIn) : undefined;
        const checkOut = item.checkOut ? new Date(item.checkOut) : undefined;

        const previous = await tx.hrAttendance.findUnique({
          where: {
            employeeId_attendanceDate: {
              employeeId: item.employeeId,
              attendanceDate,
            },
          },
        });

        const lateMinutes = await this.computeLateMinutes(
          tx,
          item.employeeId,
          attendanceDate,
          checkIn,
        );
        const status: HrAttendanceStatus =
          item.status === 'present' && lateMinutes > 0 ? 'late' : item.status;

        const record = await tx.hrAttendance.upsert({
          where: {
            employeeId_attendanceDate: {
              employeeId: item.employeeId,
              attendanceDate,
            },
          },
          create: {
            employeeId: item.employeeId,
            attendanceDate,
            status,
            checkIn,
            checkOut,
            lateMinutes,
            remarks: item.remarks,
            markedBy,
          },
          update: {
            status,
            checkIn,
            checkOut,
            lateMinutes,
            remarks: item.remarks,
            markedBy,
          },
        });

        if (status === 'absent') {
          absences.push({
            id: record.id,
            employeeId: item.employeeId,
            date: item.attendanceDate,
          });
        } else if (previous?.status === 'absent') {
          corrections.push({
            id: record.id,
            employeeId: item.employeeId,
            date: item.attendanceDate,
          });
        }
      }
    });

    for (const absence of absences) {
      await this.events.emitAsync(EventNames.HR_ATTENDANCE_ABSENT, {
        id: absence.id,
        employeeId: absence.employeeId,
        date: absence.date,
        markedBy,
      });
    }
    for (const correction of corrections) {
      await this.events.emitAsync(EventNames.HR_ATTENDANCE_CORRECTED, {
        id: correction.id,
        employeeId: correction.employeeId,
        date: correction.date,
      });
    }

    return { submitted: items.length, absences: absences.length };
  }

  async update(id: string, input: UpdateAttendanceInput, actorId: string) {
    const existing = await this.prisma.hrAttendance.findUnique({
      where: { id },
    });
    if (!existing)
      throw DomainException.notFound('Attendance record not found');

    const checkIn = input.checkIn
      ? new Date(input.checkIn)
      : (existing.checkIn ?? undefined);
    const lateMinutes = await this.computeLateMinutes(
      this.prisma,
      existing.employeeId,
      existing.attendanceDate,
      checkIn,
    );
    const status = input.status ?? existing.status;

    const updated = await this.prisma.hrAttendance.update({
      where: { id },
      data: {
        status,
        checkIn: input.checkIn ? new Date(input.checkIn) : undefined,
        checkOut: input.checkOut ? new Date(input.checkOut) : undefined,
        overtimeMinutes: input.overtimeMinutes,
        remarks: input.remarks,
        lateMinutes,
        markedBy: actorId,
      },
    });

    if (status === 'absent' && existing.status !== 'absent') {
      await this.events.emitAsync(EventNames.HR_ATTENDANCE_ABSENT, {
        id: updated.id,
        employeeId: existing.employeeId,
        date: existing.attendanceDate.toISOString().slice(0, 10),
        markedBy: actorId,
      });
    } else if (status !== 'absent' && existing.status === 'absent') {
      await this.events.emitAsync(EventNames.HR_ATTENDANCE_CORRECTED, {
        id: updated.id,
        employeeId: existing.employeeId,
        date: existing.attendanceDate.toISOString().slice(0, 10),
      });
    }

    return updated;
  }

  async monthlySummary(query: MonthlySummaryQuery) {
    const start = new Date(Date.UTC(query.year, query.month - 1, 1));
    const end = new Date(Date.UTC(query.year, query.month, 0));

    const where: Prisma.HrAttendanceWhereInput = {
      attendanceDate: { gte: start, lte: end },
    };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.department) where.employee = { department: query.department };

    const records = await this.prisma.hrAttendance.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true } },
      },
    });

    const byEmployee = new Map<
      string,
      {
        employeeId: string;
        employeeCode: string;
        fullName: string;
        present: number;
        absent: number;
        late: number;
        halfDay: number;
        onDuty: number;
        holiday: number;
        leave: number;
        totalLateMinutes: number;
        totalOvertimeMinutes: number;
      }
    >();

    for (const record of records) {
      const key = record.employeeId;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employeeId: record.employeeId,
          employeeCode: record.employee.employeeCode,
          fullName: record.employee.fullName,
          present: 0,
          absent: 0,
          late: 0,
          halfDay: 0,
          onDuty: 0,
          holiday: 0,
          leave: 0,
          totalLateMinutes: 0,
          totalOvertimeMinutes: 0,
        });
      }
      const summary = byEmployee.get(key)!;
      switch (record.status) {
        case 'present':
          summary.present += 1;
          break;
        case 'absent':
          summary.absent += 1;
          break;
        case 'late':
          summary.late += 1;
          break;
        case 'half_day':
          summary.halfDay += 1;
          break;
        case 'on_duty':
          summary.onDuty += 1;
          break;
        case 'holiday':
          summary.holiday += 1;
          break;
        case 'leave':
          summary.leave += 1;
          break;
      }
      summary.totalLateMinutes += record.lateMinutes;
      summary.totalOvertimeMinutes += record.overtimeMinutes;
    }

    return {
      year: query.year,
      month: query.month,
      items: [...byEmployee.values()],
    };
  }

  async anomalies(query: { department?: HrDepartment; lookbackDays?: number }) {
    const lookbackDays = query.lookbackDays ?? 30;
    const end = new Date();
    const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const where: Prisma.HrAttendanceWhereInput = {
      attendanceDate: { gte: start, lte: end },
      status: { in: ['late', 'absent'] },
    };
    if (query.department) where.employee = { department: query.department };

    const records = await this.prisma.hrAttendance.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true } },
      },
    });

    const byEmployee = new Map<
      string,
      {
        employeeId: string;
        employeeCode: string;
        fullName: string;
        lateCount: number;
        absentCount: number;
        reasons: string[];
      }
    >();

    for (const record of records) {
      const key = record.employeeId;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employeeId: record.employeeId,
          employeeCode: record.employee.employeeCode,
          fullName: record.employee.fullName,
          lateCount: 0,
          absentCount: 0,
          reasons: [],
        });
      }
      const summary = byEmployee.get(key)!;
      if (record.status === 'late') summary.lateCount += 1;
      if (record.status === 'absent') summary.absentCount += 1;
    }

    const LATE_THRESHOLD = 3;
    const ABSENT_THRESHOLD = 2;
    const anomalies = [...byEmployee.values()]
      .map((summary) => {
        if (summary.lateCount >= LATE_THRESHOLD)
          summary.reasons.push('repeated_lateness');
        if (summary.absentCount >= ABSENT_THRESHOLD) {
          summary.reasons.push('unexplained_absence');
        }
        return summary;
      })
      .filter((summary) => summary.reasons.length > 0);

    return { windowDays: lookbackDays, items: anomalies };
  }
}
