import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AttachmentService } from '../files/services/minio.service';
import { FilesModule } from '../files/files.module';

@Injectable()
export class MaintenanceJobs {
  private readonly logger = new Logger(MaintenanceJobs.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentService,
  ) {}

  @Cron('30 3 * * *')
  async attachmentCleanup() {
    const n = await this.attachments.cleanupOrphans();
    this.logger.log(`Attachment cleanup orphaned ${n} objects`);
  }

  @Cron('0 4 * * *')
  async refreshTokenPrune() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    this.logger.log(`Pruned ${result.count} expired refresh tokens`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async idempotencyPrune() {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    this.logger.log(`Pruned ${result.count} idempotency keys`);
  }
}

@Module({
  imports: [FilesModule],
  providers: [MaintenanceJobs],
})
export class MaintenanceModule {}
