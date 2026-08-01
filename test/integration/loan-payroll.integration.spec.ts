import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { BenefitsService } from '../../src/modules/hr/services/benefits.service';
import { PayrollRunService } from '../../src/modules/hr/services/payroll-run.service';
import {
  ACTOR_ID,
  seedPayrollEmployee,
  ensureOpenFiscalPeriod,
  cancelOpenPayrollRuns,
} from './helpers/payroll.helper';

/** BN / PR-12 — loan installments deduct across three payroll months. */
describe('Loan payroll integration (PR-12)', () => {
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

  it('deducts three loan installments and reduces outstanding', async () => {
    const { employee, group } = await seedPayrollEmployee(app, {
      fullName: 'Loan Emp',
      basicAmount: 8_000_000,
    });
    await ensureOpenFiscalPeriod(prisma, 2026, 8);
    await ensureOpenFiscalPeriod(prisma, 2026, 9);
    await ensureOpenFiscalPeriod(prisma, 2026, 10);
    await ensureOpenFiscalPeriod(prisma, 2026, 11);

    const benefits = app.get(BenefitsService);
    const loan = await benefits.createLoan({
      employeeId: employee.id,
      loanType: 'loan',
      principalAmount: 12_000,
      installmentCount: 12,
      installmentAmount: 1_000,
    });
    await benefits.approveLoan(loan.id, ACTOR_ID);
    await benefits.disburse(
      loan.id,
      {
        disbursedDate: '2026-08-15',
        firstDeductionMonth: 9,
        firstDeductionYear: 2026,
      },
      ACTOR_ID,
    );

    const runs = app.get(PayrollRunService);
    for (const month of [9, 10, 11]) {
      await cancelOpenPayrollRuns(prisma, group.id, month, 2026);
      const created = await runs.createRun(
        {
          payrollGroupId: group.id,
          periodMonth: month,
          periodYear: 2026,
          enqueue: false,
        },
        ACTOR_ID,
      );
      await runs.performCalculation(created.id);
      const slip = await prisma.payrollSlip.findFirstOrThrow({
        where: { payrollRunId: created.id, employeeId: employee.id },
        include: { lines: true },
      });
      expect(
        slip.lines.some((l) => l.componentName.startsWith('Loan installment')),
      ).toBe(true);
    }

    const deducted = await prisma.loanRepayment.count({
      where: { loanId: loan.id, status: 'deducted' },
    });
    expect(deducted).toBe(3);

    const updated = await prisma.employeeLoan.findUniqueOrThrow({
      where: { id: loan.id },
    });
    expect(updated.outstandingAmount).toBe(12_000 - 3_000);
    expect(updated.status).toBe('repaying');
  }, 180000);
});
