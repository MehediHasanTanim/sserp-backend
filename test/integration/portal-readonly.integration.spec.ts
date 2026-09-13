import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { issueTestToken } from '../../src/shared/testing/auth.helper';

/**
 * Parent token receives 403 on non-portal write endpoints (table-driven sample
 * of school/hr/admin mutating routes from the OpenAPI surface).
 */
describe('Portal readonly integration', () => {
  let app: INestApplication;
  let parentToken: string;

  const writeRoutes: Array<{
    method: 'post' | 'patch' | 'delete' | 'put';
    path: string;
    body?: Record<string, unknown>;
  }> = [
    {
      method: 'post',
      path: '/api/v1/school/students',
      body: { fullName: 'X', shiftId: randomUUID() },
    },
    {
      method: 'post',
      path: `/api/v1/school/students/${randomUUID()}/iep`,
      body: { academicYearId: randomUUID() },
    },
    {
      method: 'post',
      path: '/api/v1/school/fee-invoices/generate-monthly',
      body: { period: '2099-01' },
    },
    {
      method: 'post',
      path: '/api/v1/school/activities',
      body: {
        activityTypeId: randomUUID(),
        name: 'Nope',
        activityDate: '2099-01-01',
        capacity: 1,
        optInDeadline: '2099-01-01',
      },
    },
    {
      method: 'patch',
      path: `/api/v1/school/progress-reports/${randomUUID()}`,
      body: { narrativeSections: {} },
    },
    {
      method: 'delete',
      path: `/api/v1/school/iep/${randomUUID()}`,
    },
    {
      method: 'post',
      path: '/api/v1/hr/employees',
      body: { fullName: 'X' },
    },
    {
      method: 'post',
      path: '/api/v1/admin/users',
      body: { username: 'x', email: 'x@example.test', password: 'ValidPass1' },
    },
  ];

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

    parentToken = await issueTestToken({
      userId: randomUUID(),
      role: 'parent',
      permissions: ['portal:read'],
      scope: {
        studentIds: [randomUUID()],
        guardianProfileId: randomUUID(),
      },
    });
  }, 60000);

  it.each(writeRoutes)(
    'parent forbidden on $method $path',
    async ({ method, path, body }) => {
      const req = request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${parentToken}`);
      if (body) req.send(body);
      const res = await req;
      expect([403, 401]).toContain(res.status);
    },
  );
});
