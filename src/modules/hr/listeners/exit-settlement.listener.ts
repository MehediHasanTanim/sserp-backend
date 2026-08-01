import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventNames } from '../../../shared/events/event-names';
import { EncashmentService } from '../services/encashment.service';
import { GratuityProvisionService } from '../services/gratuity-provision.service';

@Injectable()
export class ExitSettlementListener {
  private readonly logger = new Logger(ExitSettlementListener.name);

  constructor(
    private readonly encashment: EncashmentService,
    private readonly provisions: GratuityProvisionService,
  ) {}

  @OnEvent(EventNames.EMPLOYEE_EXIT_INITIATED)
  async handle(payload: {
    employeeId: string;
    lastWorkingDay: string;
    actorId: string;
  }) {
    this.logger.log(`Exit settlement draft for ${payload.employeeId}`);
    const year = new Date(payload.lastWorkingDay).getUTCFullYear();
    const eligibility = await this.encashment.eligibility(
      payload.employeeId,
      year,
    );
    for (const row of eligibility) {
      if (row.eligibleDays <= 0) continue;
      await this.encashment.request({
        employeeId: payload.employeeId,
        leaveTypeId: row.leaveTypeId,
        year,
        requestedDays: row.eligibleDays,
        trigger: 'exit_automatic',
      });
    }
    await this.provisions.recalculateEntitlement(payload.employeeId);
  }
}
