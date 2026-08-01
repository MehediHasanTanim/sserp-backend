import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createReportsTestApp,
  issuePrincipalReportsToken,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** Feature 12.2 — KPI comparison and drill-down. */
describeIfDb('KPI comparison and drill-down integration', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createReportsTestApp();
    token = await issuePrincipalReportsToken();
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('returns KPI payload with comparison shape or noData', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/kpi/hr_headcount')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const payload = res.body.data ?? res.body;
    expect(payload.code).toBe('hr_headcount');
    expect(payload).toHaveProperty('comparison');
    if (payload.noData) {
      expect(payload.value).toBeNull();
    } else {
      expect(payload.value === null || typeof payload.value === 'number').toBe(
        true,
      );
    }
  });

  it('drill-down responds without server error', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/kpi/enrollment_trend/drill-down')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).not.toBe(500);
    expect([200, 403, 404]).toContain(res.status);
  });
});
