import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Student, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { EventNames } from '../../../shared/events/event-names';

export interface ChangeStatusInput {
  studentId: string;
  toStatus: StudentStatus;
  changedBy: string;
  reason?: string;
  isManualOverride?: boolean;
  /** internal trigger label surfaced on `student.activated`, e.g. 'admission_fee_paid' */
  trigger?: string;
}

const VALID_TRANSITIONS: Record<StudentStatus, StudentStatus[]> = {
  pending_admission_fee: ['active'],
  active: ['on_leave', 'inactive', 'graduated', 'transferred', 'withdrawn'],
  on_leave: ['active', 'inactive'],
  inactive: ['active'],
  graduated: [],
  transferred: [],
  withdrawn: [],
};

const TERMINAL_STATUSES: StudentStatus[] = [
  'graduated',
  'transferred',
  'withdrawn',
];

/**
 * S-07: the ONLY writer of `students.status`. Every transition appends
 * `student_status_history`; manual overrides require a mandatory reason.
 * See docs/plan/backend/02-phase1-hr-school-core.md §6 (S-08).
 */
@Injectable()
export class StudentStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  isTerminal(status: StudentStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
  }

  private assertValid(
    fromStatus: StudentStatus,
    toStatus: StudentStatus,
    isManualOverride: boolean,
    reason?: string,
  ) {
    const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
    const isValidPath = allowed.includes(toStatus);

    if (isManualOverride) {
      if (!reason || !reason.trim()) {
        throw DomainException.validation(
          'A reason is required for a manual status override',
        );
      }
      return;
    }

    if (!isValidPath) {
      throw DomainException.withCode(
        ErrorCode.INVALID_STATUS_TRANSITION,
        409,
        `Cannot transition student from ${fromStatus} to ${toStatus}`,
      );
    }
  }

  async changeStatus(
    input: ChangeStatusInput,
    tx?: TxClient,
  ): Promise<Student> {
    const client = tx ?? this.prisma;
    const student = await client.student.findFirst({
      where: { id: input.studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');

    const fromStatus = student.status;
    const isManualOverride = input.isManualOverride ?? false;
    this.assertValid(
      fromStatus,
      input.toStatus,
      isManualOverride,
      input.reason,
    );

    const updated = await client.student.update({
      where: { id: input.studentId },
      data: {
        status: input.toStatus,
        statusReason: isManualOverride ? input.reason : student.statusReason,
        updatedBy: input.changedBy,
      },
    });

    await client.studentStatusHistory.create({
      data: {
        studentId: input.studentId,
        fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        changedBy: input.changedBy,
        isManualOverride,
      },
    });

    await this.events.emitAsync(EventNames.STUDENT_STATUS_CHANGED, {
      studentId: input.studentId,
      fromStatus,
      toStatus: input.toStatus,
      reason: input.reason,
      isManualOverride,
    });

    if (input.toStatus === 'active') {
      await this.events.emitAsync(EventNames.STUDENT_ACTIVATED, {
        studentId: input.studentId,
        previousStatus: fromStatus,
        trigger: input.trigger ?? 'status_change',
      });
    }

    return updated;
  }

  async history(studentId: string) {
    return this.prisma.studentStatusHistory.findMany({
      where: { studentId },
      orderBy: { changedAt: 'desc' },
    });
  }
}
