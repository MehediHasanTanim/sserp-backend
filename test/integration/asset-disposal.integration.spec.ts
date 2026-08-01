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
import { PRINCIPAL_ACTOR_ID } from './helpers/supply-chain.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** AS-05 — disposal journals balance with gain and loss paths. */
describeIfDb('Asset disposal integration', () => {
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
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  async function assertBalancedJournal(journalId: string) {
    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: journalId },
      include: { lines: true },
    });
    expect(journal.status).toBe('posted');
    expect(journal.totalDebit).toBe(journal.totalCredit);
  }

  it('posts balanced journals for gain and loss disposals', async () => {
    const item = await prisma.item.findFirstOrThrow({
      where: { itemNature: 'asset', deletedAt: null },
    });

    const gainAsset = await assets.create({
      itemId: item.id,
      name: 'Disposal gain asset',
      purchaseDate: '2025-01-01',
      purchaseCost: 100_000,
      usefulLifeMonths: 60,
      salvageValue: 10_000,
      depreciationMethod: 'straight_line',
    });
    await assets.runDepreciation(2026, 6);
    const gainRefreshed = await prisma.asset.findUniqueOrThrow({
      where: { id: gainAsset.id },
    });

    const gainDisposal = await assets.dispose(
      gainAsset.id,
      {
        disposalDate: '2026-07-15',
        disposalType: 'sale',
        proceedsAmount: gainRefreshed.netBookValue + 5_000,
        reason: 'Sold surplus equipment',
      },
      PRINCIPAL_ACTOR_ID,
    );
    expect(gainDisposal.gainLossAmount).toBeGreaterThan(0);
    await assertBalancedJournal(gainDisposal.journalId!);

    const lossAsset = await assets.create({
      itemId: item.id,
      name: 'Disposal loss asset',
      purchaseDate: '2025-01-01',
      purchaseCost: 80_000,
      usefulLifeMonths: 48,
      salvageValue: 0,
      depreciationMethod: 'straight_line',
    });
    await assets.runDepreciation(2026, 6);
    const lossRefreshed = await prisma.asset.findUniqueOrThrow({
      where: { id: lossAsset.id },
    });

    const lossDisposal = await assets.dispose(
      lossAsset.id,
      {
        disposalDate: '2026-07-16',
        disposalType: 'scrap',
        proceedsAmount: Math.max(0, lossRefreshed.netBookValue - 3_000),
        reason: 'Scrapped damaged unit',
      },
      PRINCIPAL_ACTOR_ID,
    );
    expect(lossDisposal.gainLossAmount).toBeLessThanOrEqual(0);
    await assertBalancedJournal(lossDisposal.journalId!);

    const integrity = app.get(AccountsOpsJob);
    await expect(integrity.ledgerIntegrityCheck()).resolves.not.toThrow();
  }, 180000);
});
