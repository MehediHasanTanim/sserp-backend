import { Injectable } from '@nestjs/common';
import {
  NotificationPort,
  NotifyInput,
} from '../../../shared/ports/notification.port';
import { NotificationsService } from '../services/notification.service';

@Injectable()
export class MultiChannelNotificationAdapter extends NotificationPort {
  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async notify(input: NotifyInput): Promise<void> {
    await this.notifications.createAndDispatch({
      userId: input.userId,
      typeCode: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      channelsOverride: input.channels as
        ('in_app' | 'email' | 'sms')[] | undefined,
      groupKey: input.entityId ? `${input.type}:${input.entityId}` : undefined,
    });
  }
}
