import {
  PrismaClient,
  ReportEstimatedCost,
  ReportRowLevelScope,
} from '@prisma/client';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const DEFAULT_FORMATS = ['pdf', 'xlsx'];

const DEFAULT_DATE_PARAMS = {
  type: 'object',
  properties: {
    fromDate: { type: 'string', format: 'date' },
    toDate: { type: 'string', format: 'date' },
  },
  required: ['fromDate', 'toDate'],
};

type ReportSeed = {
  code: string;
  name: string;
  module: string;
  category: string;
  estimatedCost?: ReportEstimatedCost;
  requiredPermissions?: Array<{ module: string; action: string }>;
};

const REPORTS: ReportSeed[] = [
  // School (8.1)
  { code: 'school.attendance', name: 'Student Attendance', module: 'school', category: 'attendance' },
  { code: 'school.attendance-monthly-summary', name: 'Monthly Attendance Summary', module: 'school', category: 'attendance', estimatedCost: 'heavy' },
  { code: 'school.progress-report-status', name: 'Progress Report Status', module: 'school', category: 'academics' },
  { code: 'school.iep-goal-progress', name: 'IEP Goal Progress', module: 'school', category: 'iep' },
  { code: 'school.iep-review-due', name: 'IEP Reviews Due', module: 'school', category: 'iep' },
  { code: 'school.enrollment-summary', name: 'Enrollment Summary', module: 'school', category: 'enrollment' },
  { code: 'school.pending-admission-fee', name: 'Pending Admission Fee', module: 'school', category: 'fees' },
  { code: 'school.admission-fee-collection', name: 'Admission Fee Collection', module: 'school', category: 'fees' },
  { code: 'school.teacher-mapping', name: 'Teacher Mapping', module: 'school', category: 'staff' },
  { code: 'school.substitute-history', name: 'Substitute History', module: 'school', category: 'staff' },
  { code: 'school.student-leave-requests', name: 'Student Leave Requests', module: 'school', category: 'attendance' },
  { code: 'school.fee-collection', name: 'Fee Collection', module: 'school', category: 'fees', estimatedCost: 'heavy' },
  { code: 'school.fee-defaulters', name: 'Fee Defaulters', module: 'school', category: 'fees' },
  { code: 'school.health-incidents', name: 'Health Incidents', module: 'school', category: 'welfare' },
  { code: 'school.behavioral-incidents', name: 'Behavioral Incidents', module: 'school', category: 'welfare' },
  { code: 'school.activity-participation', name: 'Activity Participation', module: 'school', category: 'activities' },
  { code: 'school.activity-fee-collection', name: 'Activity Fee Collection', module: 'school', category: 'activities' },
  { code: 'school.activity-attendance', name: 'Activity Attendance', module: 'school', category: 'activities' },
  { code: 'school.activity-optin-response', name: 'Activity Opt-in Response', module: 'school', category: 'activities' },
  // Therapy (8.2)
  { code: 'therapy.session-schedule', name: 'Session Schedule', module: 'therapy', category: 'sessions' },
  { code: 'therapy.session-completion-rate', name: 'Session Completion Rate', module: 'therapy', category: 'sessions' },
  { code: 'therapy.patient-progress', name: 'Patient Progress', module: 'therapy', category: 'clinical' },
  { code: 'therapy.therapist-utilization', name: 'Therapist Utilization', module: 'therapy', category: 'utilization', estimatedCost: 'heavy' },
  { code: 'therapy.revenue', name: 'Therapy Revenue', module: 'therapy', category: 'billing', estimatedCost: 'heavy' },
  { code: 'therapy.waiting-list', name: 'Waiting List', module: 'therapy', category: 'operations' },
  { code: 'therapy.assessment', name: 'Assessment Sessions', module: 'therapy', category: 'clinical' },
  { code: 'therapy.group-session', name: 'Group Sessions', module: 'therapy', category: 'groups' },
  { code: 'therapy.group-patient-attendance', name: 'Group Patient Attendance', module: 'therapy', category: 'groups' },
  { code: 'therapy.group-revenue', name: 'Group Revenue', module: 'therapy', category: 'billing' },
  { code: 'therapy.group-enrollment', name: 'Group Enrollment', module: 'therapy', category: 'groups' },
  // HR (8.3)
  { code: 'hr.employee-master', name: 'Employee Master', module: 'hr', category: 'master' },
  { code: 'hr.attendance-daily', name: 'HR Daily Attendance', module: 'hr', category: 'attendance' },
  { code: 'hr.attendance-monthly', name: 'HR Monthly Attendance', module: 'hr', category: 'attendance', estimatedCost: 'heavy' },
  { code: 'hr.leave-balance', name: 'Leave Balance', module: 'hr', category: 'leave' },
  { code: 'hr.leave-utilization', name: 'Leave Utilization', module: 'hr', category: 'leave' },
  { code: 'hr.leave-encashment', name: 'Leave Encashment', module: 'hr', category: 'leave' },
  { code: 'hr.gratuity-entitlement', name: 'Gratuity Entitlement', module: 'hr', category: 'gratuity' },
  { code: 'hr.gratuity-monthly-provision', name: 'Gratuity Monthly Provision', module: 'hr', category: 'gratuity', estimatedCost: 'heavy' },
  { code: 'hr.gratuity-annual-liability', name: 'Gratuity Annual Liability', module: 'hr', category: 'gratuity', estimatedCost: 'heavy' },
  { code: 'hr.gratuity-exit-settlement', name: 'Gratuity Exit Settlement', module: 'hr', category: 'gratuity' },
  { code: 'hr.payroll-summary', name: 'Payroll Summary', module: 'hr', category: 'payroll', estimatedCost: 'heavy' },
  { code: 'hr.payroll-detail', name: 'Payroll Detail', module: 'hr', category: 'payroll', estimatedCost: 'heavy' },
  { code: 'hr.headcount', name: 'Headcount', module: 'hr', category: 'workforce' },
  { code: 'hr.recruitment-pipeline', name: 'Recruitment Pipeline', module: 'hr', category: 'recruitment' },
  { code: 'hr.training-participation', name: 'Training Participation', module: 'hr', category: 'training' },
  { code: 'hr.turnover', name: 'Turnover', module: 'hr', category: 'workforce' },
  // Finance (8.4)
  { code: 'finance.pnl', name: 'Profit & Loss', module: 'finance', category: 'statements', estimatedCost: 'heavy' },
  { code: 'finance.balance-sheet', name: 'Balance Sheet', module: 'finance', category: 'statements', estimatedCost: 'heavy' },
  { code: 'finance.cash-flow', name: 'Cash Flow', module: 'finance', category: 'statements', estimatedCost: 'heavy' },
  { code: 'finance.cost-center-profitability', name: 'Cost Center Profitability', module: 'finance', category: 'analysis', estimatedCost: 'heavy' },
  { code: 'finance.ar-aging', name: 'AR Aging', module: 'finance', category: 'receivables', estimatedCost: 'heavy' },
  { code: 'finance.ap-aging', name: 'AP Aging', module: 'finance', category: 'payables', estimatedCost: 'heavy' },
  { code: 'finance.budget-vs-actual', name: 'Budget vs Actual', module: 'finance', category: 'budget', estimatedCost: 'heavy' },
  { code: 'finance.bank-reconciliation', name: 'Bank Reconciliation', module: 'finance', category: 'banking' },
  { code: 'finance.tax-summary', name: 'Tax Summary', module: 'finance', category: 'tax', estimatedCost: 'heavy' },
  { code: 'finance.shareholder-disbursement', name: 'Shareholder Disbursement', module: 'finance', category: 'equity' },
  { code: 'finance.trial-balance', name: 'Trial Balance', module: 'finance', category: 'ledger', estimatedCost: 'heavy' },
  { code: 'finance.general-ledger', name: 'General Ledger', module: 'finance', category: 'ledger', estimatedCost: 'heavy' },
  // Inventory & procurement (8.5)
  { code: 'inventory.stock-position', name: 'Stock Position', module: 'inventory', category: 'stock' },
  { code: 'inventory.stock-movement', name: 'Stock Movement', module: 'inventory', category: 'stock' },
  { code: 'inventory.low-stock', name: 'Low Stock', module: 'inventory', category: 'stock' },
  { code: 'inventory.asset-register', name: 'Asset Register', module: 'inventory', category: 'assets' },
  { code: 'inventory.audit-summary', name: 'Inventory Audit Summary', module: 'inventory', category: 'audit' },
  { code: 'inventory.stock-valuation', name: 'Stock Valuation', module: 'inventory', category: 'stock', estimatedCost: 'heavy' },
  { code: 'inventory.purchase-request-status', name: 'Purchase Request Status', module: 'procurement', category: 'procurement' },
  { code: 'inventory.po-tracker', name: 'PO Tracker', module: 'procurement', category: 'procurement' },
  { code: 'inventory.vendor-performance', name: 'Vendor Performance', module: 'procurement', category: 'vendors' },
  { code: 'inventory.procurement-spend', name: 'Procurement Spend', module: 'procurement', category: 'spend', estimatedCost: 'heavy' },
  // Executive (8.6)
  { code: 'executive.monthly-management-summary', name: 'Monthly Management Summary', module: 'executive', category: 'executive', estimatedCost: 'heavy' },
  { code: 'executive.annual-performance', name: 'Annual Performance', module: 'executive', category: 'executive', estimatedCost: 'heavy' },
  { code: 'executive.cost-per-student', name: 'Cost per Student', module: 'executive', category: 'executive', estimatedCost: 'heavy' },
  { code: 'executive.revenue-per-therapy-type', name: 'Revenue per Therapy Type', module: 'executive', category: 'executive', estimatedCost: 'heavy' },
];

const DATASETS: Array<{
  key: string;
  name: string;
  module: string;
  rowLevelScope: ReportRowLevelScope;
  columns: Array<{
    name: string;
    type: string;
    filterable: boolean;
    groupable: boolean;
    aggregatable: boolean;
    permission?: { module: string; action: string };
  }>;
}> = [
  {
    key: 'students',
    name: 'Students',
    module: 'school',
    rowLevelScope: 'student',
    columns: [
      { name: 'student_code', type: 'string', filterable: true, groupable: false, aggregatable: false },
      { name: 'full_name', type: 'string', filterable: true, groupable: false, aggregatable: false },
      { name: 'status', type: 'enum', filterable: true, groupable: true, aggregatable: false },
      { name: 'shift_name', type: 'string', filterable: true, groupable: true, aggregatable: false },
      { name: 'enrollment_date', type: 'date', filterable: true, groupable: false, aggregatable: false },
    ],
  },
  {
    key: 'employees',
    name: 'Employees',
    module: 'hr',
    rowLevelScope: 'department',
    columns: [
      { name: 'employee_code', type: 'string', filterable: true, groupable: false, aggregatable: false },
      { name: 'full_name', type: 'string', filterable: true, groupable: false, aggregatable: false },
      { name: 'department', type: 'enum', filterable: true, groupable: true, aggregatable: false },
      { name: 'designation', type: 'string', filterable: true, groupable: true, aggregatable: false },
      { name: 'status', type: 'enum', filterable: true, groupable: true, aggregatable: false },
      {
        name: 'basic_salary',
        type: 'money',
        filterable: true,
        groupable: false,
        aggregatable: true,
        permission: { module: 'hr', action: 'read' },
      },
    ],
  },
  {
    key: 'therapy_sessions',
    name: 'Therapy Sessions',
    module: 'therapy',
    rowLevelScope: 'therapist',
    columns: [
      { name: 'session_date', type: 'date', filterable: true, groupable: true, aggregatable: false },
      { name: 'therapy_type', type: 'enum', filterable: true, groupable: true, aggregatable: false },
      { name: 'session_mode', type: 'enum', filterable: true, groupable: true, aggregatable: false },
      { name: 'status', type: 'enum', filterable: true, groupable: true, aggregatable: false },
      { name: 'duration_minutes', type: 'number', filterable: true, groupable: false, aggregatable: true },
    ],
  },
  {
    key: 'fee_invoices',
    name: 'Fee Invoices',
    module: 'school',
    rowLevelScope: 'student',
    columns: [
      { name: 'invoice_number', type: 'string', filterable: true, groupable: false, aggregatable: false },
      { name: 'issue_date', type: 'date', filterable: true, groupable: true, aggregatable: false },
      { name: 'due_date', type: 'date', filterable: true, groupable: false, aggregatable: false },
      { name: 'net_amount', type: 'money', filterable: true, groupable: false, aggregatable: true },
      { name: 'outstanding_amount', type: 'money', filterable: true, groupable: false, aggregatable: true },
      { name: 'status', type: 'enum', filterable: true, groupable: true, aggregatable: false },
    ],
  },
  {
    key: 'stock_levels',
    name: 'Stock Levels',
    module: 'inventory',
    rowLevelScope: 'none',
    columns: [
      { name: 'item_code', type: 'string', filterable: true, groupable: false, aggregatable: false },
      { name: 'item_name', type: 'string', filterable: true, groupable: false, aggregatable: false },
      { name: 'location_name', type: 'string', filterable: true, groupable: true, aggregatable: false },
      { name: 'on_hand', type: 'decimal', filterable: true, groupable: false, aggregatable: true },
      { name: 'stock_value', type: 'money', filterable: true, groupable: false, aggregatable: true },
    ],
  },
  {
    key: 'journal_lines',
    name: 'Journal Lines',
    module: 'finance',
    rowLevelScope: 'none',
    columns: [
      { name: 'entry_date', type: 'date', filterable: true, groupable: true, aggregatable: false },
      { name: 'account_code', type: 'string', filterable: true, groupable: true, aggregatable: false },
      { name: 'debit_amount', type: 'money', filterable: true, groupable: false, aggregatable: true },
      { name: 'credit_amount', type: 'money', filterable: true, groupable: false, aggregatable: true },
      { name: 'cost_center', type: 'string', filterable: true, groupable: true, aggregatable: false },
    ],
  },
];

function defaultPermissions(module: string) {
  return [{ module: 'reports', action: 'read' }, { module, action: 'read' }];
}

export async function seedPhase7(prisma: PrismaClient) {
  console.log('Seeding Phase 7: reports foundation...');

  const existingOrg = await prisma.organizationSettings.findUnique({
    where: { id: ORG_ID },
  });
  if (existingOrg) {
    await prisma.organizationSettings.update({
      where: { id: ORG_ID },
      data: {
        reportSyncTimeoutMs: 5000,
        exportMaxRows: 200_000,
        exportRetentionHours: 24,
        dashboardCacheTtlSeconds: 600,
      },
    });
  }

  for (const dataset of DATASETS) {
    await prisma.reportDataset.upsert({
      where: { key: dataset.key },
      create: {
        key: dataset.key,
        name: dataset.name,
        module: dataset.module,
        columns: dataset.columns,
        joins: [],
        rowLevelScope: dataset.rowLevelScope,
        isActive: true,
      },
      update: {
        name: dataset.name,
        module: dataset.module,
        columns: dataset.columns,
        rowLevelScope: dataset.rowLevelScope,
        isActive: true,
      },
    });
  }

  // Inactive placeholders — W3 activates via ReportRegistry startup sync
  for (const report of REPORTS) {
    await prisma.reportDefinition.upsert({
      where: { code: report.code },
      create: {
        code: report.code,
        name: report.name,
        module: report.module,
        category: report.category,
        description: `${report.name} (placeholder — handler not yet registered)`,
        parameters: DEFAULT_DATE_PARAMS,
        supportedFormats: DEFAULT_FORMATS,
        requiredPermissions: report.requiredPermissions ?? defaultPermissions(report.module),
        isExportable: true,
        isSchedulable: true,
        estimatedCost: report.estimatedCost ?? 'light',
        isActive: false,
      },
      update: {
        name: report.name,
        module: report.module,
        category: report.category,
        supportedFormats: DEFAULT_FORMATS,
        requiredPermissions: report.requiredPermissions ?? defaultPermissions(report.module),
        estimatedCost: report.estimatedCost ?? 'light',
        isActive: false,
      },
    });
  }

  console.log(`Phase 7 seed complete: ${REPORTS.length} report definitions, ${DATASETS.length} datasets`);
}
