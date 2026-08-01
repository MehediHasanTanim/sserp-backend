import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { AppraisalService } from '../../src/modules/hr/services/appraisal.service';
import { ACTOR_ID, seedPayrollEmployee } from './helpers/payroll.helper';

describe('Appraisal cycle integration', () => {
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

  it('opens cycle, self+manager appraise, finalise', async () => {
    const { employee } = await seedPayrollEmployee(app, {
      fullName: 'Appraisal Emp',
      joiningDate: '2020-01-01',
    });
    const empUser = await prisma.user.create({
      data: {
        username: `app-${randomUUID().slice(0, 8)}`,
        email: `app-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'x',
        employeeId: employee.id,
        isActive: true,
      },
    });
    const managerUser = await prisma.user.create({
      data: {
        username: `mgr-${randomUUID().slice(0, 8)}`,
        email: `mgr-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'x',
        isActive: true,
      },
    });

    const appraisals = app.get(AppraisalService);
    const k1 = await appraisals.createKpi({
      name: `Quality ${randomUUID().slice(0, 6)}`,
      measurementType: 'rating',
      weightPercent: 60,
    });
    const k2 = await appraisals.createKpi({
      name: `Delivery ${randomUUID().slice(0, 6)}`,
      measurementType: 'rating',
      weightPercent: 40,
    });
    const cycle = await appraisals.createCycle({
      name: `Cycle ${randomUUID().slice(0, 6)}`,
      cycleType: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      selfAppraisalDeadline: '2026-12-01',
      managerAppraisalDeadline: '2026-12-15',
    });
    await appraisals.openCycle(cycle.id);

    const appraisal = await prisma.appraisal.findFirstOrThrow({
      where: { employeeId: employee.id, reviewCycleId: cycle.id },
    });

    await appraisals.submitSelf(
      appraisal.id,
      {
        overallRating: 4,
        kpiScores: [
          { kpiId: k1.id, selfScore: 4 },
          { kpiId: k2.id, selfScore: 5 },
        ],
      },
      empUser.id,
    );
    await appraisals.submitManager(
      appraisal.id,
      {
        overallRating: 4,
        kpiScores: [
          { kpiId: k1.id, managerScore: 4 },
          { kpiId: k2.id, managerScore: 5 },
        ],
      },
      managerUser.id,
    );
    const finalised = await appraisals.finalise(appraisal.id, 'meets');
    expect(finalised.status).toBe('finalised');
  }, 120000);
});
