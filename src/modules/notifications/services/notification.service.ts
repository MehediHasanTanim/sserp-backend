import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DigestMode,
  Notification,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { ChannelRouterService } from './channel-router.service';
import { TemplateRendererService } from './template-renderer.service';
import { DeliveryLogService } from './delivery-log.service';
import { DigestService } from './digest.service';
import {
  LEGACY_TYPE_MAP,
  NotificationChannel as Channel,
  ORG_SETTINGS_ID,
  REALTIME_GATEWAY,
} from '../constants';

export interface CreateAndDispatchInput {
  userId: string;
  typeCode: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
  groupKey?: string;
  variables?: Record<string, unknown>;
  channelsOverride?: Channel[];
}

export interface RealtimeGatewayPort {
  emitNotificationNew(userId: string, notification: unknown): void;
  emitNotificationCount(userId: string, count: unknown): void;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelRouter: ChannelRouterService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly deliveryLog: DeliveryLogService,
    private readonly digestService: DigestService,
    private readonly events: EventEmitter2,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @InjectQueue('sms') private readonly smsQueue: Queue,
    @Optional()
    @Inject(REALTIME_GATEWAY)
    private readonly realtime?: RealtimeGatewayPort,
  ) {}

  resolveTypeCode(type: string): string {
    return LEGACY_TYPE_MAP[type] ?? type;
  }

  async list(
    userId: string,
    opts?: {
      unreadOnly?: boolean;
      type?: string;
      priority?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const where: Prisma.NotificationWhereInput = {
      userId,
      archivedAt: null,
      ...(opts?.unreadOnly ? { readAt: null } : {}),
      ...(opts?.type ? { notificationTypeCode: opts.type } : {}),
      ...(opts?.priority
        ? { priority: opts.priority as Notification['priority'] }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, page, pageSize, total };
  }

  async unreadCount(userId: string) {
    const rows = await this.prisma.notification.groupBy({
      by: ['priority'],
      where: { userId, readAt: null, archivedAt: null },
      _count: { _all: true },
    });
    const byPriority: Record<string, number> = {};
    let count = 0;
    for (const row of rows) {
      byPriority[row.priority] = row._count._all;
      count += row._count._all;
    }
    return { count, unread: count, byPriority };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!n) throw DomainException.notFound('Notification not found');
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    await this.pushCountUpdate(userId);
    return updated;
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    await this.pushCountUpdate(userId);
    return { ok: true };
  }

  async archive(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!n) throw DomainException.notFound('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async createAndDispatch(
    input: CreateAndDispatchInput,
  ): Promise<{ notification: Notification | null; skipped?: string }> {
    const typeCode = this.resolveTypeCode(input.typeCode);

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user || !user.isActive || user.deletedAt) {
      this.logger.debug(
        `Skipping notification for inactive user ${input.userId}`,
      );
      return { notification: null, skipped: 'inactive_user' };
    }

    const type = await this.prisma.notificationType.findUnique({
      where: { code: typeCode },
    });
    if (type && !type.isActive) {
      this.logger.debug(`Skipping inactive notification type ${typeCode}`);
      return { notification: null, skipped: 'inactive_type' };
    }

    const org = await this.prisma.organizationSettings.findUniqueOrThrow({
      where: { id: ORG_SETTINGS_ID },
    });
    const dedupWindowSec = org.notificationDedupWindowSeconds ?? 300;
    if (input.groupKey) {
      const since = new Date(Date.now() - dedupWindowSec * 1000);
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: input.userId,
          notificationTypeCode: typeCode,
          groupKey: input.groupKey,
          createdAt: { gte: since },
        },
      });
      if (existing) {
        this.logger.debug(`Deduped notification ${typeCode}/${input.groupKey}`);
        return { notification: existing, skipped: 'deduped' };
      }
    }

    const preference = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_notificationTypeCode: {
          userId: input.userId,
          notificationTypeCode: typeCode,
        },
      },
    });

    const suppressedRows = await this.prisma.suppressionList.findMany();
    const suppressedAddresses = new Set(
      suppressedRows.map((s) => `${s.channel}:${s.address.toLowerCase()}`),
    );

    const route = this.channelRouter.route({
      type:
        type ??
        ({
          code: typeCode,
          defaultChannels: input.channelsOverride ?? ['in_app'],
          allowedChannels: input.channelsOverride ?? ['in_app', 'email', 'sms'],
          priority: 'normal',
          supportsDigest: false,
        } as never),
      preference,
      orgSettings: org,
      suppressedAddresses,
      userEmail: user.email,
      userPhone: null,
    });

    let channels = input.channelsOverride ?? route.channels;
    if (!channels.length && route.suppressed.length) {
      channels = ['in_app'];
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: typeCode,
        notificationTypeCode: typeCode,
        priority: type?.priority ?? 'normal',
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        actionUrl: input.actionUrl,
        data: input.data as Prisma.InputJsonValue,
        groupKey: input.groupKey,
        channelsRequested: channels,
      },
    });

    await this.events.emitAsync(EventNames.NOTIFICATION_CREATED, {
      notificationId: notification.id,
      userId: input.userId,
      typeCode,
    });

    if (route.queueDigest && type?.supportsDigest) {
      await this.digestService.enqueue(
        input.userId,
        notification.id,
        preference?.digestMode ?? DigestMode.daily,
      );
    }

    for (const suppressed of route.suppressed) {
      await this.deliveryLog.recordSuppressed(
        notification.id,
        this.channelRouter.toPrismaChannel(suppressed.channel),
        suppressed.address,
      );
    }

    const variables = {
      title: input.title,
      body: input.body,
      ...(input.variables ?? {}),
    };

    for (const ch of channels) {
      if (ch === 'in_app') {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            deliveredVia: { push: 'in_app' },
          },
        });
        continue;
      }

      const template = await this.prisma.notificationTemplate.findFirst({
        where: {
          notificationTypeCode: typeCode,
          channel: ch as NotificationChannel,
          locale: 'en',
          isActive: true,
        },
      });

      let renderedSubject = input.title;
      let renderedBody = input.body;
      if (template) {
        const declared = Array.isArray(template.variables)
          ? (template.variables as string[])
          : ['title', 'body'];
        const rendered = this.templateRenderer.render({
          template: template.body,
          subject: template.subject,
          variables,
          declaredVariables: declared,
          channel: ch,
        });
        renderedBody = rendered.body;
        renderedSubject = rendered.subject ?? input.title;
      }

      const delivery = await this.deliveryLog.createQueued(
        notification.id,
        this.channelRouter.toPrismaChannel(ch),
        ch === 'email' ? user.email : null,
        renderedBody,
      );

      const jobData = {
        deliveryId: delivery.id,
        notificationId: notification.id,
        userId: input.userId,
        to: ch === 'email' ? user.email : undefined,
        subject: renderedSubject,
        body: renderedBody,
        deferredUntil: route.deferredUntil?.toISOString(),
      };

      if (route.deferredUntil) {
        const delay = route.deferredUntil.getTime() - Date.now();
        if (ch === 'email') {
          await this.emailQueue.add('send', jobData, {
            delay: Math.max(delay, 0),
          });
        } else {
          await this.smsQueue.add('send', jobData, {
            delay: Math.max(delay, 0),
          });
        }
      } else if (ch === 'email') {
        await this.emailQueue.add('send', jobData);
      } else if (ch === 'sms') {
        await this.smsQueue.add('send', jobData);
      }
    }

    this.realtime?.emitNotificationNew(input.userId, notification);
    await this.pushCountUpdate(input.userId);

    return { notification };
  }

  private async pushCountUpdate(userId: string) {
    const counts = await this.unreadCount(userId);
    this.realtime?.emitNotificationCount(userId, counts);
  }
}
