import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationPort } from '../../../shared/ports/notification.port';

@Injectable()
export class PoDeliveryReminderJob {
  private readonly logger = new Logger(PoDeliveryReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPort,
  ) {}

  /** Daily 08:00 — POs past expected delivery date. */
  @Cron('0 8 * * *')
  async handle() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const overdue = await this.prisma.purchaseOrder.findMany({
      where: {
        status: { in: ['approved', 'sent', 'partially_received'] },
        expectedDeliveryDate: { lt: today },
      },
      take: 50,
    });
    if (!overdue.length) return;

    const recipients = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        roles: {
          some: {
            role: { name: { in: ['accountant', 'receptionist'] } },
          },
        },
      },
      take: 20,
    });

    for (const po of overdue) {
      this.logger.log(`PO ${po.poNumber} is past expected delivery`);
      for (const user of recipients) {
        await this.notifications.notify({
          userId: user.id,
          type: 'po_delivery_overdue',
          title: 'PO delivery overdue',
          body: `PO ${po.poNumber} is past its expected delivery date`,
          entityType: 'purchase_order',
          entityId: po.id,
        });
      }
    }
  }
}
