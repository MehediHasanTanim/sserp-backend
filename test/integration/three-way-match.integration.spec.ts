import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { VendorInvoiceService } from '../../src/modules/procurement/services/vendor-invoice.service';
import { ErrorCode } from '../../src/shared/errors/domain-exception';
import {
  SUPPLY_ACTOR_ID,
  expectDomainCode,
  runPrPoGrnChain,
} from './helpers/supply-chain.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** TW-03/TW-05 — variance block and principal override on invoice approval. */
describeIfDb('Three-way match integration', () => {
  let app: INestApplication;
  let invoices: VendorInvoiceService;

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
    invoices = app.get(VendorInvoiceService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('blocks out-of-tolerance invoice until principal override', async () => {
    const chain = await runPrPoGrnChain(app);
    const poUnit = 100_00;
    const inflatedUnit = Math.round(poUnit * 1.05);

    const invoice = await invoices.create({
      vendorId: chain.vendor.id,
      poId: chain.po.id,
      grnIds: [chain.grn.id],
      invoiceDate: '2026-07-21',
      dueDate: '2026-08-21',
      lines: [
        {
          poLineId: chain.po.lines[0].id,
          grnLineId: chain.grn.lines[0].id,
          description: chain.item.name,
          quantity: 10,
          unitPrice: inflatedUnit,
        },
      ],
    });

    const match = await invoices.runMatch(invoice.id);
    expect(match.blocked).toBe(true);
    expect(match.matchStatus).toBe('variance_exceeded');

    await expectDomainCode(
      () => invoices.approve(invoice.id, SUPPLY_ACTOR_ID),
      ErrorCode.INVOICE_VARIANCE_EXCEEDED,
    );

    const approved = await invoices.approve(invoice.id, SUPPLY_ACTOR_ID, {
      principalOverrideReason: 'Vendor price adjustment agreed by principal',
    });
    expect(approved.status).toBe('approved');
    expect(approved.journalId).toBeTruthy();
  }, 120000);
});
