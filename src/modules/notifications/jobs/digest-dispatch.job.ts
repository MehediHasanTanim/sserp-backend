import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DigestMode } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DigestService } from '../services/digest.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class DigestDispatchJob {
  private readonly logger = new Logger(DigestDispatchJob.name);

  constructor(
    private readonly digestService: DigestService,
    private readonly prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  @Cron('0 8 * * *')
  async dailyDigest() {
    await this.runDigest(DigestMode.daily);
  }

  @Cron('0 8 * * 1')
  async weeklyDigest() {
    await this.runDigest(DigestMode.weekly);
  }

  private async runDigest(mode: DigestMode) {
    const users = await this.prisma.digestQueue.findMany({
      where: { digestMode: mode, includedInDigestId: null },
      select: { userId: true },
      distinct: ['userId'],
    });
    for (const { userId } of users) {
      const built = await this.digestService.buildDigest(userId, mode);
      if (!built) continue;
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user?.email) continue;
      const body = built.notifications
        .map((n) => `<li><strong>${n.title}</strong>: ${n.body}</li>`)
        .join('');
      await this.emailQueue.add('digest', {
        to: user.email,
        subject: `Your ${mode} notification digest`,
        body: `<ul>${body}</ul>`,
        deliveryId: null,
      });
      await this.prisma.digest.update({
        where: { id: built.digest.id },
        data: { sentAt: new Date() },
      });
    }
    this.logger.log(
      `Digest dispatch (${mode}) processed ${users.length} user(s)`,
    );
  }
}
