import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';

@Injectable()
export class ApprovalEscalationJob {
  private readonly logger = new Logger(ApprovalEscalationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('0 * * * *')
  async escalateOverdueSteps() {
    const steps = await this.prisma.approvalChainStep.findMany({
      where: {
        escalationAfterHours: { not: null },
        escalateToRole: { not: null },
      },
      include: { chain: true },
    });

    for (const step of steps) {
      if (!step.escalationAfterHours || !step.escalateToRole) continue;
      await this.events.emitAsync(EventNames.APPROVAL_ESCALATED, {
        workflowCode: step.chain.workflowCode,
        stepLevel: step.level,
        escalateToRole: step.escalateToRole,
        escalatedAt: new Date().toISOString(),
      });
    }
    this.logger.debug(`Escalation scan: ${steps.length} configured step(s)`);
  }
}
