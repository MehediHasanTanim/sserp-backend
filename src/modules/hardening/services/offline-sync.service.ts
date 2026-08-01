import { Injectable, Logger } from '@nestjs/common';
import {
  OfflineSyncEntityType,
  OfflineSyncStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';

export type OfflineOp = {
  clientOpId: string;
  clientTimestamp: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class OfflineSyncService {
  private readonly logger = new Logger(OfflineSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitBatch(input: {
    userId: string;
    clientBatchId: string;
    entityType: OfflineSyncEntityType;
    clientTimestamp: Date;
    operations: OfflineOp[];
  }) {
    const existing = await this.prisma.offlineSyncQueue.findUnique({
      where: { clientBatchId: input.clientBatchId },
    });
    if (existing) {
      return {
        ...(typeof existing.result === 'object' && existing.result
          ? (existing.result as object)
          : { status: existing.status }),
        replayed: true,
      };
    }

    const outcomes: Array<{
      clientOpId: string;
      status: 'accepted' | 'conflicted' | 'rejected';
      reason?: string;
    }> = [];

    for (const op of input.operations) {
      const frozen =
        op.payload?.frozen === true || op.payload?.isFrozen === true;
      if (frozen) {
        outcomes.push({
          clientOpId: op.clientOpId,
          status: 'rejected',
          reason: ErrorCode.ATTENDANCE_FROZEN,
        });
        continue;
      }

      const serverUpdatedAt = op.payload?.serverUpdatedAt
        ? new Date(String(op.payload.serverUpdatedAt))
        : null;
      const clientTs = new Date(op.clientTimestamp);
      const otherUser = op.payload?.lastModifiedByUserId
        ? String(op.payload.lastModifiedByUserId) !== input.userId
        : false;

      if (
        serverUpdatedAt &&
        otherUser &&
        serverUpdatedAt.getTime() > clientTs.getTime()
      ) {
        outcomes.push({
          clientOpId: op.clientOpId,
          status: 'conflicted',
          reason: 'newer_server_value',
        });
        continue;
      }

      outcomes.push({ clientOpId: op.clientOpId, status: 'accepted' });
    }

    const accepted = outcomes.filter((o) => o.status === 'accepted').length;
    const conflicted = outcomes.filter((o) => o.status === 'conflicted').length;
    const rejected = outcomes.filter((o) => o.status === 'rejected').length;
    let status: OfflineSyncStatus = OfflineSyncStatus.accepted;
    if (conflicted && accepted) status = OfflineSyncStatus.partially_accepted;
    else if (conflicted && !accepted) status = OfflineSyncStatus.conflicted;
    else if (rejected && !accepted) status = OfflineSyncStatus.rejected;
    else if (rejected && accepted)
      status = OfflineSyncStatus.partially_accepted;

    const result = {
      outcomes,
      source: 'offline_sync',
      clientTimestamp: input.clientTimestamp.toISOString(),
    };

    await this.prisma.offlineSyncQueue.create({
      data: {
        clientBatchId: input.clientBatchId,
        userId: input.userId,
        entityType: input.entityType,
        payload: input.operations as unknown as Prisma.InputJsonValue,
        clientTimestamp: input.clientTimestamp,
        status,
        conflictReport: conflicted
          ? (outcomes.filter(
              (o) => o.status === 'conflicted',
            ) as unknown as Prisma.InputJsonValue)
          : undefined,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.debug(
      `Offline batch ${input.clientBatchId}: ${accepted} ok, ${conflicted} conflict, ${rejected} rejected`,
    );
    return result;
  }
}
