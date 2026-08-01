import { OfflineSyncService } from '../../src/modules/hardening/services/offline-sync.service';
import { ErrorCode } from '../../src/shared/errors/domain-exception';

describe('Offline sync (H-07)', () => {
  it('replays same clientBatchId idempotently', async () => {
    const existing = {
      clientBatchId: 'b1',
      status: 'accepted',
      result: { replayed: false, outcomes: [] },
    };
    const prisma = {
      offlineSyncQueue: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const svc = new OfflineSyncService(prisma as never);
    const res = await svc.submitBatch({
      userId: 'u1',
      clientBatchId: 'b1',
      entityType: 'student_attendance' as never,
      clientTimestamp: new Date(),
      operations: [],
    });
    expect(res).toMatchObject({ replayed: true });
    expect(prisma.offlineSyncQueue.create).not.toHaveBeenCalled();
  });

  it('rejects frozen attendance per operation', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      offlineSyncQueue: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const svc = new OfflineSyncService(prisma as never);
    const res = (await svc.submitBatch({
      userId: 'u1',
      clientBatchId: 'b2',
      entityType: 'student_attendance' as never,
      clientTimestamp: new Date(),
      operations: [
        {
          clientOpId: 'op1',
          clientTimestamp: new Date().toISOString(),
          payload: { frozen: true },
        },
      ],
    })) as { outcomes: Array<{ status: string; reason?: string }> };
    expect(res.outcomes[0].status).toBe('rejected');
    expect(res.outcomes[0].reason).toBe(ErrorCode.ATTENDANCE_FROZEN);
  });

  it('reports conflict when newer server value by other user', async () => {
    const prisma = {
      offlineSyncQueue: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = new OfflineSyncService(prisma as never);
    const clientTs = new Date('2026-08-01T10:00:00Z');
    const res = (await svc.submitBatch({
      userId: 'u1',
      clientBatchId: 'b3',
      entityType: 'session_note' as never,
      clientTimestamp: clientTs,
      operations: [
        {
          clientOpId: 'op1',
          clientTimestamp: clientTs.toISOString(),
          payload: {
            serverUpdatedAt: '2026-08-01T11:00:00Z',
            lastModifiedByUserId: 'u2',
          },
        },
      ],
    })) as { outcomes: Array<{ status: string }> };
    expect(res.outcomes[0].status).toBe('conflicted');
  });
});
