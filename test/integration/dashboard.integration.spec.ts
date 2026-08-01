import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createReportsTestApp,
  issuePrincipalReportsToken,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** RP-17 — dashboard endpoint for principal-like caller (skip gracefully if not mounted). */
describeIfDb('Dashboard integration', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createReportsTestApp();
    token = await issuePrincipalReportsToken();
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /dashboard returns principal dashboard payload', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const payload = res.body.data ?? res.body;
    expect(payload).toBeDefined();
    expect(
      payload.role === 'principal' ||
        payload.dashboardRole === 'principal' ||
        Array.isArray(payload.widgets) ||
        Array.isArray(payload.availableDashboards),
    ).toBe(true);
  });
});
