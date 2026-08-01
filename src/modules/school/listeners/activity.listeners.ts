import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventNames } from '../../../shared/events/event-names';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActivityEnrollmentService } from '../services/activity.service';

@Injectable()
export class ActivityFeeListener {
  constructor(private readonly enrollments: ActivityEnrollmentService) {}

  @OnEvent(EventNames.ACTIVITY_OPTIN_CONFIRMED)
  async onConfirmed(payload: { activityId: string; studentId: string }) {
    await this.enrollments.generateInvoice(
      payload.activityId,
      payload.studentId,
    );
  }

  @OnEvent(EventNames.ACTIVITY_WAITLIST_PROMOTED)
  async onPromoted(payload: { activityId: string; studentId: string }) {
    await this.enrollments.generateInvoice(
      payload.activityId,
      payload.studentId,
    );
  }
}

@Injectable()
export class ActivityCancellationListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(EventNames.ACTIVITY_CANCELLED)
  async onCancelled(payload: { activityId: string }) {
    await this.prisma.$transaction(async (tx) => {
      const enrollments = await tx.activityEnrollment.findMany({
        where: { activityId: payload.activityId },
      });
      for (const e of enrollments) {
        await tx.activityEnrollment.update({
          where: { id: e.id },
          data: { enrollmentState: 'withdrawn', withdrawnAt: new Date() },
        });
        if (e.invoiceId) {
          const inv = await tx.feeInvoice.findUnique({
            where: { id: e.invoiceId },
          });
          if (inv && inv.paidAmount === 0 && inv.status !== 'cancelled') {
            await tx.feeInvoice.update({
              where: { id: inv.id },
              data: {
                status: 'cancelled',
                cancelledReason: 'Activity cancelled',
              },
            });
          }
        }
      }
      await tx.outdoorActivity.update({
        where: { id: payload.activityId },
        data: { participantCount: 0 },
      });
    });
  }
}
