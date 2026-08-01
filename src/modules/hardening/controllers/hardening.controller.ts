import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Headers,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { OfflineSyncEntityType } from '@prisma/client';
import {
  CurrentUser,
  AuthUser,
  Roles,
  Public,
} from '../../../shared/decorators';
import { OfflineSyncService } from '../services/offline-sync.service';
import { DataImportService } from '../services/data-import.service';
import { TwoFactorService } from '../services/two-factor.service';
import { SystemHealthService } from '../services/system-health.service';
import { FieldEncryptionService } from '../services/field-encryption.service';
import { AuditHashChainService } from '../services/audit-hash-chain.service';
import { MetricsService } from '../services/metrics.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { PaymentGatewayPort } from '../providers/optional-integrations';
import { BiometricSyncService } from '../services/biometric-sync.service';
import { PortalPaymentService } from '../services/portal-payment.service';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../../shared/errors/domain-exception';

class OfflineBatchDto {
  @IsString()
  clientBatchId!: string;

  @IsString()
  clientTimestamp!: string;

  @IsArray()
  operations!: Array<{
    clientOpId: string;
    clientTimestamp: string;
    payload: Record<string, unknown>;
  }>;
}

class ImportDryRunDto {
  @IsString()
  entity!: string;

  @IsArray()
  rows!: Array<Record<string, unknown>>;
}

class OpeningBalanceDto {
  @IsArray()
  lines!: Array<{ accountCode: string; debit: number; credit: number }>;
}

class TotpDto {
  @IsString()
  token!: string;
}

@ApiTags('hardening')
@ApiBearerAuth()
@Controller()
export class OfflineSyncController {
  constructor(private readonly offline: OfflineSyncService) {}

  @Post('school/attendance/offline-batch')
  @Roles('teacher', 'coordinator', 'super_admin')
  attendance(@CurrentUser() user: AuthUser, @Body() body: OfflineBatchDto) {
    return this.offline.submitBatch({
      userId: user.id,
      clientBatchId: body.clientBatchId,
      entityType: OfflineSyncEntityType.student_attendance,
      clientTimestamp: new Date(body.clientTimestamp),
      operations: body.operations,
    });
  }

  @Post('therapy/sessions/offline-batch')
  @Roles('therapist', 'coordinator', 'super_admin')
  sessions(@CurrentUser() user: AuthUser, @Body() body: OfflineBatchDto) {
    return this.offline.submitBatch({
      userId: user.id,
      clientBatchId: body.clientBatchId,
      entityType: OfflineSyncEntityType.session_note,
      clientTimestamp: new Date(body.clientTimestamp),
      operations: body.operations,
    });
  }

  @Post('therapy/groups/offline-batch')
  @Roles('therapist', 'coordinator', 'super_admin')
  groups(@CurrentUser() user: AuthUser, @Body() body: OfflineBatchDto) {
    return this.offline.submitBatch({
      userId: user.id,
      clientBatchId: body.clientBatchId,
      entityType: OfflineSyncEntityType.group_attendance,
      clientTimestamp: new Date(body.clientTimestamp),
      operations: body.operations,
    });
  }
}

@ApiTags('admin-hardening')
@ApiBearerAuth()
@Controller('admin')
export class HardeningAdminController {
  constructor(
    private readonly imports: DataImportService,
    private readonly health: SystemHealthService,
    private readonly encryption: FieldEncryptionService,
    private readonly auditChain: AuditHashChainService,
    private readonly biometricSync: BiometricSyncService,
    private readonly payments: PaymentGatewayPort,
    private readonly portalPayments: PortalPaymentService,
    private readonly config: ConfigService,
  ) {}

  @Get('backups')
  @Roles('super_admin')
  listBackups() {
    return this.health.listBackups();
  }

  @Post('backups/trigger')
  @Roles('super_admin')
  triggerBackup() {
    return this.health.triggerBackup();
  }

  @Post('data-import/runs')
  @Roles('super_admin')
  startRun(
    @CurrentUser() user: AuthUser,
    @Body() body: { migrationName: string; sourceDescription?: string },
  ) {
    return this.imports.startRun(
      body.migrationName,
      user.id,
      body.sourceDescription,
    );
  }

  @Post('data-import/runs/:id/dry-run')
  @Roles('super_admin')
  dryRun(@Param('id') id: string, @Body() body: ImportDryRunDto) {
    return this.imports.dryRun(id, body.entity, body.rows);
  }

  @Post('data-import/runs/:id/commit')
  @Roles('super_admin')
  commit(@Param('id') id: string, @Body() body: ImportDryRunDto) {
    return this.imports.commitGeneric(id, body.entity, body.rows);
  }

  @Post('data-import/runs/:id/opening-balances')
  @Roles('super_admin', 'accountant')
  openingBalances(@Param('id') id: string, @Body() body: OpeningBalanceDto) {
    return this.imports.commitOpeningBalances(id, body.lines);
  }

  @Get('data-import/runs')
  @Roles('super_admin')
  listRuns() {
    return this.imports.listRuns();
  }

  @Post('encryption/rotate/:purpose')
  @Roles('super_admin')
  rotate(@Param('purpose') purpose: 'medical' | 'financial') {
    return this.encryption.rotatePurpose(purpose);
  }

  @Get('audit-chain/verify')
  @Roles('super_admin')
  verifyChain() {
    return this.auditChain.verify();
  }

  @Post('biometric/poll')
  @Roles('super_admin', 'hr_officer')
  pollBiometric() {
    if (!this.config.get('featureBiometric')) {
      throw DomainException.forbidden('Biometric feature disabled');
    }
    return this.biometricSync.pollAndApply();
  }

  @Post('payments/intent')
  @Roles('super_admin', 'accountant', 'parent')
  createPaymentIntent(
    @Body()
    body: {
      amount: number;
      currency?: string;
      reference: string;
      returnUrl: string;
    },
  ) {
    if (!this.config.get('featurePaymentGateway')) {
      throw DomainException.forbidden('Payment gateway feature disabled');
    }
    return this.payments.createIntent({
      amount: body.amount,
      currency: body.currency ?? 'BDT',
      reference: body.reference,
      returnUrl: body.returnUrl,
    });
  }

  @Public()
  @Post('payments/webhook')
  async paymentWebhook(
    @Headers() headers: Record<string, string>,
    @Body() body: unknown,
  ) {
    return this.portalPayments.settleWebhook(headers, body);
  }
}

@ApiTags('auth-2fa')
@ApiBearerAuth()
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Post('enrol')
  enrol(@CurrentUser() user: AuthUser) {
    return this.twoFactor.enrol(user.id);
  }

  @Post('verify')
  verify(@CurrentUser() user: AuthUser, @Body() body: TotpDto) {
    return this.twoFactor.verifyAndEnable(user.id, body.token);
  }
}

@ApiTags('health')
@Controller('health')
export class HealthDetailController {
  constructor(
    private readonly systemHealth: SystemHealthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('detail')
  @Roles('super_admin')
  @ApiBearerAuth()
  async detail() {
    const queueOk = await this.systemHealth.queueHealthy();
    await this.prisma.$queryRaw`SELECT 1 AS ok`;
    return {
      postgres: 'up',
      queues: queueOk ? 'up' : 'down',
      capturedAt: new Date().toISOString(),
    };
  }
}

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  scrape() {
    return this.metrics.metricsText();
  }
}
