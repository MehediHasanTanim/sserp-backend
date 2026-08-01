import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/shared/prisma/prisma.service';
import { EmployeeService } from '../../../src/modules/hr/services/employee.service';
import { SalaryStructureService } from '../../../src/modules/hr/services/salary-structure.service';
import { PayrollRunService } from '../../../src/modules/hr/services/payroll-run.service';

export const ACTOR_ID = '00000000-0000-4000-8000-000000000001';

export async function ensureOpenFiscalPeriod(
  prisma: PrismaService,
  year: number,
  month: number,
) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const fy = month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  await prisma.fiscalPeriod.upsert({
    where: {
      periodYear_periodMonth: { periodYear: year, periodMonth: month },
    },
    create: {
      academicOrFiscalYear: fy,
      periodMonth: month,
      periodYear: year,
      startDate: start,
      endDate: end,
      status: 'open',
    },
    update: { status: 'open' },
  });
}

/** Create permanent employee + approved BASIC-only structure on Default Monthly. */
export async function seedPayrollEmployee(
  app: INestApplication,
  opts?: {
    joiningDate?: string;
    basicAmount?: number;
    fullName?: string;
  },
) {
  const prisma = app.get(PrismaService);
  const employees = app.get(EmployeeService);
  const structures = app.get(SalaryStructureService);

  const group = await prisma.payrollGroup.findFirstOrThrow({
    where: { name: 'Default Monthly' },
  });
  const basic = await prisma.salaryComponent.findUniqueOrThrow({
    where: { code: 'BASIC' },
  });

  const employee = await employees.create(
    {
      fullName: opts?.fullName ?? `Payroll Emp ${randomUUID().slice(0, 8)}`,
      department: 'administration',
      designation: 'Officer',
      employmentType: 'permanent',
      joiningDate: opts?.joiningDate ?? '2018-01-01',
      basicSalary: opts?.basicAmount ?? 5_000_000,
    },
    ACTOR_ID,
  );

  const structure = await structures.createStructure(employee.id, {
    payrollGroupId: group.id,
    effectiveFrom: opts?.joiningDate ?? '2018-01-01',
    lines: [
      {
        salaryComponentId: basic.id,
        amount: opts?.basicAmount ?? 5_000_000,
      },
    ],
  });
  await structures.approve(structure.id, ACTOR_ID);

  return { employee, group, basic, structure };
}

/** createRun → performCalculation (sync) → approve → lock */
export async function runPayrollToLocked(
  app: INestApplication,
  payrollGroupId: string,
  periodMonth: number,
  periodYear: number,
) {
  const prisma = app.get(PrismaService);
  await ensureOpenFiscalPeriod(prisma, periodYear, periodMonth);
  await prisma.payrollRun.updateMany({
    where: {
      payrollGroupId,
      periodMonth,
      periodYear,
      status: { in: ['draft', 'calculating', 'calculated', 'approved'] },
    },
    data: { status: 'cancelled' },
  });
  const runs = app.get(PayrollRunService);
  const created = await runs.createRun(
    { payrollGroupId, periodMonth, periodYear, enqueue: false },
    ACTOR_ID,
  );
  await runs.performCalculation(created.id);
  await runs.approve(created.id, ACTOR_ID);
  return runs.lock(created.id, ACTOR_ID);
}

export async function cancelOpenPayrollRuns(
  prisma: PrismaService,
  payrollGroupId: string,
  periodMonth: number,
  periodYear: number,
) {
  await prisma.payrollRun.updateMany({
    where: {
      payrollGroupId,
      periodMonth,
      periodYear,
      status: { in: ['draft', 'calculating', 'calculated', 'approved'] },
    },
    data: { status: 'cancelled' },
  });
}
