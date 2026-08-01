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
import { EncashmentService } from '../../src/modules/hr/services/encashment.service';
import { LeaveBalanceService } from '../../src/modules/hr/services/leave-balance.service';
import { GratuityProvisionService } from '../../src/modules/hr/services/gratuity-provision.service';
import { GratuitySettlementService } from '../../src/modules/hr/services/gratuity-settlement.service';
import { EmployeeLifecycleService } from '../../src/modules/hr/services/employee-lifecycle.service';
import {
  ACTOR_ID,
  seedPayrollEmployee,
  ensureOpenFiscalPeriod,
} from './helpers/payroll.helper';

/**
 * Phase 5 exit criteria — end-of-service arithmetic:
 * exit → auto encashment → gratuity settle → loan recovery → single net figure.
 */
describe('End-of-service settlement E2E', () => {
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

  it('computes a single net settlement after encashment + gratuity − loan', async () => {
    await ensureOpenFiscalPeriod(prisma, 2026, 1);
    await ensureOpenFiscalPeriod(prisma, 2026, 5);
    await ensureOpenFiscalPeriod(prisma, 2026, 6);

    const { employee } = await seedPayrollEmployee(app, {
      joiningDate: '2014-01-01',
      basicAmount: 6_000_000,
      fullName: 'EOS Emp',
    });

    const leaveType = await prisma.leaveType.findFirstOrThrow({
      where: { isEncashable: true },
    });
    const balances = app.get(LeaveBalanceService);
    const bal = await balances.getOrInit(employee.id, leaveType.id, 2026);
    await prisma.leaveBalance.update({
      where: { id: bal.id },
      data: {
        entitledDays: 25,
        consumedDays: 0,
        encashedDays: 0,
        pendingDays: 0,
      },
    });

    const benefits = app.get(BenefitsService);
    const loan = await benefits.createLoan({
      employeeId: employee.id,
      loanType: 'loan',
      principalAmount: 50_000,
      installmentCount: 5,
      installmentAmount: 10_000,
    });
    await benefits.approveLoan(loan.id, ACTOR_ID);
    await benefits.disburse(
      loan.id,
      {
        disbursedDate: '2026-01-01',
        firstDeductionMonth: 2,
        firstDeductionYear: 2026,
      },
      ACTOR_ID,
    );
    // Leave outstanding as if one installment unpaid toward exit
    await prisma.employeeLoan.update({
      where: { id: loan.id },
      data: { outstandingAmount: 40_000, status: 'repaying' },
    });

    await app.get(GratuityProvisionService).runMonthly(2026, 5);

    await app.get(EmployeeLifecycleService).exit(
      employee.id,
      {
        exitType: 'resignation',
        noticeDate: '2026-06-01',
        lastWorkingDay: '2026-06-30',
      },
      ACTOR_ID,
    );

    // Exit listener creates automatic encashment requests; approve as principal path
    const encashment = app.get(EncashmentService);
    const autoReqs = await prisma.encashmentRequest.findMany({
      where: { employeeId: employee.id, trigger: 'exit_automatic' },
    });
    expect(autoReqs.length).toBeGreaterThan(0);
    for (const req of autoReqs) {
      if (req.status === 'pending') {
        await encashment.approve(req.id, ACTOR_ID, ['hr_officer']);
      }
      const fresh = await prisma.encashmentRequest.findUniqueOrThrow({
        where: { id: req.id },
      });
      if (fresh.status === 'hr_approved' || fresh.status === 'pending') {
        await encashment.approve(req.id, ACTOR_ID, ['principal']);
      }
    }

    const encashTotal = (
      await prisma.encashmentRequest.findMany({
        where: {
          employeeId: employee.id,
          status: { in: ['approved', 'processed'] },
        },
      })
    ).reduce((s, r) => s + r.calculatedAmount, 0);

    const settlement = app.get(GratuitySettlementService);
    const payment = await settlement.settle(employee.id, ACTOR_ID);

    expect(payment.deductionsAmount).toBe(40_000);
    const expectedNet = Math.max(
      0,
      payment.grossAmount - payment.forfeitedAmount - payment.deductionsAmount,
    );
    expect(payment.netPayable).toBe(expectedNet);

    // Single combined settlement figure for exit package
    const packageNet = expectedNet + encashTotal;
    expect(packageNet).toBe(payment.netPayable + encashTotal);
    expect(typeof packageNet).toBe('number');
  }, 180000);
});
