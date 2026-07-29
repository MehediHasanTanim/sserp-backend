import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationPort } from '../../../shared/ports/notification.port';
import { EventNames } from '../../../shared/events/event-names';

const DEFAULT_REMINDER_DAYS = [3, 7, 15, 30];

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Overdue fee reminders — cron-driven and manually triggerable.
 * docs/plan/backend/03-phase2-school-advanced.md §8 (fee-reminder job).
 */
@Injectable()
export class FeeReminderService {
  private readonly logger = new Logger(FeeReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPort,
    private readonly events: EventEmitter2,
  ) {}

  async sendReminders(now: Date = new Date()) {
    const org = await this.prisma.organizationSettings.findFirst();
    const reminderDays = Array.isArray(org?.feeReminderDays)
      ? (org!.feeReminderDays as unknown as number[])
      : DEFAULT_REMINDER_DAYS;

    const overdueInvoices = await this.prisma.feeInvoice.findMany({
      where: {
        status: { in: ['issued', 'partially_paid'] },
        dueDate: { lt: now },
      },
      include: {
        student: {
          include: {
            guardians: { where: { guardianProfileId: { not: null } } },
          },
        },
      },
    });

    let remindersSent = 0;
    for (const invoice of overdueInvoices) {
      const overdueDays = daysBetween(invoice.dueDate, now);
      if (!reminderDays.includes(overdueDays)) continue;

      const guardianProfileIds = invoice.student.guardians
        .map((g) => g.guardianProfileId)
        .filter((id): id is string => !!id);
      if (!guardianProfileIds.length) continue;

      const users = await this.prisma.user.findMany({
        where: { guardianId: { in: guardianProfileIds }, isActive: true },
      });

      for (const user of users) {
        await this.notifications.notify({
          userId: user.id,
          type: 'fee_overdue',
          title: 'Fee payment overdue',
          body: `Invoice ${invoice.invoiceNumber} is ${overdueDays} day(s) overdue. Outstanding: ${invoice.outstandingAmount}`,
          entityType: 'fee_invoice',
          entityId: invoice.id,
        });
        remindersSent += 1;
      }

      await this.events.emitAsync(EventNames.FEE_OVERDUE, {
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        overdueDays,
      });
    }

    this.logger.log(`fee-reminder sent ${remindersSent} reminder(s)`);
    return { remindersSent, invoicesChecked: overdueInvoices.length };
  }
}
