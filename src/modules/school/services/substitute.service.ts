import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubstituteTrigger } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface AbsenceTriggerEvent {
  id: string;
  employeeId: string;
  date: string;
  markedBy?: string;
}

export interface LeaveApprovedTriggerEvent {
  leaveRequestId: string;
  employeeId: string;
  leaveTypeCode?: string;
  startDate: string;
  endDate: string;
  approvedBy?: string;
}

export interface LeaveCancelledTriggerEvent {
  leaveRequestId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
}

export interface AttendanceCorrectedTriggerEvent {
  id: string;
  employeeId: string;
  date: string;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { code?: string }).code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

/**
 * B-01–B-09: substitute assignment lifecycle. Creation from HR triggers is
 * idempotent on `(studentId, triggerType, triggerReferenceId)`.
 */
@Injectable()
export class SubstituteService {
  private readonly logger = new Logger(SubstituteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  private async activeMappingsForTeacher(employeeId: string) {
    return this.prisma.studentTeacherMapping.findMany({
      where: { teacherEmployeeId: employeeId, isActive: true },
    });
  }

  /** B-01/B-03: one pending row per mapped student, keyed by the attendance record id. */
  async createForAbsence(event: AbsenceTriggerEvent) {
    const mappings = await this.activeMappingsForTeacher(event.employeeId);
    const date = new Date(event.date);
    let created = 0;
    for (const mapping of mappings) {
      try {
        await this.prisma.substituteAssignment.create({
          data: {
            studentId: mapping.studentId,
            primaryTeacherId: event.employeeId,
            startDate: date,
            endDate: date,
            triggerType: 'absence',
            triggerReferenceId: event.id,
            status: 'pending',
          },
        });
        created += 1;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    return { created };
  }

  /** B-02/B-03: one pending row per mapped student, spanning the full leave range. */
  async createForLeaveApproved(event: LeaveApprovedTriggerEvent) {
    const mappings = await this.activeMappingsForTeacher(event.employeeId);
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);
    let created = 0;
    for (const mapping of mappings) {
      try {
        await this.prisma.substituteAssignment.create({
          data: {
            studentId: mapping.studentId,
            primaryTeacherId: event.employeeId,
            startDate,
            endDate,
            triggerType: 'leave',
            triggerReferenceId: event.leaveRequestId,
            status: 'pending',
          },
        });
        created += 1;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    return { created };
  }

  /** B-07: cancel pending rows for a cancelled leave. */
  async cancelForLeaveCancelled(event: LeaveCancelledTriggerEvent) {
    return this.prisma.substituteAssignment.updateMany({
      where: {
        triggerType: 'leave',
        triggerReferenceId: event.leaveRequestId,
        status: 'pending',
      },
      data: { status: 'cancelled' },
    });
  }

  /** B-07: cancel a pending row if attendance is corrected away from absent. */
  async cancelForAttendanceCorrected(event: AttendanceCorrectedTriggerEvent) {
    return this.prisma.substituteAssignment.updateMany({
      where: {
        triggerType: 'absence',
        triggerReferenceId: event.id,
        status: 'pending',
      },
      data: { status: 'cancelled' },
    });
  }

  async list(query: {
    status?: string;
    substituteTeacherId?: string;
    studentId?: string;
  }) {
    return this.prisma.substituteAssignment.findMany({
      where: {
        status: query.status as never,
        substituteTeacherId: query.substituteTeacherId,
        studentId: query.studentId,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async listPending() {
    return this.prisma.substituteAssignment.findMany({
      where: { status: 'pending' },
      orderBy: { startDate: 'asc' },
    });
  }

  private async isTeacherUnavailable(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<boolean> {
    const [absentDay, approvedLeave] = await Promise.all([
      this.prisma.hrAttendance.findFirst({
        where: {
          employeeId,
          status: 'absent',
          attendanceDate: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.hrLeaveRequest.findFirst({
        where: {
          employeeId,
          status: 'approved',
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      }),
    ]);
    return !!absentDay || !!approvedLeave;
  }

  /** B-04/B-05: cap does not apply to substitutes; only availability is checked. */
  async assign(
    substituteAssignmentId: string,
    substituteTeacherId: string,
    actorId: string,
  ) {
    const assignment = await this.prisma.substituteAssignment.findUnique({
      where: { id: substituteAssignmentId },
    });
    if (!assignment) {
      throw DomainException.notFound('Substitute assignment not found');
    }
    if (
      assignment.status === 'cancelled' ||
      assignment.status === 'auto_reverted'
    ) {
      throw DomainException.conflict(
        `Substitute assignment is already ${assignment.status}`,
      );
    }

    const teacher = await this.prisma.teacher.findUnique({
      where: { employeeId: substituteTeacherId },
    });
    if (!teacher || teacher.status !== 'active') {
      throw DomainException.withCode(
        ErrorCode.SUBSTITUTE_UNAVAILABLE,
        409,
        'Substitute must be an active teacher',
      );
    }

    const unavailable = await this.isTeacherUnavailable(
      substituteTeacherId,
      assignment.startDate,
      assignment.endDate,
    );
    if (unavailable) {
      throw DomainException.withCode(
        ErrorCode.SUBSTITUTE_UNAVAILABLE,
        409,
        'Substitute is absent or on approved leave for part of this date range',
      );
    }

    const updated = await this.prisma.substituteAssignment.update({
      where: { id: substituteAssignmentId },
      data: {
        substituteTeacherId,
        status: 'assigned',
        assignedBy: actorId,
      },
    });

    await this.events.emitAsync(EventNames.SUBSTITUTE_ASSIGNED, {
      substituteAssignmentId: updated.id,
      studentId: updated.studentId,
      substituteTeacherId,
      startDate: updated.startDate,
      endDate: updated.endDate,
    });

    return updated;
  }

  async update(
    id: string,
    input: { substituteTeacherId?: string; endDate?: string; notes?: string },
    actorId: string,
  ) {
    const assignment = await this.prisma.substituteAssignment.findUnique({
      where: { id },
    });
    if (!assignment) {
      throw DomainException.notFound('Substitute assignment not found');
    }
    if (input.substituteTeacherId) {
      return this.assign(id, input.substituteTeacherId, actorId);
    }
    return this.prisma.substituteAssignment.update({
      where: { id },
      data: {
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        notes: input.notes,
      },
    });
  }

  async cancel(id: string, reason: string) {
    const assignment = await this.prisma.substituteAssignment.findUnique({
      where: { id },
    });
    if (!assignment) {
      throw DomainException.notFound('Substitute assignment not found');
    }
    return this.prisma.substituteAssignment.update({
      where: { id },
      data: { status: 'cancelled', notes: reason },
    });
  }

  /** B-06: nightly job — elapsed `assigned` rows revert; the primary mapping is untouched. */
  async autoRevertElapsed(asOf = new Date()) {
    const today = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
    );
    const result = await this.prisma.substituteAssignment.updateMany({
      where: { status: 'assigned', endDate: { lt: today } },
      data: { status: 'auto_reverted', revertedAt: new Date() },
    });
    this.logger.log(
      `Auto-reverted ${result.count} elapsed substitute assignment(s)`,
    );
    return result;
  }

  /** B-08: daily alert for pending rows starting today or tomorrow. */
  async emitUnassignedAlerts(asOf = new Date()) {
    const today = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
    );
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const pending = await this.prisma.substituteAssignment.findMany({
      where: {
        status: 'pending',
        startDate: { lte: tomorrow },
      },
    });
    const relevant = pending.filter((p) => p.startDate >= today);
    if (!relevant.length) return { alerted: 0 };

    const byTeacherDate = new Map<
      string,
      {
        teacherId: string;
        date: Date;
        studentIds: string[];
        triggerType: SubstituteTrigger;
      }
    >();
    for (const row of relevant) {
      const key = `${row.primaryTeacherId}:${toDateKey(row.startDate)}`;
      const existing = byTeacherDate.get(key);
      if (existing) {
        existing.studentIds.push(row.studentId);
      } else {
        byTeacherDate.set(key, {
          teacherId: row.primaryTeacherId,
          date: row.startDate,
          studentIds: [row.studentId],
          triggerType: row.triggerType,
        });
      }
    }

    for (const group of byTeacherDate.values()) {
      await this.events.emitAsync(EventNames.SUBSTITUTE_UNASSIGNED, {
        studentIds: group.studentIds,
        teacherId: group.teacherId,
        date: group.date,
        triggerType: group.triggerType,
      });
    }
    return { alerted: byTeacherDate.size };
  }
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
