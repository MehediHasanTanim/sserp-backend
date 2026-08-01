import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StockMovementService } from '../../src/modules/inventory/services/stock-movement.service';
import { ErrorCode } from '../../src/shared/errors/domain-exception';
import {
  SUPPLY_ACTOR_ID,
  seedConsumableItem,
  seedMainStore,
  seedOpeningStock,
} from './helpers/supply-chain.helper';
import { ensureOpenFiscalPeriod } from './helpers/payroll.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** ST-02/03 — row lock prevents oversell under concurrency. */
describeIfDb('Stock concurrency integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let movements: StockMovementService;

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
    await ensureOpenFiscalPeriod(prisma, 2026, 7);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  async function runParallelIssueRace() {
    const item = await seedConsumableItem(prisma);
    const location = await seedMainStore(prisma);
    await seedOpeningStock(app, item.id, location.id, 6, 100_00);

    const attempts = Array.from({ length: 10 }, () =>
      movements
        .issue({
          itemId: item.id,
          locationId: location.id,
          movementType: 'issue',
          quantity: 1,
          unitCost: 100_00,
          referenceType: 'issue_request',
          referenceId: randomUUID(),
          createdBy: SUPPLY_ACTOR_ID,
          costCenter: 'school',
        })
        .then(() => ({ ok: true as const }))
        .catch((e) => ({ ok: false as const, code: e?.code })),
    );

    const results = await Promise.all(attempts);
    const ok = results.filter((r) => r.ok);
    const insufficient = results.filter(
      (r) => !r.ok && r.code === ErrorCode.INSUFFICIENT_STOCK,
    );
    const otherFailures = results.filter(
      (r) => !r.ok && r.code !== ErrorCode.INSUFFICIENT_STOCK,
    );
    if (otherFailures.length) {
      throw new Error(
        `Unexpected issue failures: ${JSON.stringify(otherFailures)}`,
      );
    }

    const level = await prisma.stockLevel.findFirstOrThrow({
      where: { itemId: item.id, locationId: location.id },
    });

    return {
      ok: ok.length,
      insufficient: insufficient.length,
      onHand: Number(level.quantityOnHand),
    };
  }

  it('allows 6 issues and rejects 4 when stock is 6', async () => {
    const result = await runParallelIssueRace();
    expect(result.ok).toBe(6);
    expect(result.insufficient).toBe(4);
    expect(result.onHand).toBe(0);
  }, 120000);

  describe('exit criteria — 20 consecutive runs', () => {
    it('never leaves negative stock', async () => {
      for (let run = 0; run < 20; run += 1) {
        const result = await runParallelIssueRace();
        expect(result.ok).toBe(6);
        expect(result.insufficient).toBe(4);
        expect(result.onHand).toBeGreaterThanOrEqual(0);
      }
    }, 600000);
  });
});
