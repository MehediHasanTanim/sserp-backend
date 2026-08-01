import { ErrorCode } from '../../../shared/errors/domain-exception';
import { StockMovementService } from './stock-movement.service';

describe('StockMovementService', () => {
  let service: StockMovementService;
  let prisma: any;
  let numbering: any;
  let ledger: any;
  let events: any;

  const itemId = 'item-1';
  const locationId = 'loc-1';
  const actorId = 'user-1';

  beforeEach(() => {
    numbering = { nextCode: jest.fn().mockResolvedValue('SM-000001') };
    ledger = { post: jest.fn().mockResolvedValue({ journalId: 'j1' }) };
    events = { emitAsync: jest.fn() };

    prisma = {
      item: {
        findFirst: jest.fn().mockResolvedValue({
          id: itemId,
          deletedAt: null,
          minimumStockLevel: 5,
          valuationMethod: 'weighted_average',
          tracksExpiry: false,
          unitOfMeasure: { allowsFraction: false },
        }),
      },
      stockBatch: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      stockLevel: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'mov-1',
            movementNumber: 'SM-000001',
            movementDate: new Date(),
            ...data,
          }),
        ),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
      $queryRaw: jest.fn(),
    };

    service = new StockMovementService(prisma, numbering, ledger, events);
  });

  function mockLevel(qty: number, avg = 1000) {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'lvl-1',
        quantity_on_hand: qty,
        average_cost: avg,
      },
    ]);
  }

  it('rejects issue when insufficient stock (ST-03)', async () => {
    mockLevel(2);
    await expect(
      service.issue({
        itemId,
        locationId,
        movementType: 'issue',
        quantity: 5,
        unitCost: 1000,
        referenceType: 'issue_request',
        createdBy: actorId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_STOCK });
  });

  it('adjustIncrease updates stock level via public API', async () => {
    mockLevel(10);
    await service.adjustIncrease({
      itemId,
      locationId,
      movementType: 'adjustment_increase',
      quantity: 3,
      unitCost: 500,
      referenceType: 'adjustment',
      referenceId: 'adj-1',
      createdBy: actorId,
    });

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'adjustment_increase',
          quantity: 3,
        }),
      }),
    );
    expect(prisma.stockLevel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ quantityOnHand: 13 }),
      }),
    );
  });

  it('transfer conserves total quantity across locations (ST-07 sketch)', async () => {
    const fromId = 'loc-from';
    const toId = 'loc-to';
    let call = 0;
    prisma.$queryRaw.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve([
          { id: 'l1', quantity_on_hand: 10, average_cost: 100 },
        ]);
      }
      return Promise.resolve([
        { id: 'l2', quantity_on_hand: 4, average_cost: 100 },
      ]);
    });

    await service.transfer(itemId, fromId, toId, 3, actorId);

    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
    const upserts = prisma.stockLevel.upsert.mock.calls.map(
      (c: any[]) => c[0].update.quantityOnHand,
    );
    expect(upserts).toContain(7);
    expect(upserts).toContain(7);
  });

  it('rejects fractional quantity for whole-unit items (ST-04)', async () => {
    mockLevel(10);
    await expect(
      service.issue({
        itemId,
        locationId,
        movementType: 'issue',
        quantity: 1.5,
        unitCost: 100,
        referenceType: 'issue_request',
        createdBy: actorId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});
