import { INestApplication } from '@nestjs/common';
import { StatementService } from '../../src/modules/accounts/services/statement.service';
import { ReportExecutorService } from '../../src/modules/reports/framework/report-executor.service';
import { AuthUser } from '../../src/shared/decorators';
import {
  createReportsTestApp,
  defaultReportDateRange,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const principalUser: AuthUser = {
  id: '00000000-0000-0000-0000-000000000099',
  username: 'principal',
  email: 'principal@test.local',
  roles: ['principal'],
  permissions: [
    'reports:read',
    'finance:read',
    'school:read',
    'therapy:read',
    'hr:read',
    'inventory:read',
    'procurement:read',
  ],
  mustChangePassword: false,
  jti: 'reconcile-test',
};

/** RP-08 — finance.pnl matches StatementService for the same period when data exists. */
describeIfDb('Report ledger reconciliation integration', () => {
  let app: INestApplication;
  let executor: ReportExecutorService;
  let statement: StatementService;

  beforeAll(async () => {
    app = await createReportsTestApp();
    executor = app.get(ReportExecutorService);
    statement = app.get(StatementService);
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('finance.pnl net profit matches StatementService.pnl when ledger has data', async () => {
    const { fromDate, toDate } = defaultReportDateRange();
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const direct = await statement.pnl(from, to);
    const reportResult = await executor.execute(
      'finance.pnl',
      { fromDate, toDate },
      principalUser,
      { allowSync: true },
    );

    if ('async' in reportResult && reportResult.async) {
      return;
    }

    const rows = (reportResult as { data: unknown[] }).data;
    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }

    const reportPnl = rows[0] as {
      netProfit?: number;
      revenue?: number;
      expense?: number;
    };

    if (reportPnl.netProfit === undefined && reportPnl.revenue === undefined) {
      return;
    }

    expect(reportPnl.netProfit).toBe(direct.netProfit);
    if (reportPnl.revenue !== undefined) {
      expect(reportPnl.revenue).toBe(direct.revenue);
    }
    if (reportPnl.expense !== undefined) {
      expect(reportPnl.expense).toBe(direct.expense);
    }
  }, 60000);
});
