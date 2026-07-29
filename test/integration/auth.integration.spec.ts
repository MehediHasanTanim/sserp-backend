import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

describe('Auth integration (local stack)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('login → me → change-password flow for bootstrap admin', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'superadmin', password: 'ChangeMeNow1' })
      .expect(201);

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

    // admin list blocked while must_change_password
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

    // restore seed password for other runs
    const { PasswordService } =
      await import('../../src/modules/auth/services/password.service');
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
    expect(a.body.error.code).toBe(b.body.error.code);
  });
});
