import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import { IepService } from '../../src/modules/school/services/iep.service';
import { IepGoalService } from '../../src/modules/school/services/iep-goal.service';
import { createHarnessApp } from './helpers/harness.helper';
import {
  createActiveStudent,
  createGuardianParent,
  createTeacherWithUser,
  phase2AcademicYearId,
  phase2Actor,
  phase2ShiftId,
} from './helpers/phase2.helper';

/**
 * IEP lifecycle: create → goals → publish → parent ack → revise → v2 active / v1 archived.
 */
describe('IEP lifecycle integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let iep: IepService;
  let goals: IepGoalService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let actorId: string;
  let shiftId: string;
  let academicYearId: string;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
    iep = app.get(IepService);
    goals = app.get(IepGoalService);
    students = app.get(StudentService);
    admissionFees = app.get(AdmissionFeeService);
    actorId = (await phase2Actor(prisma)).id;
    shiftId = await phase2ShiftId(prisma);
    academicYearId = await phase2AcademicYearId(prisma);
  }, 180000);


  it('publishes, acknowledges, and revises across versions', async () => {
    const student = await createActiveStudent(students, admissionFees, prisma, {
      fullName: 'IEP Lifecycle Student',
      shiftId,
      actorId,
    });
    const { teacher } = await createTeacherWithUser(prisma);
    const domains = await prisma.skillDomain.findMany({
      where: { isActive: true },
      take: 3,
      orderBy: { sequence: 'asc' },
    });
    expect(domains.length).toBeGreaterThanOrEqual(3);

    const draft = await iep.createDraft(student.id, {
      academicYearId,
      createdByTeacherId: teacher.id,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(draft.status).toBe('draft');
    expect(draft.version).toBe(1);

    for (const [i, domain] of domains.entries()) {
      await goals.create(draft.id, {
        skillDomainId: domain.id,
        description: `Goal in ${domain.name}`,
        responsibleTeacherId: teacher.id,
        targetDate: '2026-06-30',
        sequence: i + 1,
      });
    }

    const published = await iep.publish(draft.id, actorId);
    expect(published.status).toBe('active');
    expect(published.nextReviewDate).toBeTruthy();

    const { guardian } = await createGuardianParent(prisma, [student.id]);
    const ack = await iep.acknowledge(published.id, guardian.id, {
      signatureText: 'Agreed',
    });
    expect(ack.acknowledgedAt).toBeTruthy();

    const v2Draft = await iep.revise(published.id, teacher.id);
    expect(v2Draft.version).toBe(2);
    expect(v2Draft.status).toBe('draft');
    expect(v2Draft.goals.length).toBe(3);

    const v2 = await iep.publish(v2Draft.id, actorId);
    expect(v2.status).toBe('active');

    const v1 = await prisma.iepPlan.findUniqueOrThrow({
      where: { id: published.id },
    });
    expect(v1.status).toBe('archived');
  });
});
