import { Global, Module } from '@nestjs/common';
import { LedgerPort } from './ledger.port';
import { OutboxLedgerAdapter } from './outbox-ledger.adapter';
import { NotificationPort } from './notification.port';
import { InAppOnlyNotificationAdapter } from './in-app-notification.adapter';

/**
 * Makes the cross-module ports (`LedgerPort`, `NotificationPort`) available
 * to every feature module without each one re-declaring the adapters.
 * Swap the `useClass` bindings here when a real ledger/notification
 * integration replaces the Phase 0 stubs.
 */
@Global()
@Module({
  providers: [
    { provide: LedgerPort, useClass: OutboxLedgerAdapter },
    { provide: NotificationPort, useClass: InAppOnlyNotificationAdapter },
  ],
  exports: [LedgerPort, NotificationPort],
})
export class PortsModule {}
