import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createReportsTestApp,
  issuePrincipalReportsToken,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** RP-14 — scheduled report create and run-now. */
describeIfDb('Scheduled report integration', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createReportsTestApp();
    token = await issuePrincipalReportsToken();
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('creates a daily schedule and can run-now', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/reports/scheduled')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reportCode: 'finance.pnl',
        name: `Daily PNL ${Date.now()}`,
        frequency: 'daily',
        sendTime: '08:00',
        timezone: 'Asia/Dhaka',
        format: 'xlsx',
        recipientEmails: ['principal@example.com'],
        parameters: { fromDate: '2026-01-01', toDate: '2026-01-31' },
        isActive: true,
      });

    expect([200, 201]).toContain(create.status);
    const created = create.body.data ?? create.body;
    expect(created.id).toBeTruthy();

    const run = await request(app.getHttpServer())
      .post(`/api/v1/reports/scheduled/${created.id}/run-now`)
      .set('Authorization', `Bearer ${token}`);

    expect(run.status).not.toBe(500);
    expect([200, 201, 202]).toContain(run.status);
  });
});
