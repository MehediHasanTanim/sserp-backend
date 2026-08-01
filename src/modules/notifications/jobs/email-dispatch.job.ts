import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Inject } from '@nestjs/common';
import { DeliveryLogService } from '../services/delivery-log.service';
import { EMAIL_PROVIDER } from '../constants';
import { EmailProvider } from '../providers/email/email.provider.interface';

const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

@Processor('email')
export class EmailDispatchJob extends WorkerHost {
  private readonly logger = new Logger(EmailDispatchJob.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly deliveryLog: DeliveryLogService,
  ) {
    super();
  }

  async process(
    job: Job<{
      deliveryId: string;
      to?: string;
      subject: string;
      body: string;
    }>,
  ) {
    const { deliveryId, to, subject, body } = job.data;
    if (!to) {
      await this.deliveryLog.markFailed(
        deliveryId,
        'NO_RECIPIENT',
        'Missing email',
      );
      return;
    }

    await this.deliveryLog.markSending(deliveryId);
    const result = await this.email.send({
      to,
      subject,
      html: body,
      text: body.replace(/<[^>]+>/g, ''),
    });

    if (result.accepted) {
      await this.deliveryLog.markSent(
        deliveryId,
        'nodemailer',
        result.messageId,
      );
      return;
    }

    if (result.bounced) {
      await this.deliveryLog.markBounced(deliveryId, to, 'email');
      return;
    }

    const attempt = job.attemptsMade;
    if (attempt < RETRY_DELAYS_MS.length) {
      throw new Error(result.errorMessage ?? 'Email send failed');
    }
    await this.deliveryLog.markFailed(
      deliveryId,
      result.errorCode ?? 'SEND_FAILED',
      result.errorMessage ?? 'Email send failed',
    );
  }
}
