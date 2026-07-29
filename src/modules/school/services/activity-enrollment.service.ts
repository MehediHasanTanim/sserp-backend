import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActivityConsentChannel, ActivityEnrollment } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

export interface RespondActorContext {
  userId: string;
  channel: ActivityConsentChannel;
}

export interface RespondInput {
  decision: 'confirm' | 'decline';
  reason?: string;
}

type RespondOutcome =
  | { kind: 'confirmed'; enrollment: ActivityEnrollment }
  | { kind: 'waitlisted'; enrollment: ActivityEnrollment }
  | {
      kind: 'declined';
      enrollment: ActivityEnrollment;
      promoted: ActivityEnrollment | null;
    };

/**
 * Opt-in confirmation, capacity, and waitlist promotion.
 * Rules O-01–O-04, O-07, O-09 (promotion half), O-10 —
 * docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class ActivityEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** O-03/O-04: promotes the lowest-position waitlisted student to confirmed. */
  private async promoteFromWaitlist(
    tx: TxClient,
    activityId: string,
  ): Promise<ActivityEnrollment | null> {
    const next = await tx.activityEnrollment.findFirst({
      where: { activityId, enrollmentState: 'waitlisted' },
      orderBy: { waitlistPosition: 'asc' },
    });
    if (!next) return null;
    return tx.activityEnrollment.update({
      where: { id: next.id },
      data: { enrollmentState: 'confirmed', waitlistPosition: null },
    });
  }

  private async syncParticipantCount(tx: TxClient, activityId: string) {
    const count = await tx.activityEnrollment.count({
      where: { activityId, enrollmentState: 'confirmed' },
    });
    await tx.outdoorActivity.update({
      where: { id: activityId },
      data: { participantCount: count },
    });
  }

  /**
   * O-01/O-02/O-03/O-10: consent-driven opt-in. Below capacity confirms
   * immediately; at/above capacity waitlists under a row lock so two
   * concurrent requests cannot both take the same seat.
   */
  async respond(
    activityId: string,
    studentId: string,
    input: RespondInput,
    actor: RespondActorContext,
  ): Promise<ActivityEnrollment> {
    const outcome = await this.prisma.$transaction<RespondOutcome>(async (tx) => {
      const activity = await tx.outdoorActivity.findUnique({
        where: { id: activityId },
      });
      if (!activity) throw DomainException.notFound('Activity not found');
      if (activity.status === 'cancelled') {
        throw DomainException.conflict('Activity has been cancelled');
      }

      const student = await tx.student.findFirst({
        where: { id: studentId, deletedAt: null },
      });
      if (!student) throw DomainException.notFound('Student not found');
      if (student.status !== 'active') {
        throw DomainException.withCode(
          ErrorCode.STUDENT_NOT_ACTIVE,
          422,
          'Only active students may be enrolled in an activity',
        );
      }

      if (input.decision === 'confirm' && new Date() > activity.optInDeadline) {
        throw DomainException.withCode(
          ErrorCode.OPTIN_CLOSED,
          409,
          'The opt-in deadline for this activity has passed',
        );
      }

      // Lock all enrollment rows for this activity to serialize
      // capacity/waitlist assignment across concurrent opt-ins.
      await tx.$queryRaw`
        SELECT id FROM activity_enrollments
        WHERE activity_id = ${activityId}::uuid
        FOR UPDATE
      `;

      const existing = await tx.activityEnrollment.findUnique({
        where: { activityId_studentId: { activityId, studentId } },
      });

      if (input.decision === 'decline') {
        const wasConfirmed = existing?.enrollmentState === 'confirmed';
        const enrollment = await tx.activityEnrollment.upsert({
          where: { activityId_studentId: { activityId, studentId } },
          create: {
            activityId,
            studentId,
            consentStatus: 'declined',
            consentRecordedAt: new Date(),
            consentChannel: actor.channel,
            consentRecordedBy: actor.userId,
            declinedReason: input.reason,
            enrollmentState: 'declined',
          },
          update: {
            consentStatus: 'declined',
            consentRecordedAt: new Date(),
            consentChannel: actor.channel,
            consentRecordedBy: actor.userId,
            declinedReason: input.reason,
            enrollmentState: 'declined',
            waitlistPosition: null,
          },
        });
        const promoted = wasConfirmed
          ? await this.promoteFromWaitlist(tx, activityId)
          : null;
        await this.syncParticipantCount(tx, activityId);
        return { kind: 'declined', enrollment, promoted };
      }

      const confirmedCount = await tx.activityEnrollment.count({
        where: { activityId, enrollmentState: 'confirmed' },
      });
      const hasCapacity = confirmedCount < activity.capacity;

      let waitlistPosition: number | null = null;
      if (!hasCapacity) {
        const maxPosition = await tx.activityEnrollment.aggregate({
          where: { activityId, enrollmentState: 'waitlisted' },
          _max: { waitlistPosition: true },
        });
        waitlistPosition = (maxPosition._max.waitlistPosition ?? 0) + 1;
      }

      const enrollmentState = hasCapacity ? 'confirmed' : 'waitlisted';
      const enrollment = await tx.activityEnrollment.upsert({
        where: { activityId_studentId: { activityId, studentId } },
        create: {
          activityId,
          studentId,
          consentStatus: 'confirmed',
          consentRecordedAt: new Date(),
          consentChannel: actor.channel,
          consentRecordedBy: actor.userId,
          enrollmentState,
          waitlistPosition,
        },
        update: {
          consentStatus: 'confirmed',
          consentRecordedAt: new Date(),
          consentChannel: actor.channel,
          consentRecordedBy: actor.userId,
          declinedReason: null,
          enrollmentState,
          waitlistPosition,
        },
      });
      if (hasCapacity) {
        await this.syncParticipantCount(tx, activityId);
      }
      return hasCapacity
        ? { kind: 'confirmed', enrollment }
        : { kind: 'waitlisted', enrollment };
    });

    await this.emitOutcomeEvents(activityId, studentId, outcome);
    return outcome.enrollment;
  }

  /** O-04: coordinator-initiated withdrawal of a confirmed (or waitlisted) student. */
  async withdraw(activityId: string, studentId: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.activityEnrollment.findUnique({
        where: { activityId_studentId: { activityId, studentId } },
      });
      if (!existing) throw DomainException.notFound('Enrollment not found');
      if (existing.enrollmentState === 'withdrawn') {
        throw DomainException.conflict('Enrollment is already withdrawn');
      }

      await tx.$queryRaw`
        SELECT id FROM activity_enrollments
        WHERE activity_id = ${activityId}::uuid
        FOR UPDATE
      `;

      const wasConfirmed = existing.enrollmentState === 'confirmed';
      const enrollment = await tx.activityEnrollment.update({
        where: { id: existing.id },
        data: { enrollmentState: 'withdrawn', withdrawnAt: new Date() },
      });
      const promoted = wasConfirmed
        ? await this.promoteFromWaitlist(tx, activityId)
        : null;
      await this.syncParticipantCount(tx, activityId);
      return { enrollment, promoted };
    });

    if (outcome.promoted) {
      await this.events.emitAsync(EventNames.ACTIVITY_WAITLIST_PROMOTED, {
        activityId,
        studentId: outcome.promoted.studentId,
        enrollmentId: outcome.promoted.id,
      });
      await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_CONFIRMED, {
        activityId,
        studentId: outcome.promoted.studentId,
        enrollmentId: outcome.promoted.id,
      });
    }
    return outcome.enrollment;
  }

  private async emitOutcomeEvents(
    activityId: string,
    studentId: string,
    outcome: RespondOutcome,
  ) {
    if (outcome.kind === 'confirmed') {
      await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_CONFIRMED, {
        activityId,
        studentId,
        enrollmentId: outcome.enrollment.id,
      });
      return;
    }
    if (outcome.kind === 'declined') {
      await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_DECLINED, {
        activityId,
        studentId,
        enrollmentId: outcome.enrollment.id,
      });
      if (outcome.promoted) {
        await this.events.emitAsync(EventNames.ACTIVITY_WAITLIST_PROMOTED, {
          activityId,
          studentId: outcome.promoted.studentId,
          enrollmentId: outcome.promoted.id,
        });
        await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_CONFIRMED, {
          activityId,
          studentId: outcome.promoted.studentId,
          enrollmentId: outcome.promoted.id,
        });
      }
    }
    // 'waitlisted' outcome: no invoice-triggering event until promoted.
  }

  async listForStudent(studentId: string) {
    return this.prisma.activityEnrollment.findMany({
      where: { studentId },
      include: { activity: { include: { activityType: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(activityId: string, studentId: string) {
    const enrollment = await this.prisma.activityEnrollment.findUnique({
      where: { activityId_studentId: { activityId, studentId } },
    });
    if (!enrollment) throw DomainException.notFound('Enrollment not found');
    return enrollment;
  }
}
