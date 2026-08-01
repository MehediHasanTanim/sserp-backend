import { PrismaClient } from '@prisma/client';

/** Phase 5 CoA leaves + posting rules (replaces Phase 4 payroll stubs). */
const COA: Array<{
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normal: 'debit' | 'credit';
  isGroup?: boolean;
  parent?: string;
  allowManual?: boolean;
}> = [
  { code: '1300', name: 'Other Receivables', type: 'asset', normal: 'debit', isGroup: true, parent: '1000' },
  { code: '1310', name: 'Employee Loan Receivable', type: 'asset', normal: 'debit', parent: '1300', allowManual: false },
  { code: '2110', name: 'Net Salary Payable', type: 'liability', normal: 'credit', parent: '2000', allowManual: false },
  { code: '2120', name: 'Income Tax Payable', type: 'liability', normal: 'credit', parent: '2000', allowManual: false },
  { code: '2130', name: 'PF Payable', type: 'liability', normal: 'credit', parent: '2000', allowManual: false },
  { code: '2210', name: 'Gratuity Provision', type: 'liability', normal: 'credit', parent: '2000', allowManual: false },
  { code: '2211', name: 'Gratuity Payable', type: 'liability', normal: 'credit', parent: '2000', allowManual: false },
  { code: '5010', name: 'Salary Expense', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5011', name: 'Leave Encashment Expense', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5020', name: 'Gratuity Expense', type: 'expense', normal: 'debit', parent: '5000' },
  { code: '5030', name: 'Training Expense', type: 'expense', normal: 'debit', parent: '5000' },
];

const POSTING_RULES: Array<{
  referenceType: string;
  variant?: string;
  debit: string;
  credit: string;
  costCenter?: string;
  description: string;
}> = [
  { referenceType: 'gratuity_provision', debit: '5020', credit: '2210', costCenter: 'admin', description: 'Monthly gratuity provision' },
  { referenceType: 'gratuity_settlement', debit: '2210', credit: '2211', costCenter: 'admin', description: 'Gratuity settlement to payable' },
  { referenceType: 'gratuity_payment', variant: 'cash', debit: '2211', credit: '1120', costCenter: 'admin', description: 'Gratuity cash payment' },
  { referenceType: 'gratuity_payment', variant: 'bank_transfer', debit: '2211', credit: '1130', costCenter: 'admin', description: 'Gratuity bank payment' },
  { referenceType: 'loan_disbursement', debit: '1310', credit: '1130', costCenter: 'admin', description: 'Employee loan disbursement' },
  { referenceType: 'loan_recovery', debit: '2110', credit: '1310', costCenter: 'admin', description: 'Loan installment recovery via payroll' },
  { referenceType: 'training_cost', debit: '5030', credit: '2100', costCenter: 'admin', description: 'Training cost' },
  { referenceType: 'payroll_paid', variant: 'bank_transfer', debit: '2110', credit: '1130', costCenter: 'admin', description: 'Payroll bank disbursement' },
  { referenceType: 'payroll_paid', variant: 'cash', debit: '2110', credit: '1120', costCenter: 'admin', description: 'Payroll cash disbursement' },
];

export async function seedPhase5(prisma: PrismaClient) {
  console.log('Seeding Phase 5: payroll CoA, components, gratuity policy...');

  const idByCode = new Map<string, string>();
  const existing = await prisma.chartOfAccount.findMany({ select: { id: true, accountCode: true } });
  for (const row of existing) idByCode.set(row.accountCode, row.id);

  for (const row of COA) {
    if (idByCode.has(row.code)) continue;
    const parentId = row.parent ? idByCode.get(row.parent) : undefined;
    let fullPath = row.code;
    if (row.parent) {
      const parentRow = await prisma.chartOfAccount.findUnique({ where: { accountCode: row.parent } });
      fullPath = parentRow ? `${parentRow.path}.${row.code}` : `${row.parent}.${row.code}`;
    }
    const created = await prisma.chartOfAccount.create({
      data: {
        accountCode: row.code,
        accountName: row.name,
        accountType: row.type,
        parentId: parentId ?? null,
        level: fullPath.split('.').length,
        path: fullPath,
        isGroup: row.isGroup ?? false,
        normalBalance: row.normal,
        allowManualPosting: row.allowManual ?? true,
        isActive: true,
      },
    });
    idByCode.set(row.code, created.id);
  }

  // Retire Phase 4 stub rules for payroll / gratuity_provision
  await prisma.postingRule.updateMany({
    where: { referenceType: { in: ['payroll', 'gratuity_provision'] } },
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
        description: rule.description,
        isActive: true,
      },
    });
  }

  const components = [
    { code: 'BASIC', name: 'Basic Salary', componentType: 'earning' as const, calculationType: 'fixed' as const, value: 0, affectsGratuity: true, coaAccountCode: '5010', sequence: 10 },
    { code: 'HRA', name: 'House Rent Allowance', componentType: 'earning' as const, calculationType: 'percentage_of_basic' as const, value: 40, affectsGratuity: false, coaAccountCode: '5010', sequence: 20 },
    { code: 'MEDICAL', name: 'Medical Allowance', componentType: 'earning' as const, calculationType: 'fixed' as const, value: 0, affectsGratuity: false, coaAccountCode: '5010', sequence: 30 },
    { code: 'PF_EE', name: 'Provident Fund (Employee)', componentType: 'deduction' as const, calculationType: 'percentage_of_basic' as const, value: 10, isStatutory: true, isTaxable: false, affectsGratuity: false, coaAccountCode: '2130', sequence: 100 },
    { code: 'TAX', name: 'Income Tax', componentType: 'deduction' as const, calculationType: 'formula' as const, value: 0, isStatutory: true, isTaxable: false, affectsGratuity: false, coaAccountCode: '2120', sequence: 110 },
    { code: 'PF_ER', name: 'Provident Fund (Employer)', componentType: 'employer_contribution' as const, calculationType: 'percentage_of_basic' as const, value: 10, isStatutory: true, isTaxable: false, affectsGratuity: false, coaAccountCode: '2130', sequence: 200 },
  ];

  for (const c of components) {
    await prisma.salaryComponent.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        name: c.name,
        componentType: c.componentType,
        calculationType: c.calculationType,
        value: c.value,
        isTaxable: c.isTaxable ?? true,
        isStatutory: c.isStatutory ?? false,
        affectsGratuity: c.affectsGratuity,
        coaAccountCode: c.coaAccountCode,
        sequence: c.sequence,
        isActive: true,
      },
      update: { name: c.name, coaAccountCode: c.coaAccountCode },
    });
  }

  const group = await prisma.payrollGroup.findFirst({ where: { name: 'Default Monthly' } });
  if (!group) {
    await prisma.payrollGroup.create({
      data: {
        name: 'Default Monthly',
        employmentTypes: ['permanent', 'contractual', 'part_time'],
        payFrequency: 'monthly',
        payDayOfMonth: 28,
        isActive: true,
      },
    });
  }

  // TODO-GOLIVE: replace placeholder income-tax slabs with local statutory rates before production.
  const taxFrom = new Date('2025-07-01');
  const existingTax = await prisma.statutoryDeductionSetting.findFirst({
    where: { deductionType: 'income_tax', name: 'Placeholder Income Tax' },
  });
  if (!existingTax) {
    await prisma.statutoryDeductionSetting.create({
      data: {
        deductionType: 'income_tax',
        name: 'Placeholder Income Tax',
        calculationMethod: 'slab',
        // TODO-GOLIVE
        slabs: [
          { upTo: 35000000, ratePercent: 0 },
          { upTo: 45000000, ratePercent: 5 },
          { upTo: 75000000, ratePercent: 10 },
          { upTo: 115000000, ratePercent: 15 },
          { upTo: null, ratePercent: 20 },
        ],
        effectiveFrom: taxFrom,
        coaAccountCode: '2120',
      },
    });
  }

  const existingPf = await prisma.statutoryDeductionSetting.findFirst({
    where: { deductionType: 'provident_fund', name: 'Placeholder PF' },
  });
  if (!existingPf) {
    await prisma.statutoryDeductionSetting.create({
      data: {
        deductionType: 'provident_fund',
        name: 'Placeholder PF',
        calculationMethod: 'percentage',
        employeeRatePercent: 10,
        employerRatePercent: 10,
        ceilingAmount: 5000000, // TODO-GOLIVE
        effectiveFrom: taxFrom,
        coaAccountCode: '2130',
      },
    });
  }

  const activePolicy = await prisma.gratuityPolicy.findFirst({ where: { isActive: true } });
  if (!activePolicy) {
    await prisma.gratuityPolicy.create({
      data: {
        name: 'Default Gratuity Policy',
        minServiceYears: 5,
        applicableEmploymentTypes: ['permanent'],
        daysPerYearOfService: 15,
        salaryBasis: 'basic',
        prorationMethod: 'monthly',
        maxYearsCounted: 20,
        forfeitureOnTermination: true,
        forfeitureReasons: ['misconduct', 'termination_for_cause'],
        effectiveFrom: taxFrom,
        isActive: true,
      },
    });
  }

  for (const entity of [
    { entityType: 'payroll_slip', prefix: 'PSL-', padding: 6 },
    { entityType: 'job_requisition', prefix: 'REQ-', padding: 5 },
    { entityType: 'applicant', prefix: 'APP-', padding: 5 },
    { entityType: 'offer', prefix: 'OFR-', padding: 5 },
  ]) {
    await prisma.numberingScheme.upsert({
      where: { entityType: entity.entityType },
      create: { ...entity, currentSequence: 0, resetPeriod: 'yearly' },
      update: {},
    });
  }

  console.log('Phase 5 seed complete.');
}
