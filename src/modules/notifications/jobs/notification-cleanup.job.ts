import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class NotificationCleanupJob {
  private readonly logger = new Logger(NotificationCleanupJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('15 3 * * *')
  async cleanup() {
    const now = new Date();
    const archiveBefore = new Date(now);
    archiveBefore.setDate(archiveBefore.getDate() - 90);
    const deleteBefore = new Date(now);
    deleteBefore.setFullYear(deleteBefore.getFullYear() - 1);
    const deliveryRetain = new Date(now);
    deliveryRetain.setFullYear(deliveryRetain.getFullYear() - 2);

    const archived = await this.prisma.notification.updateMany({
      where: {
        readAt: { not: null },
        archivedAt: null,
        createdAt: { lt: archiveBefore },
      },
      data: { archivedAt: now },
    });

    const deleted = await this.prisma.notification.deleteMany({
      where: {
        archivedAt: { not: null, lt: deleteBefore },
      },
    });

    const deliveriesDeleted = await this.prisma.notificationDelivery.deleteMany(
      {
        where: { createdAt: { lt: deliveryRetain } },
      },
    );

    this.logger.log(
      `Cleanup: archived=${archived.count} deleted=${deleted.count} deliveries=${deliveriesDeleted.count}`,
    );
  }
}
