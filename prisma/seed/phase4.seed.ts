import { PrismaClient } from '@prisma/client';

const COA: Array<{
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normal: 'debit' | 'credit';
  isGroup?: boolean;
  parent?: string;
  allowManual?: boolean;
}> = [
  { code: '1000', name: 'Assets', type: 'asset', normal: 'debit', isGroup: true },
  { code: '1100', name: 'Cash & Bank', type: 'asset', normal: 'debit', isGroup: true, parent: '1000' },
  { code: '1110', name: 'Petty Cash', type: 'asset', normal: 'debit', parent: '1100' },
  { code: '1120', name: 'Cash in Hand', type: 'asset', normal: 'debit', parent: '1100' },
  { code: '1130', name: 'Bank Current Account', type: 'asset', normal: 'debit', parent: '1100' },
  { code: '1200', name: 'Accounts Receivable', type: 'asset', normal: 'debit', isGroup: true, parent: '1000' },
  { code: '1210', name: 'AR Students', type: 'asset', normal: 'debit', parent: '1200', allowManual: false },
  { code: '1220', name: 'AR Patients', type: 'asset', normal: 'debit', parent: '1200', allowManual: false },
  { code: '2000', name: 'Liabilities', type: 'liability', normal: 'credit', isGroup: true },
  { code: '2100', name: 'Accounts Payable', type: 'liability', normal: 'credit', parent: '2000' },
  { code: '2200', name: 'Tax Payable', type: 'liability', normal: 'credit', parent: '2000' },
  { code: '3000', name: 'Equity', type: 'equity', normal: 'credit', isGroup: true },
  { code: '3100', name: 'Share Capital', type: 'equity', normal: 'credit', parent: '3000' },
  { code: '3200', name: 'Retained Earnings', type: 'equity', normal: 'credit', parent: '3000' },
  { code: '3300', name: 'General Reserve', type: 'equity', normal: 'credit', parent: '3000' },
  { code: '4000', name: 'Revenue', type: 'revenue', normal: 'credit', isGroup: true },
  { code: '4100', name: 'Therapy Income', type: 'revenue', normal: 'credit', parent: '4000' },
  { code: '4200', name: 'Tuition Income', type: 'revenue', normal: 'credit', parent: '4000' },
  { code: '4300', name: 'Admission Fee Income', type: 'revenue', normal: 'credit', parent: '4000' },
  { code: '4400', name: 'Activity Income', type: 'revenue', normal: 'credit', parent: '4000' },
  { code: '5000', name: 'Expenses', type: 'expense', normal: 'debit', isGroup: true },
  { code: '5100', name: 'Fee Waiver Expense', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5200', name: 'Bad Debt Expense', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5300', name: 'Payroll Expense', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5400', name: 'Operating Expense', type: 'expense', normal: 'debit', parent: '5000' },
];

/** Map legacy literal codes used in Phase 1–3 to seeded leaf accounts */
const LEGACY_CODE_MAP: Record<string, string> = {
  '1000': '1120',
  '1100': '1130',
  '1200': '1210',
  '4001': '4300',
  '4002': '4200',
  '4005': '4400',
  '4100': '4100',
  '5100': '5100',
};

const POSTING_RULES: Array<{
  referenceType: string;
  variant?: string;
  debit: string;
  credit: string;
  costCenter?: string;
  description: string;
}> = [
  { referenceType: 'admission_fee', debit: '1210', credit: '4300', costCenter: 'school', description: 'Admission fee invoice' },
  { referenceType: 'admission_fee', variant: 'cash', debit: '1120', credit: '1210', costCenter: 'school', description: 'Admission fee cash receipt' },
  { referenceType: 'admission_fee', variant: 'bank_transfer', debit: '1130', credit: '1210', costCenter: 'school', description: 'Admission fee bank receipt' },
  { referenceType: 'admission_fee', variant: 'waiver', debit: '5100', credit: '1210', costCenter: 'school', description: 'Admission fee waiver' },
  { referenceType: 'fee_invoice', debit: '1210', credit: '4200', costCenter: 'school', description: 'Tuition / activity invoice' },
  { referenceType: 'fee_payment', variant: 'cash', debit: '1120', credit: '1210', costCenter: 'school', description: 'Fee cash payment' },
  { referenceType: 'fee_payment', variant: 'bank_transfer', debit: '1130', credit: '1210', costCenter: 'school', description: 'Fee bank payment' },
  { referenceType: 'fee_payment', variant: 'cheque', debit: '1130', credit: '1210', costCenter: 'school', description: 'Fee cheque payment' },
  { referenceType: 'fee_payment', variant: 'online', debit: '1130', credit: '1210', costCenter: 'school', description: 'Fee online payment' },
  { referenceType: 'fee_payment_reversal', debit: '1210', credit: '1120', costCenter: 'school', description: 'Fee payment reversal' },
  { referenceType: 'fee_waiver', debit: '5100', credit: '1210', costCenter: 'school', description: 'Fee waiver' },
  { referenceType: 'therapy_invoice', debit: '1220', credit: '4100', costCenter: 'therapy', description: 'Therapy invoice' },
  { referenceType: 'therapy_payment', debit: '1120', credit: '1220', costCenter: 'therapy', description: 'Therapy payment' },
  { referenceType: 'therapy_payment', variant: 'cash', debit: '1120', credit: '1220', costCenter: 'therapy', description: 'Therapy cash' },
  { referenceType: 'therapy_payment', variant: 'bank_transfer', debit: '1130', credit: '1220', costCenter: 'therapy', description: 'Therapy bank' },
  // Phase 5/6 stubs
  { referenceType: 'payroll', debit: '5300', credit: '2100', costCenter: 'admin', description: 'Payroll (Phase 5 stub)' },
  { referenceType: 'gratuity_provision', debit: '5300', credit: '2100', costCenter: 'admin', description: 'Gratuity provision stub' },
  { referenceType: 'vendor_invoice', debit: '5400', credit: '2100', costCenter: 'admin', description: 'Vendor invoice stub' },
];

export async function seedPhase4(prisma: PrismaClient) {
  console.log('Seeding Phase 4: Chart of accounts & posting rules...');

  const idByCode = new Map<string, string>();

  for (const row of COA) {
    const parentId = row.parent ? idByCode.get(row.parent) : undefined;
    const path = row.parent
      ? `${row.parent}.${row.code}`
      : row.code;
    // Fix path to use full ancestry
    let fullPath = row.code;
    if (row.parent) {
      const parent = COA.find((c) => c.code === row.parent);
      if (parent?.parent) fullPath = `${parent.parent}.${row.parent}.${row.code}`;
      else fullPath = `${row.parent}.${row.code}`;
    }
    const level = fullPath.split('.').length;

    const existing = await prisma.chartOfAccount.findUnique({
      where: { accountCode: row.code },
    });
    if (existing) {
      idByCode.set(row.code, existing.id);
      continue;
    }

    const created = await prisma.chartOfAccount.create({
      data: {
        accountCode: row.code,
        accountName: row.name,
        accountType: row.type,
        parentId: parentId ?? null,
        level,
        path: fullPath,
        isGroup: row.isGroup ?? false,
        normalBalance: row.normal,
        allowManualPosting: row.allowManual ?? true,
        isActive: true,
      },
    });
    idByCode.set(row.code, created.id);
  }

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
        description: rule.description,
      },
    });
  }

  // Ensure open fiscal periods for current and next 12 months
  const now = new Date();
  for (let i = -1; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const fy = month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    await prisma.fiscalPeriod.upsert({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
      create: {
        academicOrFiscalYear: fy,
        periodMonth: month,
        periodYear: year,
        startDate: start,
        endDate: end,
        status: 'open',
      },
      update: {},
    });
  }

  for (const entity of [
    { entityType: 'credit_note', prefix: 'CN-', padding: 5 },
    { entityType: 'debit_note', prefix: 'DN-', padding: 5 },
  ]) {
    await prisma.numberingScheme.upsert({
      where: { entityType: entity.entityType },
      create: { ...entity, currentSequence: 0, resetPeriod: 'yearly' },
      update: {},
    });
  }

  console.log('Phase 4 seed complete.', { legacyMap: Object.keys(LEGACY_CODE_MAP).length });
}
