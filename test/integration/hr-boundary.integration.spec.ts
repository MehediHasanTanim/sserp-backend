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

/**
 * HR/School boundary (docs/plan/backend/02-phase1-hr-school-core.md §4, §11):
 * a `coordinator` may read School data but has no HR module permissions at
 * all, so `/hr/employees` must be forbidden while `/school/*` list reads
 * succeed.
 */
describe('HR / School RBAC boundary integration', () => {
  let app: INestApplication;
  let coordinatorToken: string;

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
      permissions: [
        'school:read',
        'school:create',
        'school:update',
        'school:delete',
      ],
    });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('coordinator cannot GET /hr/employees (403, insufficient role)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/hr/employees')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('coordinator can GET /school/teachers', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/school/teachers')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);
  });

  it('coordinator can GET /school/students', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/school/students')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);
    expect(res.body.data).toHaveProperty('items');
  });
});
