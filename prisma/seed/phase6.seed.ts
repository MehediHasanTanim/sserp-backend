import { PrismaClient } from '@prisma/client';

/**
 * Phase 6 CoA leaves + posting rules.
 * Cash/bank use existing 1120/1130 (Phase 4); trade AP uses 2010.
 * Retires Phase 4 vendor_invoice stub (5400/2100).
 */
const COA: Array<{
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normal: 'debit' | 'credit';
  isGroup?: boolean;
  parent?: string;
  allowManual?: boolean;
}> = [
  { code: '1320', name: 'Vendor Advances', type: 'asset', normal: 'debit', parent: '1300', allowManual: false },
  { code: '1400', name: 'Inventory Assets', type: 'asset', normal: 'debit', isGroup: true, parent: '1000' },
  { code: '1410', name: 'Inventory', type: 'asset', normal: 'debit', parent: '1400', allowManual: false },
  { code: '1450', name: 'Input Tax Receivable', type: 'asset', normal: 'debit', parent: '1400' },
  { code: '1500', name: 'Fixed Assets Group', type: 'asset', normal: 'debit', isGroup: true, parent: '1000' },
  { code: '1510', name: 'Fixed Assets', type: 'asset', normal: 'debit', parent: '1500', allowManual: false },
  { code: '1520', name: 'Accumulated Depreciation', type: 'asset', normal: 'credit', parent: '1500', allowManual: false },
  { code: '2010', name: 'Trade Accounts Payable', type: 'liability', normal: 'credit', parent: '2000', allowManual: false },
  { code: '2020', name: 'GRN Clearing', type: 'liability', normal: 'credit', parent: '2000', allowManual: false },
  { code: '4090', name: 'Gain on Asset Disposal', type: 'revenue', normal: 'credit', parent: '4000' },
  { code: '5040', name: 'Consumables Expense', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5045', name: 'Inventory Gain', type: 'expense', normal: 'credit', parent: '5000' },
  { code: '5046', name: 'Inventory Loss', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5050', name: 'Depreciation Expense', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5055', name: 'Loss on Asset Disposal', type: 'expense', normal: 'debit', parent: '5000' },
];

const POSTING_RULES: Array<{
  referenceType: string;
  variant?: string;
  debit: string;
  credit: string;
  costCenter?: string;
  description: string;
}> = [
  { referenceType: 'grn_posted', variant: 'consumable', debit: '1410', credit: '2020', description: 'GRN consumable receipt' },
  { referenceType: 'grn_posted', variant: 'asset', debit: '1510', credit: '2020', description: 'GRN asset receipt' },
  { referenceType: 'vendor_invoice', debit: '2020', credit: '2010', costCenter: 'admin', description: 'Vendor invoice clears GRN clearing to AP' },
  { referenceType: 'vendor_invoice', variant: 'with_tax', debit: '2020', credit: '2010', costCenter: 'admin', description: 'Vendor invoice (tax handled in multi-line journal)' },
  { referenceType: 'vendor_payment', variant: 'cash', debit: '2010', credit: '1120', costCenter: 'admin', description: 'Vendor payment cash' },
  { referenceType: 'vendor_payment', variant: 'bank_transfer', debit: '2010', credit: '1130', costCenter: 'admin', description: 'Vendor payment bank' },
  { referenceType: 'vendor_advance', debit: '1320', credit: '1130', costCenter: 'admin', description: 'Vendor advance' },
  { referenceType: 'stock_issue', debit: '5040', credit: '1410', description: 'Stock issue to department' },
  { referenceType: 'stock_adjustment', variant: 'increase', debit: '1410', credit: '5045', costCenter: 'admin', description: 'Stock adjustment increase' },
  { referenceType: 'stock_adjustment', variant: 'decrease', debit: '5046', credit: '1410', costCenter: 'admin', description: 'Stock adjustment decrease' },
  { referenceType: 'asset_depreciation', debit: '5050', credit: '1520', description: 'Monthly depreciation' },
  { referenceType: 'asset_disposal', variant: 'gain', debit: '1520', credit: '1510', costCenter: 'admin', description: 'Asset disposal (multi-line via AccountsService)' },
  { referenceType: 'asset_disposal', variant: 'loss', debit: '1520', credit: '1510', costCenter: 'admin', description: 'Asset disposal loss path' },
];

const CATEGORIES = [
  { name: 'Therapy Tools & Instruments', isAssetCategory: true, defaultCoaExpenseCode: '5040', defaultCoaAssetCode: '1510' },
  { name: 'Office Equipment', isAssetCategory: true, defaultCoaExpenseCode: '5040', defaultCoaAssetCode: '1510' },
  { name: 'Furniture', isAssetCategory: true, defaultCoaExpenseCode: '5040', defaultCoaAssetCode: '1510' },
  { name: 'IT Equipment', isAssetCategory: true, defaultCoaExpenseCode: '5040', defaultCoaAssetCode: '1510' },
  { name: 'Consumables', isAssetCategory: false, defaultCoaExpenseCode: '5040', defaultCoaAssetCode: null },
  { name: 'Stationery', isAssetCategory: false, defaultCoaExpenseCode: '5040', defaultCoaAssetCode: null },
];

const UOMS = [
  { code: 'EA', name: 'Each', allowsFraction: false },
  { code: 'BOX', name: 'Box', allowsFraction: false },
  { code: 'KG', name: 'Kilogram', allowsFraction: true },
  { code: 'LTR', name: 'Litre', allowsFraction: true },
  { code: 'SET', name: 'Set', allowsFraction: false },
];

export async function seedPhase6(prisma: PrismaClient) {
  console.log('Seeding Phase 6: inventory CoA, categories, posting rules...');

  const idByCode = new Map<string, string>();
  for (const row of await prisma.chartOfAccount.findMany()) {
    idByCode.set(row.accountCode, row.id);
  }

  for (const row of COA) {
    const existing = await prisma.chartOfAccount.findUnique({
      where: { accountCode: row.code },
    });
    if (existing) {
      idByCode.set(row.code, existing.id);
      continue;
    }
    const parentId = row.parent ? idByCode.get(row.parent) : null;
    if (row.parent && !parentId) {
      console.warn(`Phase 6 CoA skip ${row.code}: missing parent ${row.parent}`);
      continue;
    }
    const parent = parentId
      ? await prisma.chartOfAccount.findUnique({ where: { id: parentId } })
      : null;
    const level = parent ? parent.level + 1 : 1;
    const path = parent ? `${parent.path}/${row.code}` : row.code;
    const created = await prisma.chartOfAccount.create({
      data: {
        accountCode: row.code,
        accountName: row.name,
        accountType: row.type,
        normalBalance: row.normal,
        isGroup: row.isGroup ?? false,
        parentId: parentId ?? undefined,
        allowManualPosting: row.allowManual ?? true,
        isActive: true,
        level,
        path,
      },
    });
    idByCode.set(row.code, created.id);
  }

  // Retire Phase 4 vendor_invoice stub (5400/2100)
  await prisma.postingRule.updateMany({
    where: {
      referenceType: 'vendor_invoice',
      debitAccountCode: '5400',
      creditAccountCode: '2100',
    },
    data: { isActive: false },
  });

  for (const rule of POSTING_RULES) {
    await prisma.postingRule.upsert({
      where: {
        referenceType_variant: {
          referenceType: rule.referenceType,
          variant: rule.variant ?? '',
        },
      },
      create: {
        referenceType: rule.referenceType,
        variant: rule.variant ?? '',
        debitAccountCode: rule.debit,
        creditAccountCode: rule.credit,
        costCenter: rule.costCenter,
        description: rule.description,
        isActive: true,
      },
      update: {
        debitAccountCode: rule.debit,
        creditAccountCode: rule.credit,
        costCenter: rule.costCenter,
        description: rule.description,
        isActive: true,
      },
    });
  }

  for (const c of CATEGORIES) {
    const existing = await prisma.itemCategory.findFirst({
      where: { name: c.name },
    });
    if (!existing) {
      await prisma.itemCategory.create({
        data: {
          name: c.name,
          isAssetCategory: c.isAssetCategory,
          defaultCoaExpenseCode: c.defaultCoaExpenseCode,
          defaultCoaAssetCode: c.defaultCoaAssetCode ?? undefined,
          isActive: true,
        },
      });
    }
  }

  for (const u of UOMS) {
    await prisma.unitOfMeasure.upsert({
      where: { code: u.code },
      create: u,
      update: { name: u.name, allowsFraction: u.allowsFraction },
    });
  }

  const mainStore = await prisma.location.findFirst({
    where: { name: 'Main Store' },
  });
  if (!mainStore) {
    await prisma.location.create({
      data: {
        name: 'Main Store',
        locationType: 'store',
        isActive: true,
      },
    });
  }

  for (const entity of [
    { entityType: 'item', prefix: 'ITM-', padding: 5 },
    { entityType: 'stock_movement', prefix: 'SM-', padding: 6 },
    { entityType: 'stock_adjustment', prefix: 'SA-', padding: 5 },
    { entityType: 'stock_issue', prefix: 'SI-', padding: 5 },
    { entityType: 'asset', prefix: 'AST-', padding: 5 },
    { entityType: 'inventory_audit', prefix: 'AUD-', padding: 5 },
    { entityType: 'vendor', prefix: 'VEN-', padding: 5 },
    { entityType: 'vendor_invoice', prefix: 'VIN-', padding: 5 },
    { entityType: 'vendor_payment', prefix: 'VP-', padding: 5 },
  ]) {
    await prisma.numberingScheme.upsert({
      where: { entityType: entity.entityType },
      create: { ...entity, currentSequence: 0, resetPeriod: 'never' },
      update: {},
    });
  }

  console.log('Phase 6 seed complete.');
}
