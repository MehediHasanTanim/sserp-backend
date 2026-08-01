import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCode } from '../../../shared/errors/domain-exception';
import { GrnService } from './grn.service';

describe('GrnService', () => {
  let service: GrnService;
  let prisma: any;
  let numbering: any;
  let org: any;
  let stockMovement: any;
  let assets: any;
  let ledger: any;
  let events: EventEmitter2;

  const grnId = 'grn-1';
  const poId = 'po-1';

  beforeEach(() => {
    numbering = { nextCode: jest.fn().mockResolvedValue('GRN-001') };
    org = {
      getFull: jest.fn().mockResolvedValue({
        grnOverDeliveryTolerancePercent: 0,
      }),
    };
    stockMovement = { receipt: jest.fn() };
    assets = { createFromGrn: jest.fn() };
    ledger = { post: jest.fn() };
    events = { emit: jest.fn() } as unknown as EventEmitter2;

    prisma = {
      purchaseOrder: { findUnique: jest.fn() },
      goodsReceiptNote: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      grnLine: {
        update: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      purchaseOrderLine: { update: jest.fn(), findMany: jest.fn() },
      item: { findUniqueOrThrow: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    service = new GrnService(
      prisma,
      numbering,
      org,
      stockMovement,
      assets,
      ledger,
      events,
    );
  });

  it('rejects double post', async () => {
    prisma.goodsReceiptNote.findUnique.mockResolvedValue({
      id: grnId,
      status: 'posted',
      lines: [],
      purchaseOrder: { id: poId, lines: [] },
    });

    await expect(service.post(grnId, 'user-1')).rejects.toMatchObject({
      code: ErrorCode.GRN_ALREADY_POSTED,
    });
  });

  it('rejects quality check when accepted + rejected ≠ received', async () => {
    prisma.goodsReceiptNote.findUnique.mockResolvedValue({
      id: grnId,
      status: 'draft',
      lines: [
        {
          id: 'line-1',
          receivedQuantity: 10,
          item: { tracksExpiry: false, tracksSerial: false },
          serialNumbers: [],
        },
      ],
      purchaseOrder: { lines: [] },
    });

    await expect(
      service.qualityCheck(grnId, 'user-1', [
        {
          grnLineId: 'line-1',
          acceptedQuantity: 6,
          rejectedQuantity: 3,
        },
      ]),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects over-receipt beyond tolerance on create', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: poId,
      status: 'sent',
      vendorId: 'v1',
      lines: [
        {
          id: 'pol-1',
          quantity: 10,
          receivedQuantity: 0,
          itemId: 'item-1',
        },
      ],
    });

    await expect(
      service.create(
        {
          poId,
          receiptDate: '2026-07-01',
          receivedAtLocationId: 'loc-1',
          lines: [{ poLineId: 'pol-1', receivedQuantity: 11, unitCost: 1000 }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: ErrorCode.EXCEEDS_ORDERED_QUANTITY });
  });
});
