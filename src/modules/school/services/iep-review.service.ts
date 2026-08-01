import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { CompleteIepReviewDto, CreateIepReviewDto } from '../dto/iep.dto';

/**
 * IEP quarterly/annual review scheduling and completion.
 * Rule I-11 — docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class IepReviewService {
  constructor(private readonly prisma: PrismaService) {}

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
