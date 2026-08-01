import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class SocketSessionPruneJob {
  private readonly logger = new Logger(SocketSessionPruneJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *')
  async pruneOrphanedSessions() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const result = await this.prisma.socketSession.deleteMany({
      where: {
        disconnectedAt: { not: null, lt: cutoff },
      },
    });
    const orphaned = await this.prisma.socketSession.updateMany({
      where: {
        disconnectedAt: null,
        connectedAt: { lt: cutoff },
      },
      data: { disconnectedAt: new Date() },
    });
    this.logger.log(
      `Socket session prune: deleted=${result.count} closed=${orphaned.count}`,
    );
  }
}
