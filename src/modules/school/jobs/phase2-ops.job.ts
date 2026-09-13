import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { FeeInvoiceService } from '../services/fee-invoice.service';
import { FeeReminderService } from '../services/fee-reminder.service';
import { IepReviewService } from '../services/iep-review.service';
import { ActivityService } from '../services/activity.service';

/**
 * Phase 2 school advanced cron jobs.
 * docs/plan/backend/03-phase2-school-advanced.md §8.
 */
@Injectable()
export class Phase2OpsJobs {
  private readonly logger = new Logger(Phase2OpsJobs.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: FeeInvoiceService,
    private readonly feeReminders: FeeReminderService,
    private readonly iepReviews: IepReviewService,
    private readonly activities: ActivityService,
  ) {}

  /** monthly-invoice-generation — 1st of month 02:00 */
  @Cron('0 2 1 * *')
  async monthlyInvoiceGeneration() {
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const actor =
      (await this.prisma.user.findFirst({
        where: { username: 'superadmin', deletedAt: null },
      })) ??
      (await this.prisma.user.findFirst({
        where: { isActive: true, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }));
    if (!actor) {
      this.logger.warn('monthly-invoice-generation skipped: no system user');
      return;
    }
    const result = await this.invoices.generateMonthly({ period }, actor.id);
    this.logger.log(
      `monthly-invoice-generation period=${period} generated=${result.generated ?? 'n/a'}`,
    );
  }

  /** fee-reminder — daily 09:00 */
  @Cron('0 9 * * *')
  async feeReminder() {
    const result = await this.feeReminders.sendReminders();
    this.logger.log(
      `fee-reminder sent=${result.remindersSent} checked=${result.invoicesChecked}`,
    );
  }

  /** iep-review-reminder — daily 07:00 */
  @Cron('0 7 * * *')
  async iepReviewReminder() {
    const result = await this.iepReviews.sendDueReminders();
    this.logger.log(
      `iep-review-reminder alerts=${result.alertsSent} missed=${result.markedMissed}`,
    );
  }

  /** activity-optin-deadline — hourly */
  @Cron('0 * * * *')
  async activityOptinDeadline() {
    const result = await this.activities.closeExpiredOptIns();
    this.logger.log(
      `activity-optin-deadline closed=${result.closed} pendingDeclined=${result.pendingDeclined}`,
    );
  }

  /** activity-fee-reminder — daily 09:30 */
  @Cron('30 9 * * *')
  async activityFeeReminder() {
    const result = await this.activities.sendUnpaidFeeReminders();
    this.logger.log(`activity-fee-reminder sent=${result.remindersSent}`);
  }
}
