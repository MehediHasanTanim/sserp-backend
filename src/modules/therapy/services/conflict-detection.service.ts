import { Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface ConflictCheckInput {
  therapistId: string;
  patientId?: string | null;
  groupId?: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  excludeSessionId?: string;
}

export interface ConflictResult {
  blocking: ConflictEntry[];
  warnings: ConflictEntry[];
}

export interface ConflictEntry {
  type:
    | 'therapist_double_booking'
    | 'patient_double_booking'
    | 'room_conflict'
    | 'leave_conflict';
  sessionId?: string;
  therapistId?: string;
  patientId?: string;
  message: string;
}

const ACTIVE_STATUSES: SessionStatus[] = ['scheduled', 'in_progress'];

@Injectable()
export class ConflictDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks for scheduling conflicts using half-open [start, end) interval semantics.
   * Returns blocking[] and warnings[]; caller decides whether to proceed.
   * GiST exclusion constraints are the DB backstop — this service gives friendly errors first.
   */
  async check(input: ConflictCheckInput): Promise<ConflictResult> {
    const blocking: ConflictEntry[] = [];
    const warnings: ConflictEntry[] = [];

    const {
      therapistId,
      patientId,
      scheduledStart,
      scheduledEnd,
      excludeSessionId,
    } = input;

    const baseWhere = {
      id: excludeSessionId ? { not: excludeSessionId } : undefined,
      status: { in: ACTIVE_STATUSES },
      // half-open interval: overlaps if start < other.end AND end > other.start
      scheduledStart: { lt: scheduledEnd },
      scheduledEnd: { gt: scheduledStart },
    };

    // C-01: Therapist double-booking
    const therapistConflicts = await this.prisma.therapySession.findMany({
      where: { ...baseWhere, therapistId },
      select: { id: true, scheduledStart: true, scheduledEnd: true },
    });

    for (const conflict of therapistConflicts) {
      blocking.push({
        type: 'therapist_double_booking',
        sessionId: conflict.id,
        therapistId,
        message: `Therapist has an overlapping session from ${conflict.scheduledStart.toISOString()} to ${conflict.scheduledEnd.toISOString()}`,
      });
    }

    // C-02: Patient double-booking
    if (patientId) {
      const patientConflicts = await this.prisma.therapySession.findMany({
        where: { ...baseWhere, patientId },
        select: { id: true, scheduledStart: true, scheduledEnd: true },
      });

      for (const conflict of patientConflicts) {
        blocking.push({
          type: 'patient_double_booking',
          sessionId: conflict.id,
          patientId,
          message: `Patient has an overlapping session from ${conflict.scheduledStart.toISOString()} to ${conflict.scheduledEnd.toISOString()}`,
        });
      }
    }

    return { blocking, warnings };
  }

  async checkWithLeave(
    input: ConflictCheckInput,
    therapistEmployeeId: string,
  ): Promise<ConflictResult> {
    const result = await this.check(input);

    // C-05: Check approved HR leave for therapist
    const leave = await this.prisma.hrLeaveRequest.findFirst({
      where: {
        employeeId: therapistEmployeeId,
        status: 'approved',
        startDate: { lte: input.scheduledEnd },
        endDate: { gte: input.scheduledStart },
      },
    });

    if (leave) {
      result.blocking.push({
        type: 'leave_conflict',
        therapistId: input.therapistId,
        message: `Therapist has approved leave from ${leave.startDate.toISOString()} to ${leave.endDate.toISOString()}`,
      });
    }

    return result;
  }
}
