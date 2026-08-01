import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/shared/prisma/prisma.service';
import { VendorService } from '../../../src/modules/procurement/services/vendor.service';
import { PurchaseRequestService } from '../../../src/modules/procurement/services/purchase-request.service';
import { PrApprovalService } from '../../../src/modules/procurement/services/pr-approval.service';
import { PurchaseOrderService } from '../../../src/modules/procurement/services/purchase-order.service';
import { GrnService } from '../../../src/modules/procurement/services/grn.service';
import { VendorInvoiceService } from '../../../src/modules/procurement/services/vendor-invoice.service';
import { StockMovementService } from '../../../src/modules/inventory/services/stock-movement.service';
import {
  DomainException,
  ErrorCode,
} from '../../../src/shared/errors/domain-exception';
import { ensureOpenFiscalPeriod } from './payroll.helper';

export const SUPPLY_ACTOR_ID = '00000000-0000-4000-8000-000000000002';
export const PRINCIPAL_ACTOR_ID = '00000000-0000-4000-8000-000000000003';
export const COORDINATOR_ACTOR_ID = '00000000-0000-4000-8000-000000000004';
export const AUTO_PR_MARKER = 'Auto-reorder (low stock)';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

export async function seedConsumableItem(
  prisma: PrismaService,
  overrides?: {
    minimumStockLevel?: number;
    reorderQuantity?: number;
    standardCost?: number;
  },
) {
  const category = await prisma.itemCategory.findFirstOrThrow({
    where: { name: 'Consumables' },
  });
  const uom = await prisma.unitOfMeasure.findFirstOrThrow({
    where: { code: 'EA' },
  });
  const code = `ITM-${randomUUID().slice(0, 8)}`;
  return prisma.item.create({
    data: {
      itemCode: code,
      name: `Test consumable ${code}`,
      categoryId: category.id,
      unitOfMeasureId: uom.id,
      itemNature: 'consumable',
      valuationMethod: 'weighted_average',
      minimumStockLevel: overrides?.minimumStockLevel ?? 0,
      reorderQuantity: overrides?.reorderQuantity ?? 10,
      standardCost: overrides?.standardCost ?? 100_00,
      isActive: true,
    },
  });
}

export async function seedAssetItem(prisma: PrismaService) {
  const category = await prisma.itemCategory.findFirstOrThrow({
    where: { name: 'Office Equipment' },
  });
  const uom = await prisma.unitOfMeasure.findFirstOrThrow({
    where: { code: 'EA' },
  });
  const code = `AST-${randomUUID().slice(0, 8)}`;
  return prisma.item.create({
    data: {
      itemCode: code,
      name: `Test asset ${code}`,
      categoryId: category.id,
      unitOfMeasureId: uom.id,
      itemNature: 'asset',
      valuationMethod: 'weighted_average',
      minimumStockLevel: 0,
      isActive: true,
    },
  });
}

export async function seedOpeningStock(
  app: INestApplication,
  itemId: string,
  locationId: string,
  quantity: number,
  unitCost = 100_00,
  actorId = SUPPLY_ACTOR_ID,
) {
  const movements = app.get(StockMovementService);
  return movements.receipt({
    itemId,
    locationId,
    movementType: 'opening',
    quantity,
    unitCost,
    referenceType: 'opening',
    referenceId: randomUUID(),
    movementDate: '2026-07-01',
    createdBy: actorId,
  });
}

export async function enableAutoPrOnLowStock(prisma: PrismaService) {
  return prisma.organizationSettings.update({
    where: { id: ORG_ID },
    data: { autoPrOnLowStockEnabled: true },
  });
}

export async function seedTightBudgetLine(
  prisma: PrismaService,
  allocatedAmount = 100_00,
) {
  const account = await prisma.chartOfAccount.findFirstOrThrow({
    where: { accountCode: '5040' },
  });
  const budget = await prisma.budget.create({
    data: {
      fiscalYear: '2026',
      name: `Test budget ${randomUUID().slice(0, 6)}`,
      costCenter: 'admin',
      status: 'approved',
      version: 1,
      totalAmount: allocatedAmount,
      enforcementMode: 'block',
      createdBy: SUPPLY_ACTOR_ID,
      approvedBy: PRINCIPAL_ACTOR_ID,
      approvedAt: new Date(),
      lines: {
        create: {
          accountId: account.id,
          periodMonth: 7,
          allocatedAmount,
        },
      },
    },
    include: { lines: true },
  });
  return budget.lines[0];
}

/** Assert DomainException code without failing the suite on unexpected errors. */
export async function expectDomainCode(
  fn: () => Promise<unknown>,
  code: ErrorCode,
) {
  try {
    await fn();
    throw new Error(`Expected DomainException ${code}`);
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.startsWith('Expected DomainException')
    ) {
      throw e;
    }
    expect(e).toMatchObject({ code });
  }
}

export async function seedMainStore(prisma: PrismaService) {
  const existing = await prisma.location.findFirst({
    where: { name: 'Main Store' },
  });
  if (existing) return existing;
  return prisma.location.create({
    data: { name: 'Main Store', locationType: 'store', isActive: true },
  });
}

export async function seedVendor(app: INestApplication) {
  const vendors = app.get(VendorService);
  return vendors.create(
    {
      name: `Vendor ${randomUUID().slice(0, 6)}`,
      vendorType: 'supplier',
      paymentTermsDays: 30,
    },
    SUPPLY_ACTOR_ID,
  );
}

export async function runPrPoGrnChain(app: INestApplication) {
  const prisma = app.get(PrismaService);
  const prs = app.get(PurchaseRequestService);
  const approvals = app.get(PrApprovalService);
  const pos = app.get(PurchaseOrderService);
  const grns = app.get(GrnService);

  await ensureOpenFiscalPeriod(prisma, 2026, 7);

  const item = await seedConsumableItem(prisma);
  const location = await seedMainStore(prisma);
  const vendor = await seedVendor(app);
  const uom = await prisma.unitOfMeasure.findFirstOrThrow({
    where: { code: 'EA' },
  });

  const pr = await prs.create(
    {
      justification: 'Integration test PR',
      lines: [
        {
          itemId: item.id,
          itemDescription: item.name,
          quantity: 10,
          unitOfMeasureId: uom.id,
          estimatedUnitCost: 100_00,
        },
      ],
    },
    SUPPLY_ACTOR_ID,
  );

  await prs.submit(pr.id, SUPPLY_ACTOR_ID);
  await approvals.deptReview(pr.id, COORDINATOR_ACTOR_ID, ['coordinator'], {
    approved: true,
    comment: 'Dept OK',
  });
  const approvedPr = await approvals.approve(
    pr.id,
    PRINCIPAL_ACTOR_ID,
    ['principal'],
    { comment: 'Approved' },
  );

  const po = await pos.createFromPrLines(
    {
      vendorId: vendor.id,
      poDate: '2026-07-15',
      expectedDeliveryDate: '2026-07-20',
      lines: [
        {
          prLineId: approvedPr.lines[0].id,
          quantity: 10,
          unitPrice: 100_00,
        },
      ],
    },
    SUPPLY_ACTOR_ID,
  );

  const sendable =
    po.status === 'approved'
      ? po
      : await pos.approve(po.id, PRINCIPAL_ACTOR_ID, ['principal']);
  const sent = await pos.send(sendable.id);

  const grn = await grns.create(
    {
      poId: sent.id,
      receiptDate: '2026-07-18',
      receivedAtLocationId: location.id,
      lines: [
        {
          poLineId: sent.lines[0].id,
          receivedQuantity: 10,
          unitCost: 100_00,
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
      acceptedQuantity: Number(l.receivedQuantity),
      rejectedQuantity: 0,
    })),
  );

  const posted = await grns.post(grn.id, SUPPLY_ACTOR_ID);

  return { pr: approvedPr, po: sent, grn: posted, vendor, item, location };
}

export async function approveInvoiceForGrn(
  app: INestApplication,
  chain: Awaited<ReturnType<typeof runPrPoGrnChain>>,
) {
  const invoices = app.get(VendorInvoiceService);
  const invoice = await invoices.create({
    vendorId: chain.vendor.id,
    poId: chain.po.id,
    grnIds: [chain.grn.id],
    invoiceDate: '2026-07-20',
    dueDate: '2026-08-20',
    lines: [
      {
        poLineId: chain.po.lines[0].id,
        grnLineId: chain.grn.lines[0].id,
        description: chain.item.name,
        quantity: 10,
        unitPrice: 100_00,
      },
    ],
  });

  const match = await invoices.runMatch(invoice.id);

  return {
    invoice,
    match,
    approve: () => invoices.approve(invoice.id, SUPPLY_ACTOR_ID),
  };
}

/** Outstanding GRN clearing liability (credit − debit) for given journal reference IDs. */
export async function grnClearingBalance(
  prisma: PrismaService,
  referenceIds: string[],
) {
  const clearing = await prisma.chartOfAccount.findUnique({
    where: { accountCode: '2020' },
  });
  if (!clearing || referenceIds.length === 0) return 0;
  const agg = await prisma.journalLine.aggregate({
    where: {
      accountId: clearing.id,
      journal: {
        status: 'posted',
        referenceId: { in: referenceIds },
      },
    },
    _sum: { debitAmount: true, creditAmount: true },
  });
  return (agg._sum.creditAmount ?? 0) - (agg._sum.debitAmount ?? 0);
}
