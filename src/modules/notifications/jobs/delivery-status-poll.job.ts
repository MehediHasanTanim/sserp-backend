import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SmsProviderFactory } from '../providers/sms/sms-provider.factory';
import { DeliveryLogService } from '../services/delivery-log.service';

@Injectable()
export class DeliveryStatusPollJob {
  private readonly logger = new Logger(DeliveryStatusPollJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsFactory: SmsProviderFactory,
    private readonly deliveryLog: DeliveryLogService,
  ) {}

  @Cron('*/10 * * * *')
  async pollSmsDelivery() {
    const pending = await this.prisma.notificationDelivery.findMany({
      where: {
        channel: 'sms',
        status: DeliveryStatus.sent,
        providerMessageId: { not: null },
      },
      take: 100,
    });
    const sms = this.smsFactory.create();
    if (!sms.pollDelivery) return;

    for (const delivery of pending) {
      const status = await sms.pollDelivery(delivery.providerMessageId!);
      if (status === 'delivered') {
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: DeliveryStatus.delivered, deliveredAt: new Date() },
        });
      } else if (status === 'failed') {
        await this.deliveryLog.markFailed(
          delivery.id,
          'DELIVERY_FAILED',
          'Provider reported failure',
        );
      }
    }
    if (pending.length) {
      this.logger.debug(`Polled ${pending.length} SMS delivery statuses`);
    }
  }
}
