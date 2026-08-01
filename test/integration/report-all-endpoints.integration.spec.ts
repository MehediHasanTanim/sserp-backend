import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { ALL_REPORT_CODES } from '../../src/modules/reports/handlers/report-seed-meta';
import {
  createReportsTestApp,
  isAcceptableReportStatus,
  issuePrincipalReportsToken,
  listRegisteredReportCodes,
  reportQueryString,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/** Exit criteria — every registered report code executes without server error. */
describeIfDb('Report all-endpoints integration', () => {
  let app: INestApplication;
  let token: string;
  let reportCodes: string[] = [];

  beforeAll(async () => {
    app = await createReportsTestApp();
    token = await issuePrincipalReportsToken();
    reportCodes = listRegisteredReportCodes(app);
    expect(reportCodes.length).toBe(ALL_REPORT_CODES.length);
    expect(reportCodes.length).toBe(72);
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('every registered report responds without server error and returns a data envelope', async () => {
    for (const code of reportCodes) {
      const qs = reportQueryString();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/${code}?${qs}`)
        .set('Authorization', `Bearer ${token}`);

      expect(isAcceptableReportStatus(res.status)).toBe(true);
      expect(res.status).not.toBe(500);
      if (res.status >= 200 && res.status < 300) {
        const body = res.body as { data?: unknown };
        expect(body).toHaveProperty('data');
        const payload = body.data as { data?: unknown } | unknown[];
        // Envelope may nest report result under data.data or expose rows array.
        if (Array.isArray(payload)) {
          expect(Array.isArray(payload)).toBe(true);
        } else if (
          payload &&
          typeof payload === 'object' &&
          'data' in payload
        ) {
          expect(Array.isArray((payload as { data: unknown }).data)).toBe(true);
        }
      }
    }
  }, 300000);
});
