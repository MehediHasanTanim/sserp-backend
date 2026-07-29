import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RecurrenceService } from '../services/recurrence.service';
import { WaitingListService } from '../services/waiting-list.service';
import { TherapyBillingService } from '../services/therapy-billing.service';

const ROLLING_WINDOW_DAYS = 90;

@Injectable()
export class TherapyOpsJob {
  private readonly logger = new Logger(TherapyOpsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrenceService: RecurrenceService,
    private readonly waitingListService: WaitingListService,
    private readonly billingService: TherapyBillingService,
  ) {}

  /** Nightly: materialise sessions within rolling 90-day window */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async materialiseRecurrences() {
    this.logger.log('Starting recurrence materialisation job');
    const windowEnd = new Date(Date.now() + ROLLING_WINDOW_DAYS * 86400000);

    const activeRecurrences = await this.prisma.therapyRecurrence.findMany({
      where: {
        status: 'active',
        OR: [{ generatedUntil: null }, { generatedUntil: { lt: windowEnd } }],
      },
    });

    let totalCreated = 0;
    for (const rec of activeRecurrences) {
      try {
        const from = rec.generatedUntil ?? rec.startDate;
        const result = await this.recurrenceService.materialiseRange(
          rec.id,
          from,
          windowEnd,
          false,
          'system',
        );
        totalCreated += result.created;
        if (result.skipped.length) {
          this.logger.warn(`Recurrence ${rec.id}: skipped ${result.skipped.length} conflict(s)`);
        }
      } catch (err: any) {
        this.logger.error(`Failed to materialise recurrence ${rec.id}: ${err.message}`);
      }
    }

    this.logger.log(`Recurrence materialisation complete: ${totalCreated} sessions created`);
  }

  /** Nightly: auto-mark no-show for past scheduled sessions */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async autoMarkNoShow() {
    const yesterday = new Date(Date.now() - 86400000);
    const result = await this.prisma.therapySession.updateMany({
      where: {
        status: 'scheduled',
        scheduledEnd: { lte: yesterday },
      },
      data: { status: 'no_show', noShowRecordedBy: 'system' },
    });

    if (result.count > 0) {
      this.logger.log(`Auto-marked ${result.count} session(s) as no-show`);
    }
  }

  /** Nightly: expire waiting list offers */
  @Cron(CronExpression.EVERY_HOUR)
  async expireWaitingListOffers() {
    const count = await this.waitingListService.expireOffers();
    if (count > 0) this.logger.log(`Expired ${count} waiting list offer(s)`);
  }

  /** Nightly: flag expiring licenses (within 60 days) */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async checkLicenseExpiry() {
    const soon = new Date(Date.now() + 60 * 86400000);
    const now = new Date();

    await this.prisma.therapistLicense.updateMany({
      where: {
        status: 'valid',
        expiryDate: { lte: soon, gte: now },
      },
      data: { status: 'expiring' },
    });

    await this.prisma.therapistLicense.updateMany({
      where: {
        status: { in: ['valid', 'expiring'] },
        expiryDate: { lt: now },
      },
      data: { status: 'expired' },
    });
  }
}
