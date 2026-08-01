import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import {
  runPrPoGrnChain,
  approveInvoiceForGrn,
  grnClearingBalance,
} from './helpers/supply-chain.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * TW-04 / ADR 0004 — GRN clearing (2020) nets to zero after invoice approval.
 */
describeIfDb('GRN clearing integration', () => {
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

  it('nets GRN clearing to zero after invoice approval', async () => {
    const chain = await runPrPoGrnChain(app);
    const afterGrn = await grnClearingBalance(prisma, [chain.grn.id]);
    expect(afterGrn).toBeGreaterThan(0);

    const { invoice, match, approve } = await approveInvoiceForGrn(app, chain);
    expect(match.blocked).toBe(false);

    const approved = await approve();
    expect(approved.status).toBe('approved');

    const afterInvoice = await grnClearingBalance(prisma, [
      chain.grn.id,
      invoice.id,
    ]);
    expect(afterInvoice).toBe(0);
  }, 120000);
});
