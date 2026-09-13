import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IepPlan } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { EventNames } from '../../../shared/events/event-names';
import { CreateIepPlanDto, UpdateIepPlanDto } from '../dto/iep.dto';

const GOAL_INCLUDE = {
  goals: {
    orderBy: { sequence: 'asc' as const },
    include: { skillDomain: { select: { id: true, name: true } } },
  },
  reviews: { orderBy: { scheduledDate: 'desc' as const } },
};

type PlanWithGoals = {
  goals: Array<{
    skillDomainId: string;
    responsibleTeacherId: string | null;
    skillDomain?: { id: string; name: string } | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

/**
 * IEP plan lifecycle: draft creation, revision, publish (with archival of
 * the previous active version), and parent acknowledgment.
 * Rules I-01 through I-11 — docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class IepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Optional() @InjectQueue('pdf') private readonly pdfQueue?: Queue,
  ) {}

  async listForStudent(studentId: string) {
    const plans = await this.prisma.iepPlan.findMany({
      where: { studentId },
      include: GOAL_INCLUDE,
      orderBy: { version: 'desc' },
    });
    return Promise.all(plans.map((plan) => this.withGoalLabels(plan)));
  }

  async get(id: string) {
    const plan = await this.prisma.iepPlan.findUnique({
      where: { id },
      include: GOAL_INCLUDE,
    });
    if (!plan) throw DomainException.notFound('IEP plan not found');
    return this.withGoalLabels(plan);
  }

  /** Attach human-readable domain / teacher labels for API consumers. */
  private async withGoalLabels<T extends PlanWithGoals>(plan: T) {
    const teacherIds = [
      ...new Set(
        plan.goals
          .map((g) => g.responsibleTeacherId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const teachers =
      teacherIds.length > 0
        ? await this.prisma.teacher.findMany({
            where: { id: { in: teacherIds } },
            include: {
              employee: { select: { fullName: true, employeeCode: true } },
            },
          })
        : [];
    const teacherNameById = new Map(
      teachers.map((t) => [
        t.id,
        t.employee?.fullName ?? t.employee?.employeeCode ?? null,
      ]),
    );

    return {
      ...plan,
      goals: plan.goals.map((goal) => ({
        ...goal,
        skillDomainName: goal.skillDomain?.name ?? null,
        responsibleTeacherName: goal.responsibleTeacherId
          ? (teacherNameById.get(goal.responsibleTeacherId) ?? null)
          : null,
      })),
    };
  }

  /** Creates the first draft (v1) or the next version if prior versions exist. */
  async createDraft(studentId: string, input: CreateIepPlanDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');
    this.assertDateRange(input.startDate, input.endDate);

    const last = await this.prisma.iepPlan.findFirst({
      where: { studentId },
      orderBy: { version: 'desc' },
    });

    const created = await this.prisma.iepPlan.create({
      data: {
        studentId,
        academicYearId: input.academicYearId,
        version: (last?.version ?? 0) + 1,
        status: 'draft',
        createdByTeacherId: input.createdByTeacherId,
        reviewFrequencyMonths: input.reviewFrequencyMonths ?? 3,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      },
      include: GOAL_INCLUDE,
    });
    return this.withGoalLabels(created);
  }

  /** I-02: only draft plans are editable. */
  async update(id: string, input: UpdateIepPlanDto) {
    const plan = await this.get(id);
    this.assertEditable(plan);
    this.assertDateRange(
      input.startDate ?? plan.startDate?.toISOString().slice(0, 10),
      input.endDate ?? plan.endDate?.toISOString().slice(0, 10),
    );
    const updated = await this.prisma.iepPlan.update({
      where: { id },
      data: {
        reviewFrequencyMonths: input.reviewFrequencyMonths,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        createdByTeacherId: input.createdByTeacherId,
      },
      include: GOAL_INCLUDE,
    });
    return this.withGoalLabels(updated);
  }

  private assertDateRange(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate && startDate > endDate) {
      throw DomainException.validation(
        'endDate must be on or after startDate',
      );
    }
  }

  private assertEditable(plan: IepPlan) {
    if (plan.status !== 'draft') {
      throw DomainException.withCode(
        ErrorCode.IEP_NOT_EDITABLE,
        409,
        'Only draft IEP plans can be edited; use revise to create a new version',
      );
    }
  }

  /** I-03: creates v(n+1) copying goals from the source plan (typically active). */
  async revise(id: string, actorId: string) {
    const source = await this.get(id);

    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.iepPlan.create({
        data: {
          studentId: source.studentId,
          academicYearId: source.academicYearId,
          version: source.version + 1,
          status: 'draft',
          previousVersionId: source.id,
          createdByTeacherId: actorId,
          reviewFrequencyMonths: source.reviewFrequencyMonths,
          startDate: source.startDate,
          endDate: source.endDate,
        },
      });

      for (const goal of source.goals) {
        await tx.iepGoal.create({
          data: {
            iepId: draft.id,
            skillDomainId: goal.skillDomainId,
            learningObjectiveId: goal.learningObjectiveId,
            goalType: goal.goalType,
            description: goal.description,
            baselineDescription: goal.baselineDescription,
            measurementCriteria: goal.measurementCriteria,
            targetDate: goal.targetDate,
            status: goal.status,
            progressPercentage: goal.progressPercentage,
            sequence: goal.sequence,
            responsibleTeacherId: goal.responsibleTeacherId,
          },
        });
      }

      return tx.iepPlan.findUnique({
        where: { id: draft.id },
        include: GOAL_INCLUDE,
      });
    });

    await this.events.emitAsync(EventNames.IEP_REVISED, {
      studentId: source.studentId,
      previousIepId: source.id,
      newIepId: created!.id,
      version: created!.version,
    });

    return this.withGoalLabels(created!);
  }

  /**
   * I-01/I-04/I-10: validates completeness, archives the previous active
   * plan for this student in the same transaction, sets the next review
   * date, and creates the first scheduled review.
   */
  async publish(id: string, actorId: string) {
    const plan = await this.get(id);
    this.assertEditable(plan);

    if (!plan.goals.length) {
      throw DomainException.withCode(
        ErrorCode.IEP_INCOMPLETE,
        422,
        'At least one goal is required before publishing',
      );
    }
    for (const goal of plan.goals) {
      if (
        !goal.skillDomainId ||
        !goal.description ||
        !goal.targetDate ||
        !goal.responsibleTeacherId
      ) {
        throw DomainException.withCode(
          ErrorCode.IEP_INCOMPLETE,
          422,
          `Goal "${goal.description || goal.id}" is missing a domain, description, target date, or responsible teacher`,
        );
      }
    }

    const publishedAt = new Date();
    const nextReviewDate = new Date(publishedAt);
    nextReviewDate.setUTCMonth(
      nextReviewDate.getUTCMonth() + plan.reviewFrequencyMonths,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.iepPlan.updateMany({
        where: { studentId: plan.studentId, status: 'active' },
        data: { status: 'archived' },
      });

      const updated = await tx.iepPlan.update({
        where: { id },
        data: {
          status: 'active',
          approvedBy: actorId,
          approvedAt: publishedAt,
          publishedAt,
          nextReviewDate,
        },
        include: GOAL_INCLUDE,
      });

      await tx.iepReview.create({
        data: {
          iepId: id,
          scheduledDate: nextReviewDate,
          reviewType: 'quarterly',
          status: 'scheduled',
        },
      });

      return updated;
    });

    await this.enqueuePdf(result);

    await this.events.emitAsync(EventNames.IEP_PUBLISHED, {
      studentId: result.studentId,
      iepId: result.id,
      version: result.version,
      publishedAt,
      nextReviewDate,
    });

    return this.withGoalLabels(result);
  }

  private async enqueuePdf(plan: IepPlan) {
    if (!this.pdfQueue) return;
    await this.pdfQueue
      .add('render-iep', { iepId: plan.id, studentId: plan.studentId })
      .catch(() => undefined);
  }

  async archive(id: string) {
    const plan = await this.get(id);
    if (plan.status === 'archived') {
      throw DomainException.conflict('IEP plan is already archived');
    }
    const archived = await this.prisma.iepPlan.update({
      where: { id },
      data: { status: 'archived' },
      include: GOAL_INCLUDE,
    });
    return this.withGoalLabels(archived);
  }

  /**
   * Permanently removes a draft IEP. Published/active/archived plans cannot
   * be deleted — archive or revise instead.
   */
  async deleteDraft(id: string) {
    const plan = await this.prisma.iepPlan.findUnique({
      where: { id },
      include: { goals: { select: { id: true } } },
    });
    if (!plan) throw DomainException.notFound('IEP plan not found');
    if (plan.status !== 'draft') {
      throw DomainException.withCode(
        ErrorCode.IEP_NOT_EDITABLE,
        409,
        'Only draft IEP plans can be deleted',
      );
    }

    const goalIds = plan.goals.map((g) => g.id);

    await this.prisma.$transaction(async (tx) => {
      if (goalIds.length > 0) {
        await tx.progressReportGoalLink.deleteMany({
          where: { iepGoalId: { in: goalIds } },
        });
        await tx.behavioralIncident.updateMany({
          where: { linkedIepGoalId: { in: goalIds } },
          data: { linkedIepGoalId: null },
        });
      }
      // Clear self-references so deleting a draft that was used as a
      // previousVersion base does not violate the FK.
      await tx.iepPlan.updateMany({
        where: { previousVersionId: id },
        data: { previousVersionId: null },
      });
      await tx.iepPlan.delete({ where: { id } });
    });

    return { id, deleted: true };
  }

  /**
   * I-09: idempotent per (iep_id, guardian_id) — a repeat call returns the
   * original acknowledgment instead of creating a duplicate.
   */
  async acknowledge(
    iepId: string,
    guardianProfileId: string,
    input: { signatureText: string; ipAddress?: string; userAgent?: string },
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;
    const plan = await client.iepPlan.findUnique({ where: { id: iepId } });
    if (!plan || plan.status === 'draft') {
      throw DomainException.notFound('IEP plan not found');
    }

    const existing = await client.iepAcknowledgment.findUnique({
      where: { iepId_guardianId: { iepId, guardianId: guardianProfileId } },
    });
    if (existing) return existing;

    const created = await client.iepAcknowledgment.create({
      data: {
        iepId,
        guardianId: guardianProfileId,
        signatureText: input.signatureText,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    await this.events.emitAsync(EventNames.IEP_ACKNOWLEDGED, {
      iepId,
      guardianId: guardianProfileId,
      acknowledgedAt: created.acknowledgedAt,
    });

    return created;
  }
}
