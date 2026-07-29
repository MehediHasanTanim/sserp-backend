import {
  PrismaClient,
  PermissionAction,
  PermissionModule,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedPhase1 } from './phase1.seed';
import { seedPhase2 } from './phase2.seed';
import { seedPhase3 } from './phase3.seed';
import { seedDemo } from './demo.seed';

const prisma = new PrismaClient();

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const ROLES = [
  { name: 'super_admin', description: 'IT Administrator — full system access' },
  { name: 'principal', description: 'School Principal' },
  { name: 'coordinator', description: 'School/Therapy Coordinator' },
  { name: 'teacher', description: 'School Teacher' },
  { name: 'therapist', description: 'Therapist' },
  { name: 'hr_officer', description: 'HR Staff' },
  { name: 'accountant', description: 'Accounts Staff' },
  { name: 'receptionist', description: 'Front Desk' },
  { name: 'parent', description: 'Parent / Guardian' },
] as const;

type Cell = 'full' | 'read' | 'approve' | 'none';

/** Collapsed TDD 8.4 matrix → PermissionModule */
const MATRIX: Record<PermissionModule, Record<string, Cell>> = {
  school: {
    super_admin: 'full',
    principal: 'read',
    coordinator: 'full',
    teacher: 'read',
    therapist: 'none',
    hr_officer: 'none',
    accountant: 'read',
    receptionist: 'full',
    parent: 'read',
  },
  therapy: {
    super_admin: 'full',
    principal: 'read',
    coordinator: 'full',
    teacher: 'none',
    therapist: 'full',
    hr_officer: 'none',
    accountant: 'read',
    receptionist: 'full',
    parent: 'read',
  },
  hr: {
    super_admin: 'full',
    principal: 'approve',
    coordinator: 'none',
    teacher: 'none',
    therapist: 'none',
    hr_officer: 'full',
    accountant: 'read',
    receptionist: 'none',
    parent: 'none',
  },
  accounts: {
    super_admin: 'full',
    principal: 'read',
    coordinator: 'none',
    teacher: 'none',
    therapist: 'none',
    hr_officer: 'none',
    accountant: 'full',
    receptionist: 'none',
    parent: 'none',
  },
  finance: {
    super_admin: 'full',
    principal: 'full',
    coordinator: 'none',
    teacher: 'none',
    therapist: 'none',
    hr_officer: 'none',
    accountant: 'full',
    receptionist: 'none',
    parent: 'none',
  },
  inventory: {
    super_admin: 'full',
    principal: 'read',
    coordinator: 'read',
    teacher: 'none',
    therapist: 'none',
    hr_officer: 'none',
    accountant: 'read',
    receptionist: 'full',
    parent: 'none',
  },
  procurement: {
    super_admin: 'full',
    principal: 'approve',
    coordinator: 'read',
    teacher: 'none',
    therapist: 'none',
    hr_officer: 'none',
    accountant: 'full',
    receptionist: 'full',
    parent: 'none',
  },
  reports: {
    super_admin: 'full',
    principal: 'full',
    coordinator: 'full',
    teacher: 'read',
    therapist: 'read',
    hr_officer: 'full',
    accountant: 'full',
    receptionist: 'read',
    parent: 'none',
  },
  admin: {
    super_admin: 'full',
    principal: 'none',
    coordinator: 'none',
    teacher: 'none',
    therapist: 'none',
    hr_officer: 'none',
    accountant: 'none',
    receptionist: 'none',
    parent: 'none',
  },
  portal: {
    super_admin: 'full',
    principal: 'none',
    coordinator: 'none',
    teacher: 'none',
    therapist: 'none',
    hr_officer: 'none',
    accountant: 'none',
    receptionist: 'none',
    parent: 'full',
  },
};

const ALL_ACTIONS: PermissionAction[] = [
  'read',
  'create',
  'update',
  'delete',
  'approve',
  'export',
];

function actionsFor(cell: Cell): PermissionAction[] {
  if (cell === 'full') return ALL_ACTIONS;
  if (cell === 'read') return ['read'];
  if (cell === 'approve') return ['read', 'approve'];
  return [];
}

interface LeaveTypeSeed {
  code: string;
  name: string;
  isPaid: boolean;
  annualEntitlementDays: number;
  carryForwardAllowed: boolean;
  maxCarryForwardDays: number;
  requiresMedicalCertificateAfterDays: number | null;
  isEncashable: boolean;
  maxEncashableDaysPerYear: number | null;
  minBalanceToRetain: number;
  appliesToEmploymentTypes: string[];
}

const LEAVE_TYPES: LeaveTypeSeed[] = [
  {
    code: 'ANNUAL',
    name: 'Annual Leave',
    isPaid: true,
    annualEntitlementDays: 18,
    carryForwardAllowed: true,
    maxCarryForwardDays: 6,
    requiresMedicalCertificateAfterDays: null,
    isEncashable: true,
    maxEncashableDaysPerYear: 6,
    minBalanceToRetain: 0,
    appliesToEmploymentTypes: ['permanent'],
  },
  {
    code: 'SICK',
    name: 'Sick Leave',
    isPaid: true,
    annualEntitlementDays: 14,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    requiresMedicalCertificateAfterDays: 2,
    isEncashable: false,
    maxEncashableDaysPerYear: null,
    minBalanceToRetain: 0,
    appliesToEmploymentTypes: ['permanent', 'contractual'],
  },
  {
    code: 'CASUAL',
    name: 'Casual Leave',
    isPaid: true,
    annualEntitlementDays: 10,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    requiresMedicalCertificateAfterDays: null,
    isEncashable: false,
    maxEncashableDaysPerYear: null,
    minBalanceToRetain: 0,
    appliesToEmploymentTypes: ['permanent', 'contractual', 'part_time'],
  },
  {
    code: 'EMERGENCY',
    name: 'Emergency Leave',
    isPaid: true,
    annualEntitlementDays: 5,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    requiresMedicalCertificateAfterDays: null,
    isEncashable: false,
    maxEncashableDaysPerYear: null,
    minBalanceToRetain: 0,
    appliesToEmploymentTypes: ['permanent', 'contractual', 'part_time'],
  },
  {
    code: 'MATERNITY',
    name: 'Maternity Leave',
    isPaid: true,
    annualEntitlementDays: 112,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    requiresMedicalCertificateAfterDays: null,
    isEncashable: false,
    maxEncashableDaysPerYear: null,
    minBalanceToRetain: 0,
    appliesToEmploymentTypes: ['permanent', 'contractual'],
  },
  {
    code: 'PATERNITY',
    name: 'Paternity Leave',
    isPaid: true,
    annualEntitlementDays: 7,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    requiresMedicalCertificateAfterDays: null,
    isEncashable: false,
    maxEncashableDaysPerYear: null,
    minBalanceToRetain: 0,
    appliesToEmploymentTypes: ['permanent', 'contractual'],
  },
  {
    code: 'UNPAID',
    name: 'Unpaid Leave',
    isPaid: false,
    annualEntitlementDays: 30,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    requiresMedicalCertificateAfterDays: null,
    isEncashable: false,
    maxEncashableDaysPerYear: null,
    minBalanceToRetain: 0,
    appliesToEmploymentTypes: ['permanent', 'contractual', 'part_time'],
  },
  {
    code: 'COMPENSATORY',
    name: 'Compensatory Off',
    isPaid: true,
    annualEntitlementDays: 0,
    carryForwardAllowed: true,
    maxCarryForwardDays: 5,
    requiresMedicalCertificateAfterDays: null,
    isEncashable: false,
    maxEncashableDaysPerYear: null,
    minBalanceToRetain: 0,
    appliesToEmploymentTypes: ['permanent', 'contractual', 'part_time'],
  },
];

const NUMBERING_SCHEMES = [
  { entityType: 'student', prefix: 'STU-', padding: 4 },
  { entityType: 'employee', prefix: 'EMP-', padding: 4 },
  { entityType: 'patient', prefix: 'PAT-', padding: 4 },
  { entityType: 'invoice', prefix: 'INV-', padding: 6 },
  { entityType: 'receipt', prefix: 'RCT-', padding: 6 },
  { entityType: 'purchase_request', prefix: 'PR-', padding: 5 },
  { entityType: 'purchase_order', prefix: 'PO-', padding: 5 },
  { entityType: 'grn', prefix: 'GRN-', padding: 5 },
  { entityType: 'journal_entry', prefix: 'JE-', padding: 6 },
  { entityType: 'voucher', prefix: 'VCH-', padding: 6 },
  { entityType: 'therapy_invoice', prefix: 'TINV-', padding: 6 },
  { entityType: 'therapy_receipt', prefix: 'TREC-', padding: 6 },
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: { ...role, isSystem: true },
      update: { description: role.description, isSystem: true },
    });
  }

  const roles = await prisma.role.findMany();
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r]));

  for (const [module, byRole] of Object.entries(MATRIX) as [
    PermissionModule,
    Record<string, Cell>,
  ][]) {
    for (const [roleName, cell] of Object.entries(byRole)) {
      const role = roleByName[roleName];
      if (!role) continue;
      for (const action of actionsFor(cell)) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_module_action: {
              roleId: role.id,
              module,
              action,
            },
          },
          create: { roleId: role.id, module, action },
          update: {},
        });
      }
    }
  }

  await prisma.organizationSettings.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      name: 'Special School & Therapy Center',
      currencyCode: 'BDT',
      currencyMinorUnits: 2,
      timezone: 'Asia/Dhaka',
      sessionIdleTimeoutMinutes: 30,
      dateFormat: 'dd/MM/yyyy',
      fiscalYearStartMonth: 7,
    },
    update: {},
  });

  for (const scheme of NUMBERING_SCHEMES) {
    await prisma.numberingScheme.upsert({
      where: { entityType: scheme.entityType },
      create: {
        ...scheme,
        currentSequence: 0,
        resetPeriod: 'never',
      },
      update: {
        prefix: scheme.prefix,
        padding: scheme.padding,
      },
    });
  }

  for (const leaveType of LEAVE_TYPES) {
    await prisma.leaveType.upsert({
      where: { code: leaveType.code },
      create: { ...leaveType, isActive: true },
      update: {
        name: leaveType.name,
        isPaid: leaveType.isPaid,
        annualEntitlementDays: leaveType.annualEntitlementDays,
        carryForwardAllowed: leaveType.carryForwardAllowed,
        maxCarryForwardDays: leaveType.maxCarryForwardDays,
        requiresMedicalCertificateAfterDays:
          leaveType.requiresMedicalCertificateAfterDays,
        isEncashable: leaveType.isEncashable,
        maxEncashableDaysPerYear: leaveType.maxEncashableDaysPerYear,
        minBalanceToRetain: leaveType.minBalanceToRetain,
        appliesToEmploymentTypes: leaveType.appliesToEmploymentTypes,
      },
    });
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@sserp.local';
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'superadmin';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'ChangeMeNow1';
  const cost = Number(process.env.BCRYPT_COST ?? 12);
  const passwordHash = await bcrypt.hash(password, cost);
  const superAdminRole = roleByName['super_admin'];

  const admin = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      email,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
    },
    update: {
      email,
      // do not overwrite password on re-seed
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: admin.id, roleId: superAdminRole.id },
    },
    create: { userId: admin.id, roleId: superAdminRole.id },
    update: {},
  });

  console.log('Reference seed complete');

  await seedPhase1(prisma);
  await seedPhase2(prisma);
  await seedPhase3(prisma);

  if (process.env.SEED_DEMO === 'true') {
    await seedDemo(prisma);
  } else {
    console.log(
      'Demo seed skipped (set SEED_DEMO=true to include demo dataset)',
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
