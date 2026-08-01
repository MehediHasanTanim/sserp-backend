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
import { GrnService } from '../../src/modules/procurement/services/grn.service';
import { PurchaseOrderService } from '../../src/modules/procurement/services/purchase-order.service';
import { PrApprovalService } from '../../src/modules/procurement/services/pr-approval.service';
import { PurchaseRequestService } from '../../src/modules/procurement/services/purchase-request.service';
import { ensureOpenFiscalPeriod } from './helpers/payroll.helper';
import {
  COORDINATOR_ACTOR_ID,
  PRINCIPAL_ACTOR_ID,
  SUPPLY_ACTOR_ID,
  seedAssetItem,
  seedMainStore,
  seedVendor,
} from './helpers/supply-chain.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** GR-09 — GRN post rolls back fully when asset creation fails. */
describeIfDb('GRN atomicity integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let grns: GrnService;
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
    grns = app.get(GrnService);
    assets = app.get(AssetService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('rolls back PO update and journal when asset creation throws', async () => {
    await ensureOpenFiscalPeriod(prisma, 2026, 7);
    const prs = app.get(PurchaseRequestService);
    const approvals = app.get(PrApprovalService);
    const pos = app.get(PurchaseOrderService);

    const item = await seedAssetItem(prisma);
    const location = await seedMainStore(prisma);
    const vendor = await seedVendor(app);
    const uom = await prisma.unitOfMeasure.findFirstOrThrow({
      where: { code: 'EA' },
    });

    const pr = await prs.create(
      {
        justification: 'Asset GRN atomicity',
        lines: [
          {
            itemId: item.id,
            itemDescription: item.name,
            quantity: 1,
            unitOfMeasureId: uom.id,
            estimatedUnitCost: 500_000,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    await prs.submit(pr.id, SUPPLY_ACTOR_ID);
    await approvals.deptReview(pr.id, COORDINATOR_ACTOR_ID, ['coordinator'], {
      approved: true,
    });
    const approvedPr = await approvals.approve(
      pr.id,
      PRINCIPAL_ACTOR_ID,
      ['principal'],
      {},
    );

    const po = await pos.createFromPrLines(
      {
        vendorId: vendor.id,
        poDate: '2026-07-15',
        lines: [
          {
            prLineId: approvedPr.lines[0].id,
            quantity: 1,
            unitPrice: 500_000,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    const approvedPo =
      po.status === 'approved'
        ? po
        : await pos.approve(po.id, PRINCIPAL_ACTOR_ID, ['principal']);
    const sentPo = await pos.send(approvedPo.id);

    const grn = await grns.create(
      {
        poId: sentPo.id,
        receiptDate: '2026-07-18',
        receivedAtLocationId: location.id,
        lines: [
          {
            poLineId: sentPo.lines[0].id,
            receivedQuantity: 1,
            unitCost: 500_000,
          },
        ],
      },
      SUPPLY_ACTOR_ID,
    );
    await grns.qualityCheck(
      grn.id,
      SUPPLY_ACTOR_ID,
      grn.lines.map((l) => ({
        grnLineId: l.id,
        acceptedQuantity: 1,
        rejectedQuantity: 0,
      })),
    );

    const poLineBefore = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { id: sentPo.lines[0].id },
    });
    const receivedBefore = Number(poLineBefore.receivedQuantity);
    const movementCountBefore = await prisma.stockMovement.count({
      where: { referenceType: 'grn', referenceId: grn.id },
    });

    jest
      .spyOn(assets, 'createFromGrn')
      .mockRejectedValueOnce(new Error('Simulated asset failure'));

    await expect(grns.post(grn.id, SUPPLY_ACTOR_ID)).rejects.toThrow(
      /Simulated asset failure/,
    );

    const refreshedGrn = await prisma.goodsReceiptNote.findUniqueOrThrow({
      where: { id: grn.id },
    });
    expect(refreshedGrn.status).not.toBe('posted');
    expect(refreshedGrn.journalId).toBeNull();

    const poLineAfter = await prisma.purchaseOrderLine.findUniqueOrThrow({
      where: { id: sentPo.lines[0].id },
    });
    expect(Number(poLineAfter.receivedQuantity)).toBe(receivedBefore);

    const movementCountAfter = await prisma.stockMovement.count({
      where: { referenceType: 'grn', referenceId: grn.id },
    });
    expect(movementCountAfter).toBe(movementCountBefore);

    const assetCount = await prisma.asset.count({ where: { grnId: grn.id } });
    expect(assetCount).toBe(0);
  }, 120000);
});
