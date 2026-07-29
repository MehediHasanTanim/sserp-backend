import { Injectable, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { CacheService } from '../../../shared/cache/redis.module';
import { EventNames } from '../../../shared/events/event-names';

const SCHOOL_DEPARTMENT = 'school';
const HOLIDAY_CACHE_TTL_SECONDS = 24 * 60 * 60;

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Holiday/weekly-off aware calendar maths for the School side (A-06, A-08).
 * Caches `holidays:{year}` in Redis and invalidates on `holiday.changed`
 * (docs/plan/backend/02-phase1-hr-school-core.md §7).
 */
@Injectable()
export class WorkingDaysService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: CacheService,
  ) {}

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

  async getHolidayDateKeysForYear(
    year: number,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<Set<string>> {
    const cacheKey = `holidays:${year}`;
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        try {
          return new Set(JSON.parse(cached) as string[]);
        } catch {
          // fall through to recompute on malformed cache payload
        }
      }
    }

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));
    const holidays = await client.holiday.findMany({
      where: { holidayDate: { gte: start, lte: end } },
    });
    const keys = new Set<string>();
    for (const holiday of holidays) {
      const applies =
        holiday.appliesToDepartments.length === 0 ||
        holiday.appliesToDepartments.includes(SCHOOL_DEPARTMENT);
      if (applies) keys.add(toDateKey(holiday.holidayDate));
    }

    if (this.cache) {
      await this.cache.set(
        cacheKey,
        JSON.stringify([...keys]),
        HOLIDAY_CACHE_TTL_SECONDS,
      );
    }
    return keys;
  }

  private async getHolidayKeysForRange(
    start: Date,
    end: Date,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<Set<string>> {
    const merged = new Set<string>();
    for (
      let year = start.getUTCFullYear();
      year <= end.getUTCFullYear();
      year++
    ) {
      const keys = await this.getHolidayDateKeysForYear(year, client);
      keys.forEach((key) => merged.add(key));
    }
    return merged;
  }

  async isHoliday(
    date: Date,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<boolean> {
    const keys = await this.getHolidayDateKeysForYear(
      date.getUTCFullYear(),
      client,
    );
    return keys.has(toDateKey(date));
  }

  async isWeeklyOff(
    date: Date,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<boolean> {
    const week = await this.getWorkingWeek(client);
    return week.includes(date.getUTCDay());
  }

  /** Working dates in [start, end] inclusive, excluding weekly-offs and holidays. */
  async listWorkingDates(
    start: Date,
    end: Date,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<Date[]> {
    const [workingWeek, holidayKeys] = await Promise.all([
      this.getWorkingWeek(client),
      this.getHolidayKeysForRange(start, end, client),
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

  async countWorkingDays(
    start: Date,
    end: Date,
    client: PrismaService | TxClient = this.prisma,
  ): Promise<number> {
    return (await this.listWorkingDates(start, end, client)).length;
  }

  @OnEvent(EventNames.HOLIDAY_CHANGED)
  async handleHolidayChanged(payload: { year: number }) {
    if (!this.cache) return;
    await this.cache.del(`holidays:${payload.year}`);
  }
}
