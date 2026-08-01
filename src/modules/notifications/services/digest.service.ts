import { Injectable, Logger } from '@nestjs/common';
import { DigestMode } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    userId: string,
    notificationId: string,
    digestMode: DigestMode,
  ) {
    const scheduledFor = this.nextDigestTime(digestMode);
    await this.prisma.digestQueue.create({
      data: {
        userId,
        notificationId,
        digestMode,
        scheduledFor,
      },
    });
    this.logger.debug(
      `Queued notification ${notificationId} for ${digestMode} digest at ${scheduledFor.toISOString()}`,
    );
  }

  nextDigestTime(mode: DigestMode, now = new Date()): Date {
    const d = new Date(now);
    d.setHours(8, 0, 0, 0);
    if (mode === DigestMode.daily) {
      if (d <= now) d.setDate(d.getDate() + 1);
      return d;
    }
    // weekly — next Monday 08:00
    const day = d.getDay();
    const daysUntilMonday =
      day === 0 ? 1 : day === 1 && d > now ? 0 : (8 - day) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    if (d <= now) d.setDate(d.getDate() + 7);
    return d;
  }

  async buildDigest(userId: string, mode: DigestMode) {
    const now = new Date();
    const pending = await this.prisma.digestQueue.findMany({
      where: {
        userId,
        digestMode: mode,
        scheduledFor: { lte: now },
        includedInDigestId: null,
      },
      include: { notification: true },
      orderBy: { scheduledFor: 'asc' },
    });
    if (!pending.length) return null;

    const periodStart = pending[0].scheduledFor;
    const periodEnd = now;

    const digest = await this.prisma.digest.create({
      data: {
        userId,
        digestMode: mode,
        periodStart,
        periodEnd,
        notificationCount: pending.length,
      },
    });

    await this.prisma.digestQueue.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { includedInDigestId: digest.id },
    });

    return {
      digest,
      notifications: pending.map((p) => p.notification),
    };
  }
}
