import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCode } from '../../../shared/errors/domain-exception';
import { PrApprovalService } from './pr-approval.service';

describe('PrApprovalService', () => {
  let service: PrApprovalService;
  let prisma: any;
  let budgetCheck: any;
  let prService: any;
  let events: EventEmitter2;

  const prId = 'pr-1';
  const requesterId = 'requester-1';
  const actorId = 'actor-1';

  const basePr = {
    id: prId,
    status: 'pending_dept_review',
    requestedBy: requesterId,
    estimatedTotal: 100_000,
    budgetLineId: null,
    lines: [],
  };

  beforeEach(() => {
    prisma = {
      purchaseRequest: {
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...basePr, ...data }),
          ),
      },
      budgetLine: { findUnique: jest.fn() },
    };
    budgetCheck = { dryRun: jest.fn().mockResolvedValue({ ok: true }) };
    prService = { emitStatusChanged: jest.fn() };
    events = { emit: jest.fn() } as unknown as EventEmitter2;

    service = new PrApprovalService(prisma, budgetCheck, prService, events);
  });

  it('dept rejection requires a reason', async () => {
    prisma.purchaseRequest.findUnique.mockResolvedValue(basePr);

    await expect(
      service.deptReview(prId, actorId, ['coordinator'], {
        approved: false,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('dept rejection sets status rejected with reason', async () => {
    prisma.purchaseRequest.findUnique.mockResolvedValue(basePr);

    const result = await service.deptReview(prId, actorId, ['coordinator'], {
      approved: false,
      reason: 'Not needed this quarter',
    });

    expect(result.status).toBe('rejected');
    expect(prisma.purchaseRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rejectionReason: 'Not needed this quarter',
        }),
      }),
    );
  });

  it('rejects self-approval at principal stage', async () => {
    prisma.purchaseRequest.findUnique.mockResolvedValue({
      ...basePr,
      status: 'pending_principal_approval',
      requestedBy: actorId,
    });

    await expect(
      service.approve(prId, actorId, ['principal'], {}),
    ).rejects.toMatchObject({ code: ErrorCode.SELF_APPROVAL_FORBIDDEN });
  });

  it('rejects principal reject without reason', async () => {
    prisma.purchaseRequest.findUnique.mockResolvedValue({
      ...basePr,
      status: 'pending_principal_approval',
    });

    await expect(
      service.reject(prId, actorId, ['principal'], '   '),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});
