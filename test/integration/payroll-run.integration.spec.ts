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
import { AccountsOpsJob } from '../../src/modules/accounts/jobs/accounts-ops.job';
import {
  ACTOR_ID,
  seedPayrollEmployee,
  ensureOpenFiscalPeriod,
  cancelOpenPayrollRuns,
} from './helpers/payroll.helper';

/**
 * PR-03/PR-07/PR-09 — payroll run slip totals and balanced lock journal.
 * See docs/plan/backend/06-phase5-hr-payroll-gratuity.md §10.
 */
describe('Payroll run integration (PR-07/PR-09)', () => {
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

  it('calculates slips and locks one balanced journal; ledger integrity holds', async () => {
    const periodMonth = 3;
    const periodYear = 2026;
    await ensureOpenFiscalPeriod(prisma, periodYear, periodMonth);
    const fixtures = await Promise.all([
      seedPayrollEmployee(app, { fullName: 'PR Run A' }),
      seedPayrollEmployee(app, { fullName: 'PR Run B' }),
      seedPayrollEmployee(app, { fullName: 'PR Run C' }),
    ]);
    const groupId = fixtures[0].group.id;
    await cancelOpenPayrollRuns(prisma, groupId, periodMonth, periodYear);

    const created = await runs.createRun(
      { payrollGroupId: groupId, periodMonth, periodYear, enqueue: false },
      ACTOR_ID,
    );
    const calculated = await runs.performCalculation(created.id);
    expect(calculated.status).toBe('calculated');
    expect(calculated.employeeCount).toBeGreaterThanOrEqual(3);

    const slips = await prisma.payrollSlip.findMany({
      where: { payrollRunId: calculated.id },
    });
    expect(slips.length).toBe(calculated.employeeCount);
    const sumGross = slips.reduce((s, x) => s + x.grossAmount, 0);
    const sumNet = slips.reduce((s, x) => s + x.netAmount, 0);
    expect(calculated.totalGross).toBe(sumGross);
    expect(calculated.totalNet).toBe(sumNet);

    await runs.approve(calculated.id, ACTOR_ID);
    const locked = await runs.lock(calculated.id, ACTOR_ID);
    expect(locked.status).toBe('locked');
    expect(locked.journalId).toBeTruthy();

    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: locked.journalId! },
      include: { lines: true },
    });
    expect(journal.status).toBe('posted');
    expect(journal.totalDebit).toBe(journal.totalCredit);
    expect(journal.totalDebit).toBeGreaterThan(0);

    const agg = await prisma.journalEntry.aggregate({
      where: {
        status: 'posted',
        OR: [
          { referenceType: 'payroll_run' },
          { referenceType: 'gratuity_provision' },
          { referenceType: 'gratuity_settlement' },
        ],
      },
      _sum: { totalDebit: true, totalCredit: true },
    });
    expect(agg._sum.totalDebit).toBe(agg._sum.totalCredit);

    const integrity = app.get(AccountsOpsJob);
    await expect(integrity.ledgerIntegrityCheck()).resolves.not.toThrow();
  }, 120000);
});
