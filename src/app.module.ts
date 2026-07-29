import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { WinstonModule } from 'nest-winston';
import configuration from './config/configuration';
import { validateEnv } from './config/validation.schema';
import { createWinstonConfig } from './shared/logger/winston.config';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/cache/redis.module';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { EnvelopeInterceptor } from './shared/interceptors/envelope.interceptor';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './shared/interceptors/timeout.interceptor';
import { AuditInterceptor } from './shared/interceptors/audit.interceptor';
import { IdempotencyInterceptor } from './shared/interceptors/idempotency.interceptor';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { RolesGuard } from './shared/guards/roles.guard';
import { PermissionsGuard } from './shared/guards/permissions.guard';
import { PortsModule } from './shared/ports/ports.module';
import { OrgClockModule } from './shared/datetime/org-clock.module';
import { TransactionalEventPublisher } from './shared/events/transactional-event-publisher';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { HrModule } from './modules/hr/hr.module';
import { SchoolModule } from './modules/school/school.module';
import { PortalModule } from './modules/portal/portal.module';
import { TherapyModule } from './modules/therapy/therapy.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    WinstonModule.forRoot(createWinstonConfig(process.env.LOG_LEVEL ?? 'info')),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL,
      },
    }),
    BullModule.registerQueue(
      { name: 'maintenance' },
      { name: 'pdf' },
      { name: 'billing' },
      { name: 'therapy-ops' },
    ),
    PrismaModule,
    RedisModule,
    PortsModule,
    OrgClockModule,
    AuthModule,
    AdminModule,
    HrModule,
    SchoolModule,
    PortalModule,
    TherapyModule,
    FilesModule,
    NotificationsModule,
    HealthModule,
    MaintenanceModule,
  ],
  providers: [
    TransactionalEventPublisher,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
