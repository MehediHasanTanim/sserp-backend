import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';

@Injectable()
export class LoanRepaymentScheduleJob {
  private readonly logger = new Logger(LoanRepaymentScheduleJob.name);

  constructor(private readonly prisma: PrismaService) {}

  /** After typical pay day: flag overdue installments. */
  @Cron('0 10 5 * *')
  async handleOverdue() {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    const result = await this.prisma.loanRepayment.updateMany({
      where: {
        status: 'scheduled',
        OR: [
          { dueYear: { lt: year } },
          { dueYear: year, dueMonth: { lt: month } },
        ],
      },
      data: { status: 'overdue' },
    });
    this.logger.log(`Marked ${result.count} loan repayments overdue`);
  }
}

@Injectable()
export class BenefitPolicyExpiryAlertJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('0 8 * * 1')
  async handle() {
    const in30 = new Date();
    in30.setUTCDate(in30.getUTCDate() + 30);
    const plans = await this.prisma.benefitPlan.findMany({
      where: {
        isActive: true,
        policyExpiryDate: { lte: in30, gte: new Date() },
      },
    });
    for (const p of plans) {
      await this.events.emitAsync(EventNames.BENEFIT_POLICY_EXPIRING, {
        benefitPlanId: p.id,
        policyExpiryDate: p.policyExpiryDate,
      });
    }
  }
}
