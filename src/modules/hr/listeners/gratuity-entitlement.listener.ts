import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventNames } from '../../../shared/events/event-names';
import { GratuityProvisionService } from '../services/gratuity-provision.service';

@Injectable()
export class GratuityEntitlementListener {
  constructor(private readonly provisions: GratuityProvisionService) {}

  @OnEvent(EventNames.SALARY_STRUCTURE_APPROVED)
  async handle(payload: { employeeId: string }) {
    await this.provisions.recalculateEntitlement(payload.employeeId);
  }
}
