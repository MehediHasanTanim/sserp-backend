import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DeliveryLogService } from '../services/delivery-log.service';
import { SmsProviderFactory } from '../providers/sms/sms-provider.factory';
import { NotificationChannel } from '@prisma/client';

const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

@Processor('sms')
export class SmsDispatchJob extends WorkerHost {
  private readonly logger = new Logger(SmsDispatchJob.name);

  constructor(
    private readonly smsFactory: SmsProviderFactory,
    private readonly deliveryLog: DeliveryLogService,
  ) {
    super();
  }

  async process(
    job: Job<{
      deliveryId: string;
      to?: string;
      body: string;
    }>,
  ) {
    const { deliveryId, to, body } = job.data;
    if (!to) {
      await this.deliveryLog.markFailed(
        deliveryId,
        'NO_RECIPIENT',
        'Missing phone',
      );
      return;
    }

    await this.deliveryLog.markSending(deliveryId);
    const sms = this.smsFactory.create();
    const result = await sms.send({ to, body });

    if (result.accepted) {
      await this.deliveryLog.markSent(
        deliveryId,
        'sms',
        result.messageId,
        result.costUnits,
      );
      return;
    }

    if (result.invalidNumber) {
      await this.deliveryLog.markBounced(
        deliveryId,
        to,
        NotificationChannel.sms,
      );
      return;
    }

    const attempt = job.attemptsMade;
    if (attempt < RETRY_DELAYS_MS.length) {
      throw new Error(result.errorMessage ?? 'SMS send failed');
    }
    await this.deliveryLog.markFailed(
      deliveryId,
      result.errorCode ?? 'SEND_FAILED',
      result.errorMessage ?? 'SMS send failed',
    );
  }
}
