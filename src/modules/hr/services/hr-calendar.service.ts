import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TxClient } from '../../../shared/prisma/transaction.helper';

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Holiday/weekly-off aware calendar maths shared by HrAttendanceService and
 * the leave services. `department` narrows holidays to those that either
 * apply organization-wide (empty `appliesToDepartments`) or explicitly list
 * the given HR department.
 */
@Injectable()
export class HrCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkingWeek(
    client: PrismaService | TxClient = this.prisma,
  ): Promise<number[]> {
    const org = await client.organizationSettings.findFirst();
    const week = org?.workingWeek as unknown;
    if (Array.isArray(week) && week.every((n) => typeof n === 'number')) {
      return week as number[];
    }
    return [5, 6];
  }

  async getHolidayDateKeys(
    start: Date,
    end: Date,
    department?: string,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<Set<string>> {
    const holidays = await client.holiday.findMany({
      where: { holidayDate: { gte: start, lte: end } },
    });
    const keys = new Set<string>();
    for (const holiday of holidays) {
      const applies =
        holiday.appliesToDepartments.length === 0 ||
        (!!department && holiday.appliesToDepartments.includes(department));
      if (applies) keys.add(toDateKey(holiday.holidayDate));
    }
    return keys;
  }

  /** Working days in [start, end] inclusive, excluding weekly-offs and holidays. */
  async countWorkingDays(
    start: Date,
    end: Date,
    department?: string,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<number> {
    return (await this.listWorkingDates(start, end, department, client)).length;
  }

  async listWorkingDates(
    start: Date,
    end: Date,
    department?: string,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<Date[]> {
    const [workingWeek, holidayKeys] = await Promise.all([
      this.getWorkingWeek(client),
      this.getHolidayDateKeys(start, end, department, client),
    ]);
    const dates: Date[] = [];
    for (let d = new Date(start); d <= end; d = addUtcDays(d, 1)) {
      const dow = d.getUTCDay();
      if (!workingWeek.includes(dow) && !holidayKeys.has(toDateKey(d))) {
        dates.push(new Date(d));
      }
    }
    return dates;
  }

  async isHoliday(
    date: Date,
    department?: string,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<boolean> {
    const keys = await this.getHolidayDateKeys(date, date, department, client);
    return keys.has(toDateKey(date));
  }

  async isWeeklyOff(
    date: Date,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<boolean> {
    const week = await this.getWorkingWeek(client);
    return week.includes(date.getUTCDay());
  }
}

export { toDateKey };
