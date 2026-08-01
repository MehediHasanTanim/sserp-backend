import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createReportsTestApp,
  issueParentToken,
  issuePrincipalReportsToken,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** RP-02 / RP-03 — catalog visibility; parent role forbidden from reports. */
describeIfDb('Report catalog RBAC integration', () => {
  let app: INestApplication;
  let principalToken: string;
  let parentToken: string;

  beforeAll(async () => {
    app = await createReportsTestApp();
    principalToken = await issuePrincipalReportsToken();
    parentToken = await issueParentToken();
  }, 90000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('principal receives a non-empty report catalog', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/catalog')
      .set('Authorization', `Bearer ${principalToken}`)
      .expect(200);

    const payload = res.body.data ?? res.body;
    expect(payload.total).toBeGreaterThan(0);
    expect(Array.isArray(payload.modules)).toBe(true);
  });

  it('parent is forbidden from the report catalog', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports/catalog')
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
  });

  it('parent is forbidden from executing a report directly', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/reports/school.enrollment-summary?fromDate=2026-01-01&toDate=2026-07-31',
      )
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
  });
});
