import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPort, NotifyInput } from './notification.port';

@Injectable()
export class InAppOnlyNotificationAdapter extends NotificationPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async notify(input: NotifyInput): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        channelsRequested: input.channels ?? ['in_app'],
      },
    });
  }
}
