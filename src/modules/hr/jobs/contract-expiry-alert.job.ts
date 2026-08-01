import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';

@Injectable()
export class ContractExpiryAlertJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('15 7 * * *')
  async handle() {
    const in30 = new Date();
    in30.setUTCDate(in30.getUTCDate() + 30);
    const contracts = await this.prisma.employeeContract.findMany({
      where: {
        isCurrent: true,
        endDate: { lte: in30, gte: new Date() },
      },
    });
    for (const c of contracts) {
      await this.events.emitAsync(EventNames.EMPLOYEE_CONTRACT_EXPIRING, {
        employeeId: c.employeeId,
        contractId: c.id,
        endDate: c.endDate,
      });
    }
  }
}
