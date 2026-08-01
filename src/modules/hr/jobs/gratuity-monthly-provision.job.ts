import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GratuityProvisionService } from '../services/gratuity-provision.service';

@Injectable()
export class GratuityMonthlyProvisionJob {
  private readonly logger = new Logger(GratuityMonthlyProvisionJob.name);

  constructor(private readonly provisions: GratuityProvisionService) {}

  /** Last day of month ~23:00 — fires on 28–31 and only runs when tomorrow is a new month. */
  @Cron('0 23 28-31 * *')
  async handle() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    if (tomorrow.getUTCMonth() !== now.getUTCMonth()) {
      this.logger.log('Running monthly gratuity provision');
      await this.provisions.runMonthly(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
      );
    }
  }
}
