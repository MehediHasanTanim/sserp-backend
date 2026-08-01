import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { HrModule } from '../hr/hr.module';
import { SchoolModule } from '../school/school.module';
import { FieldEncryptionService } from './services/field-encryption.service';
import { RlsContextService } from './services/rls-context.service';
import { TwoFactorService } from './services/two-factor.service';
import { OfflineSyncService } from './services/offline-sync.service';
import { DataImportService } from './services/data-import.service';
import { AuditHashChainService } from './services/audit-hash-chain.service';
import { SystemHealthService } from './services/system-health.service';
import { MetricsService } from './services/metrics.service';
import { BiometricSyncService } from './services/biometric-sync.service';
import { PortalPaymentService } from './services/portal-payment.service';
import {
  IdleTimeoutService,
  IdleTimeoutGuard,
  SuperAdminIpAllowlistGuard,
} from './middleware/security.middleware';
import {
  OfflineSyncController,
  HardeningAdminController,
  TwoFactorController,
  HealthDetailController,
  MetricsController,
} from './controllers/hardening.controller';
import {
  BiometricAdapter,
  ConsoleBiometricAdapter,
  PaymentGatewayPort,
  SslCommerzStubGateway,
} from './providers/optional-integrations';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'sms' },
      { name: 'notifications' },
    ),
    forwardRef(() => HrModule),
    forwardRef(() => SchoolModule),
  ],
  controllers: [
    OfflineSyncController,
    HardeningAdminController,
    TwoFactorController,
    HealthDetailController,
    MetricsController,
  ],
  providers: [
    FieldEncryptionService,
    RlsContextService,
    TwoFactorService,
    OfflineSyncService,
    DataImportService,
    AuditHashChainService,
    SystemHealthService,
    MetricsService,
    IdleTimeoutService,
    IdleTimeoutGuard,
    SuperAdminIpAllowlistGuard,
    { provide: APP_GUARD, useClass: IdleTimeoutGuard },
    { provide: BiometricAdapter, useClass: ConsoleBiometricAdapter },
    ConsoleBiometricAdapter,
    { provide: PaymentGatewayPort, useClass: SslCommerzStubGateway },
    BiometricSyncService,
    PortalPaymentService,
  ],
  exports: [
    FieldEncryptionService,
    RlsContextService,
    TwoFactorService,
    OfflineSyncService,
    MetricsService,
    IdleTimeoutService,
    BiometricAdapter,
    PaymentGatewayPort,
    BiometricSyncService,
    PortalPaymentService,
  ],
})
export class HardeningModule {}
