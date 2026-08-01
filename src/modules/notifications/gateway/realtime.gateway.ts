import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { EventNames } from '../../../shared/events/event-names';
import { DomainException } from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { REALTIME_GATEWAY, SENSITIVE_SOCKET_FIELDS } from '../constants';
import { WsJwtGuard } from './ws-jwt.guard';
import { RoomResolverService } from './room-resolver.service';
import { PresenceService } from './presence.service';
import { AuthUser } from '../../../shared/decorators';

type AuthedSocket = Socket & { user?: AuthUser; token?: string };

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.WS_CORS_ORIGINS?.split(',') ?? [
      'http://localhost:3001',
    ],
  },
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private verifyTimer?: ReturnType<typeof setInterval>;
  private pubClient?: Redis;
  private subClient?: Redis;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsJwt: WsJwtGuard,
    private readonly rooms: RoomResolverService,
    private readonly presence: PresenceService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit() {
    // Self-register as REALTIME_GATEWAY provider target
  }

  async afterInit(server: Server) {
    const url = this.config.get<string>('redisPubsubUrl');
    if (url) {
      this.pubClient = new Redis(url);
      this.subClient = new Redis(url);
      server.adapter(createAdapter(this.pubClient, this.subClient));
      this.logger.log('Socket.io Redis adapter configured');
    }
    this.verifyTimer = setInterval(() => this.reverifyTokens(), 60_000);
  }

  onModuleDestroy() {
    if (this.verifyTimer) clearInterval(this.verifyTimer);
    this.pubClient?.disconnect();
    this.subClient?.disconnect();
  }

  async handleConnection(client: AuthedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    const user = await this.wsJwt.verifyToken(token);
    if (!user) {
      client.emit('error', { code: 'unauthorized' });
      client.disconnect(true);
      return;
    }
    client.user = user;
    client.token = token;
    for (const room of this.rooms.roomsForUser(user)) {
      await client.join(room);
    }
    this.presence.heartbeat(user.id);
    await this.prisma.socketSession.create({
      data: {
        userId: user.id,
        socketId: client.id,
        userAgent: client.handshake.headers['user-agent'],
        ipAddress: client.handshake.address,
        rooms: this.rooms.roomsForUser(user),
      },
    });
    await this.eventsEmitConnected(user.id, client.id);
  }

  async handleDisconnect(client: AuthedSocket) {
    if (client.user) this.presence.remove(client.user.id);
    await this.prisma.socketSession.updateMany({
      where: { socketId: client.id, disconnectedAt: null },
      data: { disconnectedAt: new Date() },
    });
    if (client.user) {
      await this.eventsEmitDisconnected(client.user.id, client.id);
    }
  }

  @SubscribeMessage('thread:subscribe')
  async subscribeThread(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { threadId: string },
  ) {
    if (!client.user) throw DomainException.forbidden('Unauthorized');
    const participant = await this.prisma.threadParticipant.findFirst({
      where: {
        threadId: body.threadId,
        userId: client.user.id,
        leftAt: null,
      },
    });
    if (!participant) {
      client.emit('error', { code: 'forbidden', message: 'Not a participant' });
      return { ok: false };
    }
    await client.join(this.rooms.threadRoom(body.threadId));
    return { ok: true };
  }

  @SubscribeMessage('thread:unsubscribe')
  async unsubscribeThread(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { threadId: string },
  ) {
    await client.leave(this.rooms.threadRoom(body.threadId));
    return { ok: true };
  }

  @SubscribeMessage('presence:heartbeat')
  heartbeat(@ConnectedSocket() client: AuthedSocket) {
    if (client.user) this.presence.heartbeat(client.user.id);
    return { ok: true };
  }

  @OnEvent(EventNames.USER_DEACTIVATED)
  onUserDeactivated(payload: { userId: string }) {
    this.server.to(`user:${payload.userId}`).disconnectSockets(true);
  }

  @OnEvent(EventNames.REPORT_EXPORT_READY)
  onExportReady(payload: {
    userId: string;
    jobId: string;
    downloadUrl: string;
  }) {
    this.emitExportReady(payload.userId, {
      jobId: payload.jobId,
      downloadUrl: payload.downloadUrl,
    });
  }

  emitNotificationNew(userId: string, notification: unknown) {
    this.safeEmit(`user:${userId}`, 'notification:new', notification);
  }

  emitNotificationCount(userId: string, count: unknown) {
    this.safeEmit(`user:${userId}`, 'notification:count', count);
  }

  emitMessageNew(threadId: string, message: unknown) {
    this.safeEmit(this.rooms.threadRoom(threadId), 'message:new', message);
  }

  emitAnnouncementPublished(roles: string[], announcement: unknown) {
    for (const role of roles) {
      this.safeEmit(`role:${role}`, 'announcement:published', announcement);
    }
  }

  emitDashboardInvalidate(role: string, widgets: string[]) {
    this.safeEmit(`role:${role}`, 'dashboard:invalidate', { widgets });
  }

  emitEntityChanged(
    room: string,
    payload: { entityType: string; entityId: string; action: string },
  ) {
    this.safeEmit(room, 'entity:changed', payload);
  }

  emitExportReady(
    userId: string,
    payload: { jobId: string; downloadUrl: string },
  ) {
    this.safeEmit(`user:${userId}`, 'export:ready', payload);
  }

  emitPresenceUpdate(
    role: string,
    payload: { userId: string; status: string },
  ) {
    this.safeEmit(`role:${role}`, 'presence:update', payload);
  }

  private safeEmit(room: string, event: string, payload: unknown) {
    this.assertNoSensitiveFields(payload);
    this.server.to(room).emit(event, payload);
  }

  assertNoSensitiveFields(payload: unknown, path = ''): void {
    if (!payload || typeof payload !== 'object') return;
    for (const [key, value] of Object.entries(
      payload as Record<string, unknown>,
    )) {
      const fullKey = `${path}${key}`;
      if (
        SENSITIVE_SOCKET_FIELDS.some((f) =>
          key.toLowerCase().includes(f.toLowerCase()),
        )
      ) {
        throw new Error(`Sensitive field in socket payload: ${fullKey}`);
      }
      if (value && typeof value === 'object') {
        this.assertNoSensitiveFields(value, `${fullKey}.`);
      }
    }
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string };
    return auth?.token ?? null;
  }

  private async reverifyTokens() {
    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      const client = socket as unknown as AuthedSocket;
      if (!client.token) continue;
      const user = await this.wsJwt.verifyToken(client.token);
      if (!user) {
        socket.emit('error', { code: 'token_expired' });
        socket.disconnect(true);
      }
    }
  }

  private async eventsEmitConnected(userId: string, socketId: string) {
    await this.events.emitAsync(EventNames.SOCKET_CONNECTED, {
      userId,
      socketId,
    });
  }

  private async eventsEmitDisconnected(userId: string, socketId: string) {
    await this.events.emitAsync(EventNames.SOCKET_DISCONNECTED, {
      userId,
      socketId,
    });
  }
}

// Register gateway as REALTIME_GATEWAY token provider
export const RealtimeGatewayProvider = {
  provide: REALTIME_GATEWAY,
  useExisting: RealtimeGateway,
};
