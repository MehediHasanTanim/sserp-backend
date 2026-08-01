import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class GrnClearingReviewJob {
  private readonly logger = new Logger(GrnClearingReviewJob.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Weekly — GRN clearing (2020) balances older than 30 days. */
  @Cron('0 6 * * 1')
  async handle() {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);

    const clearing = await this.prisma.chartOfAccount.findUnique({
      where: { accountCode: '2020' },
    });
    if (!clearing) return;

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: clearing.id,
        journal: {
          status: 'posted',
          entryDate: { lt: cutoff },
        },
      },
      include: { journal: true },
      take: 500,
    });

    let net = 0;
    for (const line of lines) {
      net += line.debitAmount - line.creditAmount;
    }

    if (net !== 0) {
      this.logger.warn(
        `GRN clearing account 2020 has net balance ${net} from entries older than 30 days (${lines.length} lines)`,
      );
    } else {
      this.logger.log('GRN clearing review: no stale clearing balance');
    }

    return { netBalance: net, lineCount: lines.length, cutoff };
  }
}
