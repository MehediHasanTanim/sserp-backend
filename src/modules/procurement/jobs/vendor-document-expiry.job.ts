import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';
import { NotificationPort } from '../../../shared/ports/notification.port';

@Injectable()
export class VendorDocumentExpiryJob {
  private readonly logger = new Logger(VendorDocumentExpiryJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPort,
    private readonly events: EventEmitter2,
  ) {}

  /** Weekly Monday 07:00 — trade licences and tax certificates expiring within 30 days. */
  @Cron('0 7 * * 1')
  async handle() {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setUTCDate(horizon.getUTCDate() + 30);

    const expiring = await this.prisma.vendorDocument.findMany({
      where: {
        expiryDate: { gte: now, lte: horizon },
        documentType: { in: ['trade_license', 'tax_certificate'] },
      },
      include: { vendor: true },
      take: 100,
    });

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
      take: 15,
    });

    for (const doc of expiring) {
      this.logger.log(
        `Vendor ${doc.vendor.name} document ${doc.documentType} expiring`,
      );
      this.events.emit(EventNames.VENDOR_DOCUMENT_EXPIRING, {
        vendorId: doc.vendorId,
        documentId: doc.id,
        expiryDate: doc.expiryDate,
      });
      for (const user of recipients) {
        await this.notifications.notify({
          userId: user.id,
          type: 'vendor_document_expiring',
          title: 'Vendor document expiring',
          body: `${doc.vendor.name}: ${doc.documentType} expires soon`,
          entityType: 'vendor',
          entityId: doc.vendorId,
        });
      }
    }
  }
}
