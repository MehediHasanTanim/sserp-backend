import { Injectable, Logger } from '@nestjs/common';
import {
  SmsProvider,
  SmsSendInput,
  SmsSendResult,
} from './sms.provider.interface';

@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    this.logger.log(
      `[SMS console] to=${input.to} body=${input.body.slice(0, 80)}`,
    );
    return {
      accepted: true,
      messageId: `console-${Date.now()}`,
      costUnits: 1,
    };
  }

  async pollDelivery(): Promise<'delivered'> {
    return 'delivered';
  }
}
