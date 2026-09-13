import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { CompleteIepReviewDto, CreateIepReviewDto } from '../dto/iep.dto';
import { NotificationPort } from '../../../shared/ports/notification.port';
import { EventNames } from '../../../shared/events/event-names';
import { notifyStaffByRoles } from './guardian-notify.util';

/**
 * IEP quarterly/annual review scheduling and completion.
 * Rule I-11 — docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class IepReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPort,
    private readonly events: EventEmitter2,
  ) {}

  private async getPlan(iepId: string) {
    const plan = await this.prisma.iepPlan.findUnique({
      where: { id: iepId },
    });
    if (!plan) throw DomainException.notFound('IEP plan not found');
    return plan;
  }

  async list(iepId: string) {
    await this.getPlan(iepId);
    return this.prisma.iepReview.findMany({
      where: { iepId },
      orderBy: { scheduledDate: 'desc' },
    });
  }

  async schedule(iepId: string, input: CreateIepReviewDto) {
    await this.getPlan(iepId);
    return this.prisma.iepReview.create({
      data: {
        iepId,
        scheduledDate: new Date(input.scheduledDate),
        reviewType: input.reviewType,
        status: 'scheduled',
      },
    });
  }

  /**
   * Daily job: alert 14 and 3 days before next_review_date,
   * and mark overdue scheduled reviews as missed.
   */
  async sendDueReminders(now: Date = new Date()) {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const in3 = new Date(today);
    in3.setUTCDate(in3.getUTCDate() + 3);
    const in14 = new Date(today);
    in14.setUTCDate(in14.getUTCDate() + 14);

    const missed = await this.prisma.iepReview.updateMany({
      where: {
        status: 'scheduled',
        scheduledDate: { lt: today },
      },
      data: { status: 'missed' },
    });

    const plansDueIn3 = await this.prisma.iepPlan.findMany({
      where: {
        status: 'active',
        nextReviewDate: { gte: in3, lt: new Date(in3.getTime() + 86400000) },
      },
    });
    const plansDueIn14 = await this.prisma.iepPlan.findMany({
      where: {
        status: 'active',
        nextReviewDate: { gte: in14, lt: new Date(in14.getTime() + 86400000) },
      },
    });
    const plans = [...plansDueIn3, ...plansDueIn14];

    let alertsSent = 0;
    for (const plan of plans) {
      const daysUntil = plan.nextReviewDate
        ? Math.round(
            (plan.nextReviewDate.getTime() - today.getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;
      await notifyStaffByRoles(
        this.prisma,
        this.notifications,
        ['coordinator'],
        {
          type: 'iep_review_due',
          title: 'IEP review upcoming',
          body: `IEP review for plan ${plan.id} is due in ${daysUntil} day(s).`,
          entityType: 'iep_plan',
          entityId: plan.id,
        },
      );
      await this.events.emitAsync(EventNames.IEP_REVIEW_DUE, {
        iepId: plan.id,
        studentId: plan.studentId,
        daysUntil,
      });
      alertsSent += 1;
    }

    return { alertsSent, markedMissed: missed.count };
  }

  /** I-11: completing a review requires an outcome summary and sets the next review date. */
  async complete(
    reviewId: string,
    input: CompleteIepReviewDto,
    actorId: string,
  ) {
    const review = await this.prisma.iepReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw DomainException.notFound('IEP review not found');
    if (!input.outcomeSummary || !input.outcomeSummary.trim()) {
      throw DomainException.validation('An outcome summary is required');
    }

    const plan = await this.getPlan(review.iepId);
    const actualDate = new Date();
    const nextReviewDate = input.nextReviewDate
      ? new Date(input.nextReviewDate)
      : (() => {
          const next = new Date(actualDate);
          next.setUTCMonth(next.getUTCMonth() + plan.reviewFrequencyMonths);
          return next;
        })();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.iepReview.update({
        where: { id: reviewId },
        data: {
          status: 'completed',
          actualDate,
          outcomeSummary: input.outcomeSummary,
          nextReviewDate,
          attendees: input.attendees ? (input.attendees as object) : undefined,
          conductedBy: actorId,
        },
      });

      await tx.iepPlan.update({
        where: { id: review.iepId },
        data: { nextReviewDate },
      });

      return updated;
    });
  }
}
