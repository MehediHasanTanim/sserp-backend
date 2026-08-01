import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InventoryAuditService } from '../services/inventory-audit.service';

@Injectable()
export class AuditScheduleJob {
  private readonly logger = new Logger(AuditScheduleJob.name);

  constructor(private readonly audits: InventoryAuditService) {}

  /** Yearly on 1 January — schedule H1 and H2 audits (IA-01). */
  @Cron('0 8 1 1 *')
  async handle() {
    const year = new Date().getUTCFullYear();
    this.logger.log(`Scheduling half-yearly inventory audits for ${year}`);
    await this.audits.ensureHalfYearlyAudit('H1', year);
    await this.audits.ensureHalfYearlyAudit('H2', year);
  }
}
