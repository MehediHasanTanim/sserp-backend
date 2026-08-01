import { Global, Module, forwardRef } from '@nestjs/common';
import { LedgerPort } from './ledger.port';
import { NotificationPort } from './notification.port';
import { AccountsModule } from '../../modules/accounts/accounts.module';
import { AccountsLedgerAdapter } from '../../modules/accounts/adapters/accounts-ledger.adapter';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { MultiChannelNotificationAdapter } from '../../modules/notifications/adapters/multi-channel-notification.adapter';

/**
 * Cross-module ports. LedgerPort is bound to AccountsLedgerAdapter (Phase 4 cutover).
 * NotificationPort is bound to MultiChannelNotificationAdapter (Phase 8 cutover).
 */
@Global()
@Module({
  imports: [
    forwardRef(() => AccountsModule),
    forwardRef(() => NotificationsModule),
  ],
  providers: [
    {
      provide: LedgerPort,
      useExisting: AccountsLedgerAdapter,
    },
    {
      provide: NotificationPort,
      useExisting: MultiChannelNotificationAdapter,
    },
  ],
  exports: [LedgerPort, NotificationPort],
})
export class PortsModule {}
