import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';
import { GratuityProvisionService } from '../services/gratuity-provision.service';

@Injectable()
export class GratuityEligibilityCheckJob {
  constructor(
    private readonly provisions: GratuityProvisionService,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('0 7 * * *')
  async handle() {
    const policy = await this.prisma.gratuityPolicy.findFirst({
      where: { isActive: true },
    });
    if (!policy) return;

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: { in: ['active', 'on_probation'] },
      },
    });

    for (const emp of employees) {
      const before = await this.prisma.gratuityEntitlement.findUnique({
        where: { employeeId: emp.id },
      });
      const after = await this.provisions.recalculateEntitlement(emp.id);
      if (after.eligible && !before?.eligible) {
        await this.events.emitAsync(EventNames.GRATUITY_ELIGIBILITY_REACHED, {
          employeeId: emp.id,
          entitlementAmount: after.entitlementAmount,
        });
      }
    }
  }
}
