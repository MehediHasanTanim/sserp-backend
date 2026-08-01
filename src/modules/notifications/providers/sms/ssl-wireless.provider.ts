import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SmsProvider,
  SmsSendInput,
  SmsSendResult,
} from './sms.provider.interface';

@Injectable()
export class SslWirelessSmsProvider implements SmsProvider {
  private readonly logger = new Logger(SslWirelessSmsProvider.name);

  constructor(private readonly config: ConfigService) {}

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const apiUrl = this.config.get<string>('sms.apiUrl');
    const apiKey = this.config.get<string>('sms.apiKey');
    const senderId = this.config.get<string>('sms.senderId') ?? 'SSERP';

    if (!apiUrl || !apiKey) {
      return {
        accepted: false,
        errorCode: 'CONFIG_MISSING',
        errorMessage: 'SMS API not configured',
      };
    }

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          msisdn: input.to,
          sms: input.body,
          csms_id: senderId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        const msg = String(body.message ?? res.statusText);
        const invalid = /invalid|unknown|not found/i.test(msg);
        return {
          accepted: false,
          invalidNumber: invalid,
          errorCode: invalid ? 'INVALID_NUMBER' : 'SEND_FAILED',
          errorMessage: msg,
        };
      }
      return {
        accepted: true,
        messageId: String(body.message_id ?? body.csms_id ?? Date.now()),
        costUnits: 1,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SSL Wireless SMS failed: ${message}`);
      return {
        accepted: false,
        errorCode: 'SEND_FAILED',
        errorMessage: message,
      };
    }
  }

  async pollDelivery(
    messageId: string,
  ): Promise<'delivered' | 'failed' | 'pending'> {
    const apiUrl = this.config.get<string>('sms.apiUrl');
    if (!apiUrl) return 'pending';
    try {
      const res = await fetch(`${apiUrl}/status/${messageId}`, {
        headers: {
          Authorization: `Bearer ${this.config.get<string>('sms.apiKey')}`,
        },
      });
      if (!res.ok) return 'pending';
      const body = (await res.json()) as { status?: string };
      if (body.status === 'delivered') return 'delivered';
      if (body.status === 'failed') return 'failed';
      return 'pending';
    } catch {
      return 'pending';
    }
  }
}
