import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';

/**
 * Side-effects for HR payroll/gratuity postings (journals already posted in-tx via LedgerPort).
 */
@Injectable()
export class HrPostingListener {
  private readonly logger = new Logger(HrPostingListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(EventNames.PAYROLL_RUN_COMPLETED)
  async onPayrollCompleted(payload: {
    payrollRunId: string;
    journalId?: string;
  }) {
    try {
      const run = await this.prisma.payrollRun.findUnique({
        where: { id: payload.payrollRunId },
      });
      if (!run?.journalId) {
        this.logger.warn(
          `Payroll ${payload.payrollRunId} completed without journalId`,
        );
        return;
      }
      this.logger.log(
        `Verified payroll journal ${run.journalId} for run ${run.id}`,
      );
    } catch (e: any) {
      this.logger.warn(`HrPostingListener payroll: ${e.message}`);
    }
  }

  @OnEvent(EventNames.GRATUITY_PROVISION_MONTHLY)
  async onGratuityProvision(payload: {
    year: number;
    month: number;
    count: number;
  }) {
    this.logger.log(
      `Gratuity provision side-effect ${payload.year}-${payload.month}: ${payload.count} rows`,
    );
  }
}
