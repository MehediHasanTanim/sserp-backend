import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AssetService } from '../services/asset.service';

@Injectable()
export class MonthlyDepreciationJob {
  private readonly logger = new Logger(MonthlyDepreciationJob.name);

  constructor(private readonly assets: AssetService) {}

  /** Last day of month ~23:30 UTC */
  @Cron('30 23 28-31 * *')
  async handle() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    if (tomorrow.getUTCMonth() === now.getUTCMonth()) return;

    this.logger.log('Running monthly asset depreciation');
    await this.assets.runDepreciation(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
  }
}
