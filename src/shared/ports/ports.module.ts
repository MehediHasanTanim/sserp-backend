import { Global, Module, forwardRef } from '@nestjs/common';
import { LedgerPort } from './ledger.port';
import { NotificationPort } from './notification.port';
import { InAppOnlyNotificationAdapter } from './in-app-notification.adapter';
import { AccountsModule } from '../../modules/accounts/accounts.module';
import { AccountsLedgerAdapter } from '../../modules/accounts/adapters/accounts-ledger.adapter';

/**
 * Cross-module ports. LedgerPort is bound to AccountsLedgerAdapter (Phase 4 cutover).
 * Outbox remains for audit/replay of historical pending_ledger_postings.
 */
@Global()
@Module({
  imports: [forwardRef(() => AccountsModule)],
  providers: [
    {
      provide: LedgerPort,
      useExisting: AccountsLedgerAdapter,
    },
    { provide: NotificationPort, useClass: InAppOnlyNotificationAdapter },
  ],
  exports: [LedgerPort, NotificationPort],
})
export class PortsModule {}
