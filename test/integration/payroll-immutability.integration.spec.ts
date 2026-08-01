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
import {
  seedPayrollEmployee,
  runPayrollToLocked,
} from './helpers/payroll.helper';

/**
 * PR-08 — mutating routes against a locked run return 409 PAYROLL_LOCKED.
 */
describe('Payroll immutability integration (PR-08)', () => {
  let app: INestApplication;
  let hrToken: string;
  let principalToken: string;
  let lockedRunId: string;

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

    hrToken = await issueTestToken({
      userId: randomUUID(),
      role: 'hr_officer',
      permissions: ['hr:read', 'hr:create', 'hr:update', 'hr:approve'],
    });
    principalToken = await issueTestToken({
      userId: randomUUID(),
      role: 'principal',
      permissions: ['hr:read', 'hr:approve'],
    });

    const { group } = await seedPayrollEmployee(app, {
      fullName: 'Immutability Emp',
    });
    const locked = await runPayrollToLocked(app, group.id, 12, 2025);
    lockedRunId = locked.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('recalculate on locked run returns PAYROLL_LOCKED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/hr/payroll/runs/${lockedRunId}/recalculate`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(409);
    expect(res.body.error.code).toBe('PAYROLL_LOCKED');
  });

  it('cancel on locked run returns PAYROLL_LOCKED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/hr/payroll/runs/${lockedRunId}/cancel`)
      .set('Authorization', `Bearer ${principalToken}`)
      .expect(409);
    expect(res.body.error.code).toBe('PAYROLL_LOCKED');
  });
});
