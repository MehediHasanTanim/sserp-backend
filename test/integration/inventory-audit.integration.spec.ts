import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { InventoryAuditService } from '../../src/modules/inventory/services/inventory-audit.service';
import { StockAdjustmentService } from '../../src/modules/inventory/services/stock-issue.service';
import {
  PRINCIPAL_ACTOR_ID,
  SUPPLY_ACTOR_ID,
  seedConsumableItem,
  seedOpeningStock,
} from './helpers/supply-chain.helper';
import { ensureOpenFiscalPeriod } from './helpers/payroll.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** IA-01–IA-07 — audit freeze, count, adjust, sign-off (INV-E2E-01). */
describeIfDb('Inventory audit integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audits: InventoryAuditService;
  let adjustments: StockAdjustmentService;

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
    audits = app.get(InventoryAuditService);
    adjustments = app.get(StockAdjustmentService);
    await ensureOpenFiscalPeriod(prisma, 2026, 7);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('reconciles surplus and shortage through adjustments to sign-off', async () => {
    const item = await seedConsumableItem(prisma);
    const location = await prisma.location.create({
      data: {
        name: `Audit Store ${Date.now()}`,
        locationType: 'store',
        isActive: true,
      },
    });
    await seedOpeningStock(app, item.id, location.id, 20, 100_00);

    const audit = await audits.create({
      auditType: 'ad_hoc',
      periodLabel: `Test ${Date.now()}`,
      scheduledDate: '2026-07-20',
      locationIds: [location.id],
      categoryIds: [item.categoryId],
    });

    const started = await audits.start(audit.id, SUPPLY_ACTOR_ID);
    expect(started.status).toBe('in_progress');
    expect(started.lines.length).toBe(1);

    const line = started.lines.find((l) => l.itemId === item.id)!;
    await audits.patchLines(
      audit.id,
      [
        {
          lineId: line.id,
          physicalQuantity: 18,
          explanation: 'Two units damaged during handling',
        },
      ],
      SUPPLY_ACTOR_ID,
    );

    const submitted = await audits.submit(audit.id, SUPPLY_ACTOR_ID);
    expect(submitted.status).toBe('counted');
    expect(submitted.discrepancyCount).toBe(1);

    const discrepancies = await audits.discrepancies(audit.id);
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0].discrepancyType).toBe('shortage');

    const { adjustments: created } = await audits.createAdjustments(
      audit.id,
      SUPPLY_ACTOR_ID,
    );
    expect(created.length).toBeGreaterThan(0);

    for (const adj of created) {
      await adjustments.approve(adj.id, PRINCIPAL_ACTOR_ID);
    }

    const levelAfterAdj = await prisma.stockLevel.findFirstOrThrow({
      where: { itemId: item.id, locationId: location.id },
    });
    expect(Number(levelAfterAdj.quantityOnHand)).toBe(18);

    const signed = await audits.signOff(audit.id, PRINCIPAL_ACTOR_ID);
    expect(signed.status).toBe('signed_off');
  }, 120000);
});
