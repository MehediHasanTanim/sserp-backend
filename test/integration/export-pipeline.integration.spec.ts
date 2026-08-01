import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createReportsTestApp,
  defaultReportDateRange,
  issuePrincipalReportsToken,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** RP-05 / RP-09 — queue export and poll status (soft-assert when worker slow). */
describeIfDb('Export pipeline integration', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createReportsTestApp();
    token = await issuePrincipalReportsToken();
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('queues a light report export and returns a job id', async () => {
    const dates = defaultReportDateRange();
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/school.enrollment-summary/export')
      .set('Authorization', `Bearer ${token}`)
      .send({ format: 'xlsx', parameters: dates });

    expect([200, 201]).toContain(res.status);
    const jobId = res.body.data?.jobId ?? res.body.jobId;
    expect(jobId).toBeTruthy();

    const poll = await request(app.getHttpServer())
      .get(`/api/v1/reports/export/${jobId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(poll.status).toBe(200);
    const status = poll.body.data?.status ?? poll.body.status;
    expect(['queued', 'running', 'completed', 'failed']).toContain(status);

    if (status === 'completed') {
      const downloadUrl = poll.body.data?.downloadUrl ?? poll.body.downloadUrl;
      expect(downloadUrl).toBeTruthy();
    }
  }, 60000);
});
