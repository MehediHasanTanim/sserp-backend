import { ApprovalChainService } from '../../src/modules/notifications/services/approval-chain.service';

describe('Approval chain regression (WF-06)', () => {
  it('seeded chains resolve without altering hardcoded phase flows', async () => {
    const prisma = {
      approvalChain: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          workflowCode: 'purchase_request',
          version: 1,
          steps: [
            {
              level: 1,
              approverType: 'role',
              approverRole: 'coordinator',
              isMandatory: true,
              condition: null,
            },
          ],
        }),
      },
      employee: { findUnique: jest.fn() },
    };
    const service = new ApprovalChainService(prisma as never);
    const snap = await service.resolveChain('purchase_request', {});
    expect(snap.steps).toHaveLength(1);
    expect(snap.version).toBe(1);
  });
});
