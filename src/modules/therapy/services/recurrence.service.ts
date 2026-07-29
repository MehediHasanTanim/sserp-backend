import { Injectable, Logger } from '@nestjs/common';
import {
  RecurrencePattern,
  RecurrenceStatus,
  SessionMode,
  TherapyType,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { ConflictDetectionService } from './conflict-detection.service';
import { SessionService } from './session.service';

const ROLLING_WINDOW_DAYS = 90;
const MAX_SERIES_SESSIONS = 500;

export interface CreateRecurrenceDto {
  sessionMode: SessionMode;
  therapistId: string;
  patientId?: string;
  groupId?: string;
  therapyType: TherapyType;
  recurrencePattern: RecurrencePattern;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startTime: { hour: number; minute: number };
  durationMinutes: number;
  room?: string;
  startDate: Date;
  endDate?: Date;
  strict?: boolean;
}

export interface MaterialiseResult {
  created: number;
  skipped: string[];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Build a wall-clock datetime from a date + hour/minute, returns UTC Date */
function wallClockToUtc(date: Date, hour: number, minute: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      minute,
      0,
    ),
  );
}

@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictDetection: ConflictDetectionService,
    private readonly sessionService: SessionService,
  ) {}

  async create(dto: CreateRecurrenceDto, createdBy: string) {
    if (dto.recurrencePattern === 'weekly' && dto.dayOfWeek === undefined) {
      throw DomainException.validation('dayOfWeek is required for weekly recurrence');
    }
    if (dto.recurrencePattern === 'monthly' && dto.dayOfMonth === undefined) {
      throw DomainException.validation('dayOfMonth is required for monthly recurrence');
    }

    const recurrence = await this.prisma.therapyRecurrence.create({
      data: {
        sessionMode: dto.sessionMode,
        therapistId: dto.therapistId,
        patientId: dto.patientId,
        groupId: dto.groupId,
        therapyType: dto.therapyType,
        recurrencePattern: dto.recurrencePattern,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
        startTime: wallClockToUtc(dto.startDate, dto.startTime.hour, dto.startTime.minute),
        durationMinutes: dto.durationMinutes,
        room: dto.room,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: 'active',
        createdBy,
      },
    });

    // Materialise initial window
    const windowEnd = addDays(new Date(), ROLLING_WINDOW_DAYS);
    const until = dto.endDate && dto.endDate < windowEnd ? dto.endDate : windowEnd;
    await this.materialiseRange(recurrence.id, dto.startDate, until, dto.strict ?? false, createdBy);

    return recurrence;
  }

  async materialiseRange(
    recurrenceId: string,
    from: Date,
    until: Date,
    strict: boolean,
    createdBy: string,
  ): Promise<MaterialiseResult> {
    const recurrence = await this.prisma.therapyRecurrence.findUnique({
      where: { id: recurrenceId },
    });
    if (!recurrence) throw DomainException.notFound('Recurrence not found');
    if (recurrence.status !== 'active') throw new DomainException(ErrorCode.RECURRENCE_ENDED, 422, 'Recurrence is not active');

    const skipped: string[] = [];
    let created = 0;
    let sessionCount = await this.prisma.therapySession.count({
      where: { recurrenceId },
    });

    const occurrences = this.expandDates(recurrence, from, until);

    for (const [index, occDate] of occurrences.entries()) {
      if (sessionCount >= MAX_SERIES_SESSIONS) {
        throw new DomainException(
          ErrorCode.SERIES_CAP_EXCEEDED,
          422,
          `Series cap of ${MAX_SERIES_SESSIONS} sessions reached`,
        );
      }

      const startTime = recurrence.startTime;
      const scheduledStart = wallClockToUtc(
        occDate,
        startTime.getUTCHours(),
        startTime.getUTCMinutes(),
      );
      const scheduledEnd = new Date(scheduledStart.getTime() + recurrence.durationMinutes * 60000);

      // Check if session for this occurrence already exists
      const existing = await this.prisma.therapySession.findFirst({
        where: { recurrenceId, recurrenceOccurrenceIndex: index },
      });
      if (existing) continue;

      const conflicts = await this.conflictDetection.check({
        therapistId: recurrence.therapistId,
        patientId: recurrence.patientId,
        groupId: recurrence.groupId,
        scheduledStart,
        scheduledEnd,
      });

      if (conflicts.blocking.length > 0) {
        if (strict) {
          throw new DomainException(
            ErrorCode.SCHEDULE_CONFLICT,
            409,
            `Conflict at ${scheduledStart.toISOString()}: ${conflicts.blocking[0].message}`,
          );
        }
        skipped.push(scheduledStart.toISOString());
        continue;
      }

      await this.sessionService.schedule(
        {
          sessionMode: recurrence.sessionMode,
          therapyType: recurrence.therapyType,
          therapistId: recurrence.therapistId,
          patientId: recurrence.patientId ?? undefined,
          groupId: recurrence.groupId ?? undefined,
          scheduledStart,
          scheduledEnd,
          room: recurrence.room ?? undefined,
          recurrenceId,
          recurrenceOccurrenceIndex: index,
          isSeriesException: false,
          createdFrom: 'recurrence_job',
        },
        createdBy,
      );
      created++;
      sessionCount++;
    }

    await this.prisma.therapyRecurrence.update({
      where: { id: recurrenceId },
      data: { generatedUntil: until },
    });

    return { created, skipped };
  }

  private expandDates(
    recurrence: { recurrencePattern: RecurrencePattern; startDate: Date; endDate: Date | null; dayOfWeek: number | null; dayOfMonth: number | null },
    from: Date,
    until: Date,
  ): Date[] {
    const dates: Date[] = [];
    const effectiveFrom = recurrence.startDate > from ? recurrence.startDate : from;
    let current = new Date(effectiveFrom);

    if (recurrence.recurrencePattern === 'weekly' || recurrence.recurrencePattern === 'biweekly') {
      // Advance to first matching day
      const targetDay = recurrence.dayOfWeek ?? 1;
      while (current.getUTCDay() !== targetDay) {
        current = addDays(current, 1);
      }
      const step = recurrence.recurrencePattern === 'biweekly' ? 2 : 1;
      while (current <= until) {
        if (!recurrence.endDate || current <= recurrence.endDate) {
          dates.push(new Date(current));
        }
        current = addWeeks(current, step);
      }
    } else if (recurrence.recurrencePattern === 'daily') {
      while (current <= until) {
        if (!recurrence.endDate || current <= recurrence.endDate) {
          dates.push(new Date(current));
        }
        current = addDays(current, 1);
      }
    } else if (recurrence.recurrencePattern === 'monthly') {
      const dayOfMonth = recurrence.dayOfMonth ?? 1;
      // Move to correct day of month
      current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), dayOfMonth));
      if (current < effectiveFrom) current = addMonths(current, 1);
      while (current <= until) {
        if (!recurrence.endDate || current <= recurrence.endDate) {
          dates.push(new Date(current));
        }
        current = addMonths(current, 1);
      }
    }

    return dates;
  }

  async cancelFrom(recurrenceId: string, fromDate: Date, cancelledBy: string) {
    const recurrence = await this.prisma.therapyRecurrence.findUnique({
      where: { id: recurrenceId },
    });
    if (!recurrence) throw DomainException.notFound('Recurrence not found');

    // Cancel future scheduled sessions
    await this.prisma.therapySession.updateMany({
      where: {
        recurrenceId,
        scheduledStart: { gte: fromDate },
        status: { in: ['scheduled'] },
      },
      data: {
        status: 'cancelled',
        cancellationReason: 'Series cancelled',
        cancelledBy,
        cancelledAt: new Date(),
      },
    });

    // End the recurrence
    await this.prisma.therapyRecurrence.update({
      where: { id: recurrenceId },
      data: { status: 'cancelled', endDate: fromDate },
    });
  }

  async cancelAll(recurrenceId: string, cancelledBy: string) {
    await this.cancelFrom(recurrenceId, new Date(), cancelledBy);
  }

  /**
   * Edit from a date onward: split the series, create new recurrence from that date.
   */
  async editFromDate(
    recurrenceId: string,
    fromDate: Date,
    changes: Partial<CreateRecurrenceDto>,
    updatedBy: string,
  ) {
    const recurrence = await this.prisma.therapyRecurrence.findUnique({
      where: { id: recurrenceId },
    });
    if (!recurrence) throw DomainException.notFound('Recurrence not found');

    // Cancel future sessions on old series
    await this.prisma.therapySession.updateMany({
      where: {
        recurrenceId,
        scheduledStart: { gte: fromDate },
        status: { in: ['scheduled'] },
      },
      data: {
        status: 'cancelled',
        cancellationReason: 'Series updated from this date',
        cancelledBy: updatedBy,
        cancelledAt: new Date(),
      },
    });

    // End old series
    await this.prisma.therapyRecurrence.update({
      where: { id: recurrenceId },
      data: { status: 'ended', endDate: fromDate },
    });

    // Create new recurrence
    const newRecurrenceData: CreateRecurrenceDto = {
      sessionMode: recurrence.sessionMode,
      therapistId: changes.therapistId ?? recurrence.therapistId,
      patientId: changes.patientId ?? recurrence.patientId ?? undefined,
      groupId: changes.groupId ?? recurrence.groupId ?? undefined,
      therapyType: changes.therapyType ?? recurrence.therapyType,
      recurrencePattern: changes.recurrencePattern ?? recurrence.recurrencePattern,
      dayOfWeek: changes.dayOfWeek ?? recurrence.dayOfWeek ?? undefined,
      dayOfMonth: changes.dayOfMonth ?? recurrence.dayOfMonth ?? undefined,
      startTime: changes.startTime ?? {
        hour: recurrence.startTime.getUTCHours(),
        minute: recurrence.startTime.getUTCMinutes(),
      },
      durationMinutes: changes.durationMinutes ?? recurrence.durationMinutes,
      room: changes.room ?? recurrence.room ?? undefined,
      startDate: fromDate,
      endDate: changes.endDate ?? recurrence.endDate ?? undefined,
    };

    const newRecurrence = await this.prisma.therapyRecurrence.create({
      data: {
        ...newRecurrenceData,
        startTime: wallClockToUtc(fromDate, newRecurrenceData.startTime.hour, newRecurrenceData.startTime.minute),
        parentRecurrenceId: recurrenceId,
        createdBy: updatedBy,
        status: 'active',
      },
    });

    const windowEnd = addDays(new Date(), ROLLING_WINDOW_DAYS);
    const until = newRecurrenceData.endDate && newRecurrenceData.endDate < windowEnd
      ? newRecurrenceData.endDate
      : windowEnd;

    await this.materialiseRange(newRecurrence.id, fromDate, until, false, updatedBy);

    return newRecurrence;
  }
}
