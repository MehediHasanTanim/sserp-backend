import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { ORG_SETTINGS_ID, REALTIME_GATEWAY } from '../constants';
import { RealtimeGateway } from '../gateway/realtime.gateway';

const TOMBSTONE = '[Message deleted]';

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Optional()
    @Inject(REALTIME_GATEWAY)
    private readonly realtime?: RealtimeGateway,
  ) {}

  async listThreads(userId: string) {
    const participants = await this.prisma.threadParticipant.findMany({
      where: { userId, leftAt: null },
      include: {
        thread: {
          include: {
            participants: {
              include: { user: { select: { id: true, username: true } } },
            },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { thread: { lastMessageAt: 'desc' } },
    });
    return participants.map((p) => ({
      ...p.thread,
      unreadCount: 0,
      isMuted: p.isMuted,
    }));
  }

  async createThread(
    userId: string,
    input: {
      threadType: 'direct' | 'group';
      subject?: string;
      participantUserIds: string[];
      department?: string;
    },
  ) {
    const allParticipants = [...new Set([userId, ...input.participantUserIds])];
    const thread = await this.prisma.messageThread.create({
      data: {
        threadType: input.threadType,
        subject: input.subject,
        createdBy: userId,
        department: input.department,
        participants: {
          create: allParticipants.map((uid, idx) => ({
            userId: uid,
            role: uid === userId ? 'owner' : 'member',
          })),
        },
      },
      include: { participants: true },
    });
    return thread;
  }

  async getThreadMessages(
    userId: string,
    threadId: string,
    page = 1,
    pageSize = 50,
  ) {
    await this.assertParticipant(userId, threadId);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.staffMessage.count({ where: { threadId } }),
      this.prisma.staffMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async postMessage(
    userId: string,
    threadId: string,
    input: {
      body: string;
      attachmentIds?: string[];
      replyToMessageId?: string;
    },
  ) {
    await this.assertParticipant(userId, threadId);
    const message = await this.prisma.staffMessage.create({
      data: {
        threadId,
        senderUserId: userId,
        body: input.body,
        attachmentIds: input.attachmentIds ?? [],
        replyToMessageId: input.replyToMessageId,
      },
    });
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });
    await this.events.emitAsync(EventNames.MESSAGE_POSTED, {
      threadId,
      messageId: message.id,
      senderUserId: userId,
    });
    this.realtime?.emitMessageNew(threadId, { ...message, threadId });
    return message;
  }

  async editMessage(userId: string, messageId: string, body: string) {
    const message = await this.prisma.staffMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) throw DomainException.notFound('Message not found');
    if (message.senderUserId !== userId) {
      throw DomainException.forbidden('Only the sender may edit');
    }
    if (message.deletedAt)
      throw DomainException.conflict('Message was deleted');

    const org = await this.prisma.organizationSettings.findUniqueOrThrow({
      where: { id: ORG_SETTINGS_ID },
    });
    const windowMs = (org.messageEditWindowMinutes ?? 15) * 60_000;
    if (Date.now() - message.createdAt.getTime() > windowMs) {
      throw DomainException.withCode(
        ErrorCode.EDIT_WINDOW_EXPIRED,
        409,
        'Edit window has expired',
      );
    }
    return this.prisma.staffMessage.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
    });
  }

  async deleteMessage(userId: string, messageId: string, isAdmin = false) {
    const message = await this.prisma.staffMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) throw DomainException.notFound('Message not found');
    if (message.senderUserId !== userId && !isAdmin) {
      throw DomainException.forbidden('Only the sender may delete');
    }
    return this.prisma.staffMessage.update({
      where: { id: messageId },
      data: { body: TOMBSTONE, deletedAt: new Date() },
    });
  }

  async markRead(userId: string, threadId: string, messageId: string) {
    await this.assertParticipant(userId, threadId);
    await this.prisma.threadParticipant.updateMany({
      where: { threadId, userId },
      data: { lastReadMessageId: messageId },
    });
    return { ok: true };
  }

  async addParticipant(ownerId: string, threadId: string, userId: string) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: { participants: true },
    });
    if (!thread) throw DomainException.notFound('Thread not found');
    const owner = thread.participants.find(
      (p) => p.userId === ownerId && p.role === 'owner',
    );
    if (!owner) throw DomainException.forbidden('Thread owner required');
    return this.prisma.threadParticipant.create({
      data: { threadId, userId, role: 'member' },
    });
  }

  async mute(userId: string, threadId: string, muted: boolean) {
    await this.assertParticipant(userId, threadId);
    await this.prisma.threadParticipant.updateMany({
      where: { threadId, userId },
      data: { isMuted: muted },
    });
    return { ok: true };
  }

  async closeThread(ownerId: string, threadId: string) {
    const owner = await this.prisma.threadParticipant.findFirst({
      where: { threadId, userId: ownerId, role: 'owner' },
    });
    if (!owner) throw DomainException.forbidden('Thread owner required');
    return this.prisma.messageThread.update({
      where: { id: threadId },
      data: { isClosed: true },
    });
  }

  private async assertParticipant(userId: string, threadId: string) {
    const p = await this.prisma.threadParticipant.findFirst({
      where: { threadId, userId, leftAt: null },
    });
    if (!p) throw DomainException.forbidden('Not a thread participant');
    return p;
  }
}
