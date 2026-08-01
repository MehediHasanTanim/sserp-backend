import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function addUtcDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return startOfUtcDay(next);
}

/**
 * Evaluates reminder schedules and emits domain events with concrete entity payloads
 * so the notification pipeline can resolve recipients.
 */
@Injectable()
export class ReminderDispatchJob {
  private readonly logger = new Logger(ReminderDispatchJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('*/30 * * * *')
  async dispatchDueReminders(now: Date = new Date()) {
    const schedules = await this.prisma.reminderSchedule.findMany({
      where: { isActive: true },
    });
    let emitted = 0;
    for (const schedule of schedules) {
      emitted += await this.dispatchSchedule(
        schedule.targetEvent,
        schedule.offsetDays,
        schedule.reminderCode,
        now,
      );
    }
    this.logger.debug(
      `Evaluated ${schedules.length} reminder schedule(s); emitted ${emitted}`,
    );
    return { schedules: schedules.length, emitted };
  }

  /** Exposed for tests / manual trigger. */
  async dispatchSchedule(
    targetEvent: string,
    offsetDays: number,
    reminderCode: string,
    now: Date = new Date(),
  ): Promise<number> {
    const today = startOfUtcDay(now);
    // offsetDays -7 → targetDate = today + 7 (N days before due)
    const targetDate = addUtcDays(today, -offsetDays);

    switch (targetEvent) {
      case EventNames.ADMISSION_FEE_PENDING:
        return this.emitAdmissionFeePending(targetDate, offsetDays, reminderCode);
      case EventNames.IEP_REVIEW_DUE:
        return this.emitIepReviewDue(targetDate, offsetDays, reminderCode);
      case EventNames.ACTIVITY_FEE_UNPAID:
        return this.emitActivityFeeUnpaid(targetDate, offsetDays, reminderCode);
      case EventNames.FEE_OVERDUE:
        // Positive offset = days after due date
        return this.emitFeeOverdue(targetDate, offsetDays, reminderCode);
      default:
        await this.events.emitAsync(targetEvent, {
          reminderCode,
          offsetDays,
          dispatchedAt: now.toISOString(),
        });
        return 1;
    }
  }

  private async emitAdmissionFeePending(
    targetDate: Date,
    offsetDays: number,
    reminderCode: string,
  ): Promise<number> {
    const fees = await this.prisma.admissionFee.findMany({
      where: {
        status: 'pending',
        invoiceDate: targetDate,
      },
      select: { id: true, studentId: true, invoiceDate: true },
    });
    for (const fee of fees) {
      await this.events.emitAsync(EventNames.ADMISSION_FEE_PENDING, {
        admissionFeeId: fee.id,
        studentId: fee.studentId,
        invoiceDate: fee.invoiceDate.toISOString().slice(0, 10),
        offsetDays,
        reminderCode,
      });
    }
    return fees.length;
  }

  private async emitIepReviewDue(
    targetDate: Date,
    offsetDays: number,
    reminderCode: string,
  ): Promise<number> {
    const plans = await this.prisma.iepPlan.findMany({
      where: {
        status: 'active',
        nextReviewDate: targetDate,
      },
      select: {
        id: true,
        studentId: true,
        nextReviewDate: true,
      },
    });
    for (const plan of plans) {
      await this.events.emitAsync(EventNames.IEP_REVIEW_DUE, {
        iepId: plan.id,
        studentId: plan.studentId,
        nextReviewDate: plan.nextReviewDate?.toISOString().slice(0, 10),
        offsetDays,
        reminderCode,
      });
    }
    return plans.length;
  }

  private async emitActivityFeeUnpaid(
    targetDate: Date,
    offsetDays: number,
    reminderCode: string,
  ): Promise<number> {
    const enrollments = await this.prisma.activityEnrollment.findMany({
      where: {
        feeStatus: 'pending',
        enrollmentState: { in: ['confirmed', 'waitlisted'] },
        activity: { activityDate: targetDate, status: { not: 'cancelled' } },
      },
      include: {
        activity: { select: { id: true, name: true, activityDate: true } },
      },
    });
    for (const enr of enrollments) {
      await this.events.emitAsync(EventNames.ACTIVITY_FEE_UNPAID, {
        enrollmentId: enr.id,
        studentId: enr.studentId,
        activityId: enr.activity.id,
        activityName: enr.activity.name,
        activityDate: enr.activity.activityDate.toISOString().slice(0, 10),
        offsetDays,
        reminderCode,
      });
    }
    return enrollments.length;
  }

  private async emitFeeOverdue(
    targetDate: Date,
    offsetDays: number,
    reminderCode: string,
  ): Promise<number> {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        status: { in: ['issued', 'partially_paid'] },
        dueDate: targetDate,
      },
      select: { id: true, studentId: true, dueDate: true },
    });
    for (const inv of invoices) {
      await this.events.emitAsync(EventNames.FEE_OVERDUE, {
        invoiceId: inv.id,
        studentId: inv.studentId,
        overdueDays: offsetDays,
        reminderCode,
      });
    }
    return invoices.length;
  }
}
