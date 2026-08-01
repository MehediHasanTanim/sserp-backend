import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { EncashmentService } from '../../src/modules/hr/services/encashment.service';
import { LeaveBalanceService } from '../../src/modules/hr/services/leave-balance.service';
import { PayrollRunService } from '../../src/modules/hr/services/payroll-run.service';
import {
  ACTOR_ID,
  seedPayrollEmployee,
  cancelOpenPayrollRuns,
} from './helpers/payroll.helper';

/** EN-04/EN-05 — dual approve → payslip line. */
describe('Encashment payroll integration (EN-04/EN-05)', () => {
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

  it('approved encashment appears as payslip addition in matching month', async () => {
    const periodMonth = new Date().getUTCMonth() + 1;
    const periodYear = new Date().getUTCFullYear();

    const { employee, group } = await seedPayrollEmployee(app, {
      fullName: 'Encash Emp',
    });
    const leaveType = await prisma.leaveType.findFirstOrThrow({
      where: { isEncashable: true, isActive: true },
    });
    const balances = app.get(LeaveBalanceService);
    const balance = await balances.getOrInit(
      employee.id,
      leaveType.id,
      periodYear,
    );
    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        entitledDays: 20,
        carriedForwardDays: 0,
        consumedDays: 0,
        encashedDays: 0,
        pendingDays: 0,
      },
    });

    const encashment = app.get(EncashmentService);
    const req = await encashment.request({
      employeeId: employee.id,
      leaveTypeId: leaveType.id,
      year: periodYear,
      requestedDays: 2,
    });
    await encashment.approve(req.id, ACTOR_ID, ['hr_officer']);
    await encashment.approve(req.id, ACTOR_ID, ['principal']);

    const adj = await prisma.payrollAdjustment.findFirst({
      where: { sourceType: 'encashment', sourceId: req.id },
    });
    expect(adj).toBeTruthy();
    expect(adj!.status).toBe('pending');

    await cancelOpenPayrollRuns(prisma, group.id, periodMonth, periodYear);

    const runs = app.get(PayrollRunService);
    const created = await runs.createRun(
      {
        payrollGroupId: group.id,
        periodMonth,
        periodYear,
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
      slip.lines.some((l) => l.componentName.toLowerCase().includes('encash')),
    ).toBe(true);

    const balAfter = await balances.getOrInit(
      employee.id,
      leaveType.id,
      periodYear,
    );
    expect(Number(balAfter.encashedDays)).toBeGreaterThanOrEqual(2);
  }, 120000);
});
