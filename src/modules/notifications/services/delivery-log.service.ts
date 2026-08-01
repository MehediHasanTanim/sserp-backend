import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DeliveryStatus,
  NotificationChannel,
  SuppressionReason,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';

@Injectable()
export class DeliveryLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  hashAddress(address: string): string {
    const visible = address.slice(-4);
    const hash = createHash('sha256').update(address).digest('hex').slice(0, 8);
    return `***${visible}#${hash}`;
  }

  async createQueued(
    notificationId: string,
    channel: NotificationChannel,
    address: string | null | undefined,
    contentSnapshot: string,
  ) {
    return this.prisma.notificationDelivery.create({
      data: {
        notificationId,
        channel,
        recipientAddress: address ? this.hashAddress(address) : null,
        status: DeliveryStatus.queued,
        contentSnapshot,
      },
    });
  }

  async recordSuppressed(
    notificationId: string,
    channel: NotificationChannel,
    address: string,
  ) {
    return this.prisma.notificationDelivery.create({
      data: {
        notificationId,
        channel,
        recipientAddress: this.hashAddress(address),
        status: DeliveryStatus.suppressed,
        contentSnapshot: '',
      },
    });
  }

  async markSending(deliveryId: string) {
    return this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: DeliveryStatus.sending,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
  }

  async markSent(
    deliveryId: string,
    provider: string,
    providerMessageId?: string,
    costUnits?: number,
  ) {
    const delivery = await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: DeliveryStatus.sent,
        provider,
        providerMessageId,
        costUnits,
        deliveredAt: new Date(),
      },
    });
    await this.events.emitAsync(EventNames.NOTIFICATION_DELIVERED, {
      deliveryId,
      notificationId: delivery.notificationId,
      channel: delivery.channel,
    });
    return delivery;
  }

  async markFailed(
    deliveryId: string,
    errorCode: string,
    errorMessage: string,
  ) {
    const delivery = await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: DeliveryStatus.failed,
        errorCode,
        errorMessage,
      },
    });
    await this.events.emitAsync(EventNames.NOTIFICATION_FAILED, {
      deliveryId,
      notificationId: delivery.notificationId,
      errorCode,
    });
    return delivery;
  }

  async markBounced(
    deliveryId: string,
    address: string,
    channel: NotificationChannel,
  ) {
    const delivery = await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: DeliveryStatus.bounced,
        errorCode: 'HARD_BOUNCE',
      },
    });
    await this.prisma.suppressionList.upsert({
      where: { channel_address: { channel, address: address.toLowerCase() } },
      create: {
        channel,
        address: address.toLowerCase(),
        reason: SuppressionReason.hard_bounce,
      },
      update: { reason: SuppressionReason.hard_bounce },
    });
    await this.events.emitAsync(EventNames.NOTIFICATION_BOUNCED, {
      deliveryId,
      notificationId: delivery.notificationId,
      address,
    });
    return delivery;
  }

  async list(filters: {
    channel?: NotificationChannel;
    status?: DeliveryStatus;
    typeCode?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const where = {
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(filters.typeCode
        ? { notification: { notificationTypeCode: filters.typeCode } }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notificationDelivery.count({ where }),
      this.prisma.notificationDelivery.findMany({
        where,
        include: { notification: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async stats(from?: Date, to?: Date) {
    const where = {
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.notificationDelivery.groupBy({
      by: ['channel', 'status'],
      where,
      _count: { _all: true },
    });
    return rows;
  }

  async retry(deliveryId: string) {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { notification: true },
    });
    if (!delivery) return null;
    return this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: DeliveryStatus.queued,
        errorCode: null,
        errorMessage: null,
      },
    });
  }
}
