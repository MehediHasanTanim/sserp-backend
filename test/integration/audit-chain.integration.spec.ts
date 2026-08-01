import { createHash } from 'crypto';
import { AuditHashChainService } from '../../src/modules/hardening/services/audit-hash-chain.service';

describe('Audit hash chain (H-06)', () => {
  it('verify fails when checkpoint hash mismatches', async () => {
    const rows = [
      {
        id: 'a1',
        created_at: new Date('2026-01-01T00:00:00Z'),
        action: 'CREATE',
        entity_type: 'student',
      },
    ];
    let hash = 'GENESIS';
    for (const row of rows) {
      hash = createHash('sha256')
        .update(
          `${hash}|${row.id}|${row.created_at.toISOString()}|${row.action}|${row.entity_type}`,
        )
        .digest('hex');
    }
    const prisma = {
      auditHashCheckpoint: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cp1',
            fromSeq: 0n,
            toSeq: 0n,
            chainHash: 'tampered',
            rowCount: 1,
          },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue(rows),
    };
    const svc = new AuditHashChainService(prisma as never);
    const result = await svc.verify();
    expect(result.ok).toBe(false);
  });
});
