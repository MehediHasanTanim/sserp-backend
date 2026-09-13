import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import {
  createActiveStudent,
  createGuardianParent,
  phase2Actor,
  phase2ShiftId,
} from './helpers/phase2.helper';

/**
 * Parent A cannot read Parent B's child across portal routes (table-driven).
 */
describe('Portal scope integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let studentA: string;
  let studentB: string;

  const routesFor = (studentId: string) => [
    { method: 'get' as const, path: `/api/v1/portal/children/${studentId}` },
    {
      method: 'get' as const,
      path: `/api/v1/portal/children/${studentId}/attendance`,
    },
    {
      method: 'get' as const,
      path: `/api/v1/portal/children/${studentId}/iep`,
    },
    {
      method: 'get' as const,
      path: `/api/v1/portal/children/${studentId}/iep/history`,
    },
    {
      method: 'get' as const,
      path: `/api/v1/portal/children/${studentId}/progress-reports`,
    },
    {
      method: 'get' as const,
      path: `/api/v1/portal/children/${studentId}/fees`,
    },
    {
      method: 'get' as const,
      path: `/api/v1/portal/children/${studentId}/leave-requests`,
    },
    {
      method: 'get' as const,
      path: `/api/v1/portal/children/${studentId}/activities`,
    },
    {
      method: 'get' as const,
      path: `/api/v1/portal/children/${studentId}/therapy-schedule`,
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

    prisma = app.get(PrismaService);
    const students = app.get(StudentService);
    const admissionFees = app.get(AdmissionFeeService);
    const actorId = (await phase2Actor(prisma)).id;
    const shiftId = await phase2ShiftId(prisma);

    const a = await createActiveStudent(students, admissionFees, prisma, {
      fullName: 'Portal Scope Child A',
      shiftId,
      actorId,
    });
    const b = await createActiveStudent(students, admissionFees, prisma, {
      fullName: 'Portal Scope Child B',
      shiftId,
      actorId,
    });
    studentA = a.id;
    studentB = b.id;
    tokenA = (await createGuardianParent(prisma, [studentA])).token;
    tokenB = (await createGuardianParent(prisma, [studentB])).token;
  }, 180000);

  it('parent A can read own child and is forbidden on parent B child routes', async () => {
    for (const route of routesFor(studentA)) {
      await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    }
    for (const route of routesFor(studentB)) {
      const res = await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${tokenA}`);
      expect([403, 404]).toContain(res.status);
    }
    await request(app.getHttpServer())
      .get('/api/v1/portal/children')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/portal/messages')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/portal/notifications')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });
});
