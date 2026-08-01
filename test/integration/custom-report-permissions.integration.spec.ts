import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { issueTestToken } from '../../src/shared/testing/auth.helper';
import {
  createReportsTestApp,
  issuePrincipalReportsToken,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** RP-13 — custom report columns filtered by caller permissions. */
describeIfDb('Custom report permissions integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createReportsTestApp();
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('coordinator cannot select basic_salary on employees dataset', async () => {
    const token = await issueTestToken({
      userId: randomUUID(),
      role: 'coordinator',
      permissions: ['reports:read', 'reports:custom', 'school:read'],
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/custom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Coord salary probe ${Date.now()}`,
        baseDataset: 'employees',
        selectedColumns: ['id', 'basic_salary'],
        filters: [],
        groupBy: [],
        aggregations: [],
        sort: [],
        visibility: 'private',
      });

    expect([400, 403]).toContain(res.status);
  });

  it('principal with hr:read can create custom report without salary column', async () => {
    const token = await issuePrincipalReportsToken();
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/custom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `OK custom ${Date.now()}`,
        baseDataset: 'students',
        selectedColumns: ['student_code', 'full_name'],
        filters: [],
        groupBy: [],
        aggregations: [],
        sort: [],
        visibility: 'private',
      });

    expect([200, 201]).toContain(res.status);
  });
});
