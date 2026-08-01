import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationPriority } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationsService } from '../services/notification.service';
import { RecipientResolverService } from '../services/recipient-resolver.service';
import {
  assertNotificationMappingComplete,
  NOTIFICATION_MAP,
  NotificationMapping,
  NotificationMappingContext,
} from './notification-map';

@Injectable()
export class DomainEventListener implements OnModuleInit {
  private readonly logger = new Logger(DomainEventListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly recipients: RecipientResolverService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit() {
    try {
      const types = await this.prisma.notificationType.findMany({
        select: { code: true },
      });
      if (types.length) {
        assertNotificationMappingComplete(new Set(types.map((t) => t.code)));
      } else {
        this.logger.warn(
          'notification_types empty — skip mapping assertion (run phase8 seed)',
        );
      }
    } catch (err) {
      this.logger.warn(
        `Skipping notification mapping assertion: ${err instanceof Error ? err.message : err}`,
      );
    }

    for (const mapping of NOTIFICATION_MAP) {
      this.events.on(mapping.event, (payload: Record<string, unknown>) =>
        this.dispatch(mapping, payload),
      );
    }
    this.logger.log(
      `Notification mapping verified: ${NOTIFICATION_MAP.length} event handlers registered`,
    );
  }

  private mappingContext(): NotificationMappingContext {
    return {
      resolveGuardians: (studentId, critical) =>
        this.recipients.guardiansOfStudent(
          studentId,
          critical
            ? NotificationPriority.critical
            : NotificationPriority.normal,
        ),
      resolveRoles: (roles) => this.recipients.usersByRoles(roles),
      resolveUser: (userId) => this.recipients.userById(userId),
      resolvePrRequester: (prId) => this.recipients.prRequester(prId),
      resolveGroupGuardians: (groupId) =>
        this.recipients.groupSessionGuardians(groupId),
    };
  }

  private async dispatch(
    mapping: NotificationMapping,
    payload: Record<string, unknown>,
  ) {
    try {
      const ctx = this.mappingContext();
      const resolved = await mapping.recipients(payload, ctx);
      const variables = mapping.variables(payload);
      const groupKey = mapping.groupKey?.(payload);
      for (const recipient of resolved) {
        if (!recipient?.userId) continue;
        await this.notifications.createAndDispatch({
          userId: recipient.userId,
          typeCode: mapping.typeCode,
          title: String(variables.title ?? mapping.typeCode),
          body: String(variables.body ?? ''),
          entityType: payload.entityType as string | undefined,
          entityId: (payload.entityId ?? payload.id) as string | undefined,
          groupKey,
          variables,
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to dispatch notification for ${mapping.event}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
