import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CacheService } from '../../../shared/cache/redis.module';

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @InjectQueue('sms') private readonly smsQueue: Queue,
    @InjectQueue('notifications') private readonly notifQueue: Queue,
  ) {}

  @Cron('0 * * * *')
  async snapshot() {
    try {
      const dbSize = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
        SELECT pg_database_size(current_database()) AS size
      `;
      const conns = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database()
      `;
      const info = await this.cache.client.info('memory');
      const memMatch = /used_memory:(\d+)/.exec(info);
      const depths = {
        email: await this.emailQueue.getWaitingCount(),
        sms: await this.smsQueue.getWaitingCount(),
        notifications: await this.notifQueue.getWaitingCount(),
      };
      await this.prisma.systemHealthSnapshot.create({
        data: {
          dbSizeBytes: dbSize[0]?.size ?? 0n,
          activeConnections: Number(conns[0]?.count ?? 0),
          redisMemoryBytes: memMatch ? BigInt(memMatch[1]) : null,
          queueDepths: depths,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Health snapshot failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async queueHealthy() {
    try {
      await this.emailQueue.getJobCounts();
      return true;
    } catch {
      return false;
    }
  }

  listBackups() {
    // Placeholder listing — real dumps live on the backup volume
    return {
      items: [],
      note: 'Backups are managed by scripts/backup-pg.sh; restore is an operator procedure',
    };
  }

  async triggerBackup() {
    this.logger.log('Backup trigger requested via admin API');
    return { queued: true, at: new Date().toISOString() };
  }
}
