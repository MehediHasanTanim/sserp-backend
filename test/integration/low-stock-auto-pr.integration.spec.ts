import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StockMovementService } from '../../src/modules/inventory/services/stock-movement.service';
import { LowStockCheckJob } from '../../src/modules/inventory/jobs/low-stock-check.job';
import { EventNames } from '../../src/shared/events/event-names';
import {
  AUTO_PR_MARKER,
  SUPPLY_ACTOR_ID,
  enableAutoPrOnLowStock,
  seedConsumableItem,
  seedMainStore,
  seedOpeningStock,
} from './helpers/supply-chain.helper';
import { ensureOpenFiscalPeriod } from './helpers/payroll.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** ST-09/ST-10 — one low-stock alert and one auto draft PR per crossing. */
describeIfDb('Low stock auto-PR integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let movements: StockMovementService;
  let lowStockJob: LowStockCheckJob;
  let events: EventEmitter2;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    movements = app.get(StockMovementService);
    lowStockJob = app.get(LowStockCheckJob);
    events = app.get(EventEmitter2);
    await ensureOpenFiscalPeriod(prisma, 2026, 7);
    await enableAutoPrOnLowStock(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma.organizationSettings.updateMany({
      data: { autoPrOnLowStockEnabled: false },
    });
    await app.close();
  });

  it('creates one alert and one draft PR; repeat crossing does not duplicate', async () => {
    const item = await seedConsumableItem(prisma, {
      minimumStockLevel: 10,
      reorderQuantity: 15,
    });
    const location = await seedMainStore(prisma);
    await seedOpeningStock(app, item.id, location.id, 15, 100_00);

    const emitSpy = jest.spyOn(events, 'emitAsync');

    await movements.issue({
      itemId: item.id,
      locationId: location.id,
      movementType: 'issue',
      quantity: 6,
      unitCost: 100_00,
      referenceType: 'issue_request',
      referenceId: randomUUID(),
      createdBy: SUPPLY_ACTOR_ID,
      costCenter: 'school',
    });

    await lowStockJob.handle();

    const lowEvents = emitSpy.mock.calls.filter(
      (c) => c[0] === EventNames.INVENTORY_STOCK_LOW,
    );
    expect(lowEvents.length).toBeGreaterThanOrEqual(1);

    const draftPrs = await prisma.purchaseRequest.findMany({
      where: {
        status: 'draft',
        justification: { contains: AUTO_PR_MARKER },
        lines: { some: { itemId: item.id } },
      },
    });
    expect(draftPrs).toHaveLength(1);

    await movements.issue({
      itemId: item.id,
      locationId: location.id,
      movementType: 'issue',
      quantity: 1,
      unitCost: 100_00,
      referenceType: 'issue_request',
      referenceId: randomUUID(),
      createdBy: SUPPLY_ACTOR_ID,
      costCenter: 'school',
    });

    await lowStockJob.handle();

    const draftPrsAfter = await prisma.purchaseRequest.findMany({
      where: {
        status: 'draft',
        justification: { contains: AUTO_PR_MARKER },
        lines: { some: { itemId: item.id } },
      },
    });
    expect(draftPrsAfter).toHaveLength(1);

    emitSpy.mockRestore();
  }, 120000);
});
