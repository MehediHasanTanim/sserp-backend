import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { NotificationPort } from '../../shared/ports/notification.port';
import { MultiChannelNotificationAdapter } from './adapters/multi-channel-notification.adapter';
import { NotificationsController } from './controllers/notification.controller';
import { NotificationAdminController } from './controllers/notification-admin.controller';
import {
  DeliveryLogController,
  SuppressionListController,
} from './controllers/delivery-log.controller';
import { MessageController } from './controllers/message.controller';
import { AnnouncementController } from './controllers/announcement.controller';
import { NoticeBoardController } from './controllers/notice-board.controller';
import {
  ApprovalChainController,
  ReminderScheduleController,
} from './controllers/workflow.controller';
import { NotificationsService } from './services/notification.service';
import { ChannelRouterService } from './services/channel-router.service';
import { TemplateRendererService } from './services/template-renderer.service';
import { RecipientResolverService } from './services/recipient-resolver.service';
import { DeliveryLogService } from './services/delivery-log.service';
import { DigestService } from './services/digest.service';
import { MessageService } from './services/message.service';
import { AnnouncementService } from './services/announcement.service';
import { NoticeBoardService } from './services/notice-board.service';
import { ApprovalChainService } from './services/approval-chain.service';
import { ReminderScheduleService } from './services/reminder-schedule.service';
import { DomainEventListener } from './listeners/domain-event.listener';
import { NodemailerProvider } from './providers/email/nodemailer.provider';
import { ConsoleSmsProvider } from './providers/sms/console.provider';
import { SslWirelessSmsProvider } from './providers/sms/ssl-wireless.provider';
import { SmsProviderFactory } from './providers/sms/sms-provider.factory';
import { EmailDispatchJob } from './jobs/email-dispatch.job';
import { SmsDispatchJob } from './jobs/sms-dispatch.job';
import { DigestDispatchJob } from './jobs/digest-dispatch.job';
import { DeliveryStatusPollJob } from './jobs/delivery-status-poll.job';
import { NotificationCleanupJob } from './jobs/notification-cleanup.job';
import { ReminderDispatchJob } from './jobs/reminder-dispatch.job';
import { ApprovalEscalationJob } from './jobs/approval-escalation.job';
import { SocketSessionPruneJob } from './jobs/socket-session-prune.job';
import {
  RealtimeGateway,
  RealtimeGatewayProvider,
} from './gateway/realtime.gateway';
import { WsJwtGuard } from './gateway/ws-jwt.guard';
import { RoomResolverService } from './gateway/room-resolver.service';
import { PresenceService } from './gateway/presence.service';
import { EMAIL_PROVIDER } from './constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'sms' },
      { name: 'notifications' },
    ),
    JwtModule.register({}),
    AuthModule,
  ],
  controllers: [
    NotificationsController,
    NotificationAdminController,
    DeliveryLogController,
    SuppressionListController,
    MessageController,
    AnnouncementController,
    NoticeBoardController,
    ApprovalChainController,
    ReminderScheduleController,
  ],
  providers: [
    NotificationsService,
    ChannelRouterService,
    TemplateRendererService,
    RecipientResolverService,
    DeliveryLogService,
    DigestService,
    MessageService,
    AnnouncementService,
    NoticeBoardService,
    ApprovalChainService,
    ReminderScheduleService,
    DomainEventListener,
    MultiChannelNotificationAdapter,
    { provide: NotificationPort, useExisting: MultiChannelNotificationAdapter },
    { provide: EMAIL_PROVIDER, useClass: NodemailerProvider },
    NodemailerProvider,
    ConsoleSmsProvider,
    SslWirelessSmsProvider,
    SmsProviderFactory,
    EmailDispatchJob,
    SmsDispatchJob,
    DigestDispatchJob,
    DeliveryStatusPollJob,
    NotificationCleanupJob,
    ReminderDispatchJob,
    ApprovalEscalationJob,
    SocketSessionPruneJob,
    RealtimeGateway,
    RealtimeGatewayProvider,
    WsJwtGuard,
    RoomResolverService,
    PresenceService,
  ],
  exports: [
    NotificationsService,
    MultiChannelNotificationAdapter,
    NotificationPort,
    ApprovalChainService,
    RealtimeGateway,
  ],
})
export class NotificationsModule {}
