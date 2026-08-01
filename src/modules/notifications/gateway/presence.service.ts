import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export type PresenceStatus = 'online' | 'away' | 'offline';

@Injectable()
export class PresenceService {
  private readonly heartbeats = new Map<
    string,
    { status: PresenceStatus; at: Date }
  >();

  constructor(private readonly prisma: PrismaService) {}

  heartbeat(userId: string) {
    this.heartbeats.set(userId, { status: 'online', at: new Date() });
  }

  getStatus(userId: string): PresenceStatus {
    const entry = this.heartbeats.get(userId);
    if (!entry) return 'offline';
    const staleMs = Date.now() - entry.at.getTime();
    if (staleMs > 120_000) return 'away';
    return entry.status;
  }

  allOnline(): Array<{ userId: string; status: PresenceStatus }> {
    return [...this.heartbeats.entries()].map(([userId]) => ({
      userId,
      status: this.getStatus(userId),
    }));
  }

  remove(userId: string) {
    this.heartbeats.delete(userId);
  }
}
