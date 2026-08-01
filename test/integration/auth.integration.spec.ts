import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/services/password.service';
import { createHarnessApp } from './helpers/harness.helper';

/**
 * Pilot suite on shared harness (Testcontainers when SSERP_USE_TESTCONTAINERS=1).
 */
describe('Auth integration (harness)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
  }, 180000);

  afterAll(async () => {
    // Shared harness — do not stop containers here; suite isolation only.
  });

  it('login → me → change-password flow for bootstrap admin', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'superadmin', password: 'ChangeMeNow1' })
      .expect(201);

    const record = (
      globalThis as {
        recordTestRoute?: (method: string, path: string) => void;
      }
    ).recordTestRoute;
    if (typeof record === 'function') {
      record('POST', '/api/v1/auth/login');
    }

    const token = login.body.data.accessToken as string;
    expect(token).toBeTruthy();
    const cookies = login.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies)
      ? cookies.join(';')
      : String(cookies ?? '');
    expect(cookieHeader).toMatch(/HttpOnly/i);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.data.mustChangePassword).toBe(true);
      });

    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'ChangeMeNow1', newPassword: 'ChangedPass1' })
      .expect(204);

    const login2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'superadmin', password: 'ChangedPass1' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${login2.body.data.accessToken}`)
      .expect(200);

    const passwords = app.get(PasswordService);
    const hash = await passwords.hash('ChangeMeNow1');
    await prisma.user.update({
      where: { username: 'superadmin' },
      data: {
        passwordHash: hash,
        mustChangePassword: true,
        passwordHistory: [],
      },
    });
  });

  it('identical errors for unknown user and bad password', async () => {
    const a = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'nobody', password: 'whatever12A' });
    const b = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'superadmin', password: 'WrongPass99' });
    expect(a.status).toBe(b.status);
    expect(a.body.errorCode ?? a.body.message).toEqual(
      b.body.errorCode ?? b.body.message,
    );
  });
});
