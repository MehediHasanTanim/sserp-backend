import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  EmailProvider,
  EmailSendInput,
  EmailSendResult,
} from './email.provider.interface';

@Injectable()
export class NodemailerProvider implements EmailProvider {
  private readonly logger = new Logger(NodemailerProvider.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('smtp.host'),
      port: this.config.get<number>('smtp.port'),
      auth: this.config.get<string>('smtp.user')
        ? {
            user: this.config.get<string>('smtp.user'),
            pass: this.config.get<string>('smtp.pass'),
          }
        : undefined,
    });
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.config.get<string>('smtp.from') ?? 'noreply@sserp.local',
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      const rejected = info.rejected?.length ?? 0;
      if (rejected > 0) {
        return {
          accepted: false,
          bounced: true,
          errorCode: 'HARD_BOUNCE',
          errorMessage: `Rejected: ${info.rejected.join(', ')}`,
        };
      }
      return { accepted: true, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Email send failed: ${message}`);
      const bounced = /invalid|bounce|550|551|552|553|554|mailbox/i.test(
        message,
      );
      return {
        accepted: false,
        bounced,
        errorCode: bounced ? 'HARD_BOUNCE' : 'SEND_FAILED',
        errorMessage: message,
      };
    }
  }
}
