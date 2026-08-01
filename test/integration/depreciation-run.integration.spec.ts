import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { AssetService } from '../../src/modules/inventory/services/asset.service';
import { AccountsOpsJob } from '../../src/modules/accounts/jobs/accounts-ops.job';
import { SUPPLY_ACTOR_ID, seedAssetItem } from './helpers/supply-chain.helper';
import { ensureOpenFiscalPeriod } from './helpers/payroll.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** AS-03/04 — monthly depreciation idempotency across 12 months × 20 assets. */
describeIfDb('Depreciation run integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let assets: AssetService;

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
    assets = app.get(AssetService);
    for (let m = 1; m <= 12; m += 1) {
      await ensureOpenFiscalPeriod(prisma, 2026, m);
    }
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('posts 12 monthly runs for 20 assets and repeats idempotently', async () => {
    const item = await seedAssetItem(prisma);

    const created = [];
    for (let i = 0; i < 20; i += 1) {
      created.push(
        await assets.create({
          itemId: item.id,
          name: `Depreciation test asset ${i}`,
          purchaseDate: '2026-01-15',
          purchaseCost: 1_200_000,
          usefulLifeMonths: 12,
          salvageValue: 0,
          depreciationMethod: 'straight_line',
        }),
      );
    }

    let totalProcessed = 0;
    for (let month = 1; month <= 12; month += 1) {
      const run = await assets.runDepreciation(2026, month);
      totalProcessed += run.processed;
    }

    expect(totalProcessed).toBeGreaterThan(0);

    const entries = await prisma.assetDepreciationEntry.findMany({
      where: { assetId: { in: created.map((a) => a.id) } },
    });
    expect(entries.length).toBeGreaterThanOrEqual(created.length);

    for (const asset of created) {
      const refreshed = await prisma.asset.findUniqueOrThrow({
        where: { id: asset.id },
      });
      expect(refreshed.netBookValue).toBeGreaterThanOrEqual(0);
      expect(refreshed.accumulatedDepreciation).toBeLessThanOrEqual(
        asset.purchaseCost,
      );
    }

    const journalCount = await prisma.journalEntry.count({
      where: {
        referenceType: 'asset_depreciation',
        referenceId: { in: created.map((a) => a.id) },
      },
    });

    const repeat = await assets.runDepreciation(2026, 12);
    expect(repeat.processed).toBe(0);

    const journalCountAfter = await prisma.journalEntry.count({
      where: {
        referenceType: 'asset_depreciation',
        referenceId: { in: created.map((a) => a.id) },
      },
    });
    expect(journalCountAfter).toBe(journalCount);

    const integrity = app.get(AccountsOpsJob);
    await expect(integrity.ledgerIntegrityCheck()).resolves.not.toThrow();
  }, 300000);
});
