import { ApprovalChainService } from './approval-chain.service';
import { ApproverType } from '@prisma/client';
import { ErrorCode } from '../../../shared/errors/domain-exception';

describe('ApprovalChainService', () => {
  const prisma = {
    approvalChain: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    employee: { findUnique: jest.fn() },
  };
  const service = new ApprovalChainService(prisma as never);

  const chain = {
    id: 'c1',
    workflowCode: 'purchase_request',
    version: 1,
    steps: [
      {
        level: 1,
        approverType: ApproverType.role,
        approverRole: 'coordinator',
        isMandatory: true,
        condition: { field: 'amount', op: 'gte', value: 1000 },
      },
      {
        level: 2,
        approverType: ApproverType.reporting_manager,
        approverRole: 'principal',
        isMandatory: true,
        condition: null,
      },
    ],
  };

  beforeEach(() => jest.clearAllMocks());

  it('skips conditional step below threshold', async () => {
    prisma.approvalChain.findFirst.mockResolvedValue(chain);
    prisma.employee.findUnique.mockResolvedValue({
      reportingManager: { user: { id: 'mgr1' } },
    });
    const snap = await service.resolveChain(
      'purchase_request',
      { amount: 100 },
      { employeeId: 'e1' },
    );
    expect(snap.steps[0].status).toBe('skipped');
    expect(snap.steps[1].status).toBe('pending');
  });

  it('falls back when no reporting manager', async () => {
    prisma.approvalChain.findFirst.mockResolvedValue({
      ...chain,
      steps: [chain.steps[1]],
    });
    prisma.employee.findUnique.mockResolvedValue({ reportingManager: null });
    const snap = await service.resolveChain(
      'purchase_request',
      {},
      { employeeId: 'e1' },
    );
    expect(snap.steps[0].approverRole).toBe('principal');
  });

  it('throws NO_APPROVER_RESOLVED when mandatory unresolved', async () => {
    prisma.approvalChain.findFirst.mockResolvedValue({
      ...chain,
      steps: [
        {
          ...chain.steps[1],
          approverType: ApproverType.reporting_manager,
          approverRole: null,
        },
      ],
    });
    prisma.employee.findUnique.mockResolvedValue({ reportingManager: null });
    await expect(
      service.resolveChain('purchase_request', {}, { employeeId: 'e1' }),
    ).rejects.toMatchObject({
      code: ErrorCode.NO_APPROVER_RESOLVED,
    });
  });

  it('evaluateCondition supports gte', () => {
    expect(
      service.evaluateCondition(
        { field: 'amount', op: 'gte', value: 500 },
        { amount: 600 },
      ),
    ).toBe(true);
    expect(
      service.evaluateCondition(
        { field: 'amount', op: 'gte', value: 500 },
        { amount: 100 },
      ),
    ).toBe(false);
  });
});
