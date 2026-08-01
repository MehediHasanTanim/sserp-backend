import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider } from './sms.provider.interface';
import { ConsoleSmsProvider } from './console.provider';
import { SslWirelessSmsProvider } from './ssl-wireless.provider';

@Injectable()
export class SmsProviderFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly consoleProvider: ConsoleSmsProvider,
    private readonly sslProvider: SslWirelessSmsProvider,
  ) {}

  create(): SmsProvider {
    const provider = this.config.get<string>('sms.provider') ?? 'console';
    if (provider === 'ssl_wireless') return this.sslProvider;
    return this.consoleProvider;
  }
}
