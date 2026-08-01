import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { issueTestToken } from '../../src/shared/testing/auth.helper';
import { seedPayrollEmployee } from './helpers/payroll.helper';

/** Coordinator / employee-scoped RBAC on payroll routes. */
describe('HR payroll RBAC integration', () => {
  let app: INestApplication;
  let coordinatorToken: string;
  let hrToken: string;

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

    coordinatorToken = await issueTestToken({
      userId: randomUUID(),
      role: 'coordinator',
      permissions: ['school:read'],
    });
    hrToken = await issueTestToken({
      userId: randomUUID(),
      role: 'hr_officer',
      permissions: ['hr:read', 'hr:create', 'hr:update', 'hr:approve'],
    });

    await seedPayrollEmployee(app, { fullName: 'RBAC Emp' });
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('coordinator gets 403 on payroll routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/hr/payroll/runs')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('hr_officer can list payroll runs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/hr/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
  });
});
