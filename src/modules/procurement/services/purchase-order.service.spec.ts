import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { PurchaseOrderService } from './purchase-order.service';

describe('PurchaseOrderService', () => {
  let service: PurchaseOrderService;
  let prisma: any;
  let numbering: any;
  let org: any;
  let vendors: any;
  let events: EventEmitter2;

  beforeEach(() => {
    numbering = { nextCode: jest.fn().mockResolvedValue('PO-0001') };
    org = {
      getFull: jest.fn().mockResolvedValue({ poApprovalThreshold: 500_000 }),
    };
    vendors = {
      findById: jest.fn(),
      assertAvailable: jest.fn(),
    };
    events = { emit: jest.fn() } as unknown as EventEmitter2;

    prisma = {
      purchaseRequestLine: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      purchaseRequest: { update: jest.fn() },
      purchaseOrder: { create: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    service = new PurchaseOrderService(prisma, numbering, org, vendors, events);
  });

  it('rejects PO from non-approved PR', async () => {
    vendors.findById.mockResolvedValue({ id: 'v1', status: 'active' });
    prisma.purchaseRequestLine.findUnique.mockResolvedValue({
      id: 'prl-1',
      prId: 'pr-1',
      itemId: 'item-1',
      itemDescription: 'Item',
      quantity: 10,
      poIssuedQuantity: 0,
      unitOfMeasureId: 'uom-1',
      purchaseRequest: { status: 'pending_principal_approval' },
      item: { id: 'item-1' },
    });

    await expect(
      service.createFromPrLines(
        {
          vendorId: 'v1',
          poDate: '2026-07-01',
          lines: [{ prLineId: 'prl-1', quantity: 5, unitPrice: 1000 }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: ErrorCode.PR_NOT_APPROVED });
  });

  it('rejects PO for blacklisted vendor', async () => {
    vendors.findById.mockResolvedValue({ id: 'v1', status: 'blacklisted' });
    vendors.assertAvailable.mockImplementation(() => {
      throw DomainException.withCode(
        ErrorCode.VENDOR_UNAVAILABLE,
        422,
        'Vendor is not available for procurement',
      );
    });

    await expect(
      service.createFromPrLines(
        {
          vendorId: 'v1',
          poDate: '2026-07-01',
          lines: [{ prLineId: 'prl-1', quantity: 1, unitPrice: 1000 }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: ErrorCode.VENDOR_UNAVAILABLE });
  });

  it('sets pending_approval when total meets threshold', async () => {
    org.getFull.mockResolvedValue({ poApprovalThreshold: 100_000 });
    vendors.findById.mockResolvedValue({ id: 'v1', status: 'active' });
    prisma.purchaseRequestLine.findUnique.mockResolvedValue({
      id: 'prl-1',
      prId: 'pr-1',
      itemId: 'item-1',
      itemDescription: 'Item',
      quantity: 10,
      poIssuedQuantity: 0,
      unitOfMeasureId: 'uom-1',
      purchaseRequest: { status: 'approved' },
      item: { id: 'item-1' },
    });
    prisma.purchaseOrder.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'po-1', ...data, lines: [] }),
    );

    const po = await service.createFromPrLines(
      {
        vendorId: 'v1',
        poDate: '2026-07-01',
        lines: [{ prLineId: 'prl-1', quantity: 10, unitPrice: 20_000 }],
      },
      'user-1',
    );

    expect(po.status).toBe('pending_approval');
    expect(po.totalAmount).toBeGreaterThanOrEqual(100_000);
  });
});
