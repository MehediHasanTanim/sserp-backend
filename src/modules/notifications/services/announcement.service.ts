import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { REALTIME_GATEWAY } from '../constants';
import { RealtimeGateway } from '../gateway/realtime.gateway';
import { NotificationsService } from './notification.service';

@Injectable()
export class AnnouncementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
    @Optional()
    @Inject(REALTIME_GATEWAY)
    private readonly realtime?: RealtimeGateway,
  ) {}

  async listVisible(userId: string, roles: string[]) {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        status: 'published',
        OR: [{ publishAt: null }, { publishAt: { lte: now } }],
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          {
            OR: [
              { audienceType: 'all_staff' },
              {
                audienceType: 'roles',
                audience: { path: ['roles'], array_contains: roles[0] },
              },
            ],
          },
        ],
      },
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
    });
  }

  async create(
    userId: string,
    input: {
      title: string;
      body: string;
      audienceType: 'all_staff' | 'departments' | 'roles' | 'specific_users';
      audience?: Record<string, unknown>;
      publishAt?: Date;
      expiresAt?: Date;
      isPinned?: boolean;
      attachmentIds?: string[];
    },
  ) {
    return this.prisma.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        audienceType: input.audienceType,
        audience: (input.audience ?? {}) as Prisma.InputJsonValue,
        publishAt: input.publishAt,
        expiresAt: input.expiresAt,
        isPinned: input.isPinned ?? false,
        attachmentIds: input.attachmentIds ?? [],
        createdBy: userId,
        status: 'draft',
      },
    });
  }

  async updateDraft(
    userId: string,
    id: string,
    data: Partial<{
      title: string;
      body: string;
      audience: Prisma.InputJsonValue;
    }>,
  ) {
    const ann = await this.prisma.announcement.findUnique({ where: { id } });
    if (!ann) throw DomainException.notFound('Announcement not found');
    if (ann.createdBy !== userId)
      throw DomainException.forbidden('Author only');
    if (ann.status !== 'draft') throw DomainException.conflict('Draft only');
    return this.prisma.announcement.update({
      where: { id },
      data: data as Prisma.AnnouncementUpdateInput,
    });
  }

  async publish(userId: string, id: string) {
    const ann = await this.prisma.announcement.findUnique({ where: { id } });
    if (!ann) throw DomainException.notFound('Announcement not found');
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'published', publishAt: ann.publishAt ?? new Date() },
    });
    await this.events.emitAsync(EventNames.ANNOUNCEMENT_PUBLISHED, {
      announcementId: id,
      audienceType: ann.audienceType,
      audience: ann.audience,
    });
    const roles =
      ann.audienceType === 'roles'
        ? ((ann.audience as { roles?: string[] }).roles ?? [])
        : ['coordinator', 'principal', 'hr_officer', 'teacher'];
    this.realtime?.emitAnnouncementPublished(roles, {
      id: updated.id,
      title: updated.title,
      body: updated.body,
    });
    const users = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      take: 200,
    });
    for (const user of users) {
      await this.notifications.createAndDispatch({
        userId: user.id,
        typeCode: 'announcement.published',
        title: updated.title,
        body: updated.body.slice(0, 200),
        entityType: 'announcement',
        entityId: updated.id,
      });
    }
    return updated;
  }

  async withdraw(userId: string, id: string) {
    const ann = await this.prisma.announcement.findUnique({ where: { id } });
    if (!ann) throw DomainException.notFound('Announcement not found');
    return this.prisma.announcement.update({
      where: { id },
      data: { status: 'withdrawn' },
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: id, userId } },
      create: { announcementId: id, userId },
      update: { readAt: new Date() },
    });
  }

  async readStats(requesterId: string, requesterRoles: string[], id: string) {
    const ann = await this.prisma.announcement.findUnique({ where: { id } });
    if (!ann) throw DomainException.notFound('Announcement not found');
    const allowed =
      ann.createdBy === requesterId || requesterRoles.includes('principal');
    if (!allowed) throw DomainException.forbidden('Author or principal only');
    const readCount = await this.prisma.announcementRead.count({
      where: { announcementId: id },
    });
    return { readCount, announcementId: id };
  }
}
