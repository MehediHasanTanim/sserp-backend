import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PayrollRunService } from '../../src/modules/hr/services/payroll-run.service';
import {
  ACTOR_ID,
  seedPayrollEmployee,
  cancelOpenPayrollRuns,
} from './helpers/payroll.helper';

/** PR-07 — recalculate thrice → one slip per employee, no orphan lines. */
describe('Payroll idempotency integration (PR-07)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let runs: PayrollRunService;

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
    runs = app.get(PayrollRunService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('recalculating three times keeps one slip per employee', async () => {
    const { employee, group } = await seedPayrollEmployee(app, {
      fullName: 'Idempotency Emp',
    });
    await cancelOpenPayrollRuns(prisma, group.id, 8, 2026);
    const created = await runs.createRun(
      {
        payrollGroupId: group.id,
        periodMonth: 8,
        periodYear: 2026,
        enqueue: false,
      },
      ACTOR_ID,
    );

    for (let i = 0; i < 3; i++) {
      await runs.performCalculation(created.id);
    }

    const slips = await prisma.payrollSlip.findMany({
      where: { payrollRunId: created.id, employeeId: employee.id },
      include: { lines: true },
    });
    expect(slips).toHaveLength(1);
    expect(slips[0].lines.length).toBeGreaterThan(0);

    const allSlips = await prisma.payrollSlip.findMany({
      where: { payrollRunId: created.id },
      include: { lines: true },
    });
    const lineCount = await prisma.payrollSlipLine.count({
      where: { payrollSlip: { payrollRunId: created.id } },
    });
    expect(lineCount).toBe(
      allSlips.reduce((sum, s) => sum + s.lines.length, 0),
    );
  }, 120000);
});
