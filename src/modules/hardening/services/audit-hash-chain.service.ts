import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class AuditHashChainService {
  private readonly logger = new Logger(AuditHashChainService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('15 3 * * *')
  async nightlyCheckpoint() {
    await this.createCheckpoint();
  }

  async createCheckpoint() {
    const last = await this.prisma.auditHashCheckpoint.findFirst({
      orderBy: { toSeq: 'desc' },
    });
    const fromSeq = last ? Number(last.toSeq) + 1 : 0;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        created_at: Date;
        action: string;
        entity_type: string;
      }>
    >`
      SELECT id::text, created_at, action, entity_type
      FROM audit_logs
      ORDER BY created_at ASC
      OFFSET ${fromSeq}
      LIMIT 5000
    `;
    if (!rows.length) {
      this.logger.debug('No new audit rows for hash chain');
      return null;
    }
    let hash = last?.chainHash ?? 'GENESIS';
    for (const row of rows) {
      hash = createHash('sha256')
        .update(
          `${hash}|${row.id}|${row.created_at.toISOString()}|${row.action}|${row.entity_type}`,
        )
        .digest('hex');
    }
    const checkpoint = await this.prisma.auditHashCheckpoint.create({
      data: {
        fromSeq: BigInt(fromSeq),
        toSeq: BigInt(fromSeq + rows.length - 1),
        chainHash: hash,
        rowCount: rows.length,
      },
    });
    this.logger.log(
      `Audit hash checkpoint ${checkpoint.id} rows=${rows.length}`,
    );
    return checkpoint;
  }

  async verify(): Promise<{ ok: boolean; reason?: string }> {
    const checkpoints = await this.prisma.auditHashCheckpoint.findMany({
      orderBy: { fromSeq: 'asc' },
    });
    let prev = 'GENESIS';
    for (const cp of checkpoints) {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          created_at: Date;
          action: string;
          entity_type: string;
        }>
      >`
        SELECT id::text, created_at, action, entity_type
        FROM audit_logs
        ORDER BY created_at ASC
        OFFSET ${Number(cp.fromSeq)}
        LIMIT ${cp.rowCount}
      `;
      let hash = prev;
      for (const row of rows) {
        hash = createHash('sha256')
          .update(
            `${hash}|${row.id}|${row.created_at.toISOString()}|${row.action}|${row.entity_type}`,
          )
          .digest('hex');
      }
      if (hash !== cp.chainHash) {
        this.logger.error(`Audit chain mismatch at checkpoint ${cp.id}`);
        return { ok: false, reason: `mismatch:${cp.id}` };
      }
      prev = cp.chainHash;
    }
    return { ok: true };
  }
}
