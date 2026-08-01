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
import { RecruitmentService } from '../../src/modules/hr/services/recruitment.service';
import { ACTOR_ID } from './helpers/payroll.helper';

describe('Recruitment to employee integration (RC-04)', () => {
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

  it('requisition → offer accept → convert creates employee', async () => {
    const recruitment = app.get(RecruitmentService);
    const req = await recruitment.createRequisition(
      {
        title: `Teacher ${randomUUID().slice(0, 6)}`,
        department: 'school',
        designation: 'Special Educator',
        positionsCount: 1,
        employmentType: 'permanent',
      },
      ACTOR_ID,
    );
    await recruitment.approveRequisition(req.id, ACTOR_ID);

    const posting = await recruitment.createPosting({
      requisitionId: req.id,
      title: req.title,
      description: 'Join our team',
    });
    await recruitment.publishPosting(posting.id);

    const applicant = await recruitment.createApplicant({
      postingId: posting.id,
      fullName: 'Candidate Test',
      email: `cand-${randomUUID().slice(0, 8)}@test.local`,
    });

    for (const stage of [
      'screening',
      'shortlisted',
      'interviewing',
      'offered',
    ] as const) {
      await recruitment.changeStage(applicant.id, stage);
    }

    const offer = await recruitment.createOffer({
      applicantId: applicant.id,
      offeredDesignation: 'Special Educator',
      offeredDepartment: 'school',
      offeredSalaryStructure: { basicSalary: 4_000_000 },
      joiningDate: '2026-08-01',
      validUntil: '2026-07-15',
    });
    await recruitment.sendOffer(offer.id, ACTOR_ID);
    await recruitment.respondOffer(offer.id, true);

    const employee = await recruitment.convert(applicant.id, ACTOR_ID);
    expect(employee.id).toBeTruthy();
    expect(employee.designation).toBe('Special Educator');

    const updatedReq = await prisma.jobRequisition.findUniqueOrThrow({
      where: { id: req.id },
    });
    expect(updatedReq.filledCount).toBeGreaterThanOrEqual(1);
  }, 120000);
});
