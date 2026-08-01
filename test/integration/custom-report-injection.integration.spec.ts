import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createReportsTestApp,
  issuePrincipalReportsToken,
} from './helpers/reports.helper';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const INJECTION_PAYLOADS = [
  {
    name: 'DROP TABLE column',
    body: {
      name: 'Evil report',
      baseDataset: 'students',
      selectedColumns: ['DROP TABLE users'],
      filters: [],
    },
  },
  {
    name: 'tautology filter value',
    body: {
      name: 'Evil report',
      baseDataset: 'students',
      selectedColumns: ['student_code'],
      filters: [{ column: 'status', operator: 'eq', value: '1=1' }],
    },
  },
  {
    name: 'pg_sleep aggregation',
    body: {
      name: 'Evil report',
      baseDataset: 'students',
      selectedColumns: [],
      aggregations: [{ column: 'net_amount', fn: 'pg_sleep' }],
    },
  },
  {
    name: 'UNION column',
    body: {
      name: 'Evil report',
      baseDataset: 'students',
      selectedColumns: ['student_code UNION SELECT password'],
    },
  },
  {
    name: 'unknown dataset',
    body: {
      name: 'Evil report',
      baseDataset: 'secrets',
      selectedColumns: ['student_code'],
    },
  },
  {
    name: 'sort direction injection',
    body: {
      name: 'Evil report',
      baseDataset: 'students',
      selectedColumns: ['student_code'],
      sort: [{ column: 'student_code', direction: 'asc; DROP TABLE users' }],
    },
  },
];

/** RP-12 — malicious custom report builder payloads rejected with 400. */
describeIfDb('Custom report injection integration', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createReportsTestApp();
    token = await issuePrincipalReportsToken();
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it.each(INJECTION_PAYLOADS.map((p) => [p.name, p.body]))(
    'rejects %s',
    async (_label, body) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reports/custom')
        .set('Authorization', `Bearer ${token}`)
        .send(body);

      expect([400, 403, 422]).toContain(res.status);
      expect(res.status).not.toBe(500);
    },
  );
});
