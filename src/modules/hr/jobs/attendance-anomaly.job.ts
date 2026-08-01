import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';

/**
 * Detects consecutive late attendance streaks and notifies HR.
 */
@Injectable()
export class AttendanceAnomalyJob {
  private readonly logger = new Logger(AttendanceAnomalyJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('30 6 * * *')
  async detectAnomalies(asOf: Date = new Date()) {
    const org = await this.prisma.organizationSettings.findFirst();
    const streakThreshold = org?.attendanceAnomalyLateStreakDays ?? 0;
    if (streakThreshold <= 0) {
      return { alerted: 0 };
    }

    const asOfDay = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
    );
    const windowStart = new Date(asOfDay);
    windowStart.setUTCDate(windowStart.getUTCDate() - (streakThreshold - 1));

    const lateRows = await this.prisma.hrAttendance.findMany({
      where: {
        attendanceDate: { gte: windowStart, lte: asOfDay },
        OR: [{ status: 'late' }, { lateMinutes: { gt: 0 } }],
      },
      include: {
        employee: { select: { id: true, employeeCode: true, deletedAt: true } },
      },
    });

    const byEmployee = new Map<
      string,
      { employeeCode: string; dates: Set<string> }
    >();
    for (const row of lateRows) {
      if (row.employee.deletedAt) continue;
      const key = row.employeeId;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employeeCode: row.employee.employeeCode,
          dates: new Set(),
        });
      }
      byEmployee
        .get(key)!
        .dates.add(row.attendanceDate.toISOString().slice(0, 10));
    }

    let alerted = 0;
    for (const [employeeId, info] of byEmployee) {
      let streak = 0;
      for (let i = 0; i < streakThreshold; i++) {
        const d = new Date(asOfDay);
        d.setUTCDate(d.getUTCDate() - i);
        const key = d.toISOString().slice(0, 10);
        if (info.dates.has(key)) streak += 1;
        else break;
      }
      if (streak < streakThreshold) continue;

      await this.events.emitAsync(EventNames.HR_ATTENDANCE_ANOMALY, {
        employeeId,
        employeeCode: info.employeeCode,
        lateStreakDays: streak,
        asOfDate: asOfDay.toISOString().slice(0, 10),
      });
      alerted += 1;
    }

    this.logger.log(`attendance-anomaly alerted ${alerted} employee(s)`);
    return { alerted };
  }
}
