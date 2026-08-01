import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { AccountsOpsJob } from '../../src/modules/accounts/jobs/accounts-ops.job';
import { runPrPoGrnChain } from './helpers/supply-chain.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * PR-01–GR-09 — full PR → PO → GRN chain with balanced journals.
 * See docs/plan/backend/07-phase6-inventory-procurement.md §10.
 */
describeIfDb('PR-PO-GRN chain integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('runs PR approval, PO send, GRN post with stock and journal', async () => {
    const chain = await runPrPoGrnChain(app);

    const level = await prisma.stockLevel.findFirst({
      where: {
        itemId: chain.item.id,
        locationId: chain.location.id,
      },
    });
    expect(level).toBeTruthy();
    expect(Number(level!.quantityOnHand)).toBe(10);

    const poLine = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { id: chain.po.lines[0].id },
    });
    expect(Number(poLine.receivedQuantity)).toBe(10);

    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: chain.grn.journalId! },
      include: { lines: true },
    });
    expect(journal.status).toBe('posted');
    expect(journal.totalDebit).toBe(journal.totalCredit);

    const integrity = app.get(AccountsOpsJob);
    await expect(integrity.ledgerIntegrityCheck()).resolves.not.toThrow();
  }, 120000);
});
