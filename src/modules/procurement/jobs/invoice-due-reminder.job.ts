import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationPort } from '../../../shared/ports/notification.port';

@Injectable()
export class InvoiceDueReminderJob {
  private readonly logger = new Logger(InvoiceDueReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPort,
  ) {}

  /** Daily 08:15 — vendor invoices due within 7 days. */
  @Cron('15 8 * * *')
  async handle() {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setUTCDate(horizon.getUTCDate() + 7);

    const dueSoon = await this.prisma.vendorInvoice.findMany({
      where: {
        status: { in: ['approved', 'partially_paid', 'pending_approval'] },
        dueDate: { gte: now, lte: horizon },
      },
      take: 50,
    });
    if (!dueSoon.length) return;

    const accountants = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        roles: { some: { role: { name: 'accountant' } } },
      },
      take: 10,
    });

    for (const inv of dueSoon) {
      this.logger.log(
        `Invoice ${inv.invoiceNumber} due ${inv.dueDate.toISOString()}`,
      );
      for (const user of accountants) {
        await this.notifications.notify({
          userId: user.id,
          type: 'vendor_invoice_due',
          title: 'Vendor invoice due soon',
          body: `Invoice ${inv.invoiceNumber} is due within 7 days`,
          entityType: 'vendor_invoice',
          entityId: inv.id,
        });
      }
    }
  }
}
