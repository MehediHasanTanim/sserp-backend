import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import { ActivityEnrollmentService } from '../../src/modules/school/services/activity.service';
import { createHarnessApp } from './helpers/harness.helper';
import {
  createActiveStudent,
  phase2Actor,
  phase2ShiftId,
} from './helpers/phase2.helper';

/**
 * Waitlist under concurrent opt-ins + promotion on withdraw.
 */
describe('Activity waitlist integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let enrollments: ActivityEnrollmentService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let actorId: string;
  let shiftId: string;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
    enrollments = app.get(ActivityEnrollmentService);
    students = app.get(StudentService);
    admissionFees = app.get(AdmissionFeeService);
    actorId = (await phase2Actor(prisma)).id;
    shiftId = await phase2ShiftId(prisma);
  }, 180000);


  it('capacity 3 with 6 concurrent opt-ins → 3 confirmed, 3 waitlisted; withdraw promotes', async () => {
    const type = await prisma.activityType.findFirstOrThrow();
    const activity = await prisma.outdoorActivity.create({
      data: {
        activityTypeId: type.id,
        name: `Waitlist Activity ${Date.now()}`,
        activityDate: new Date('2099-06-01'),
        capacity: 3,
        feeAmount: 0,
        optInDeadline: new Date(Date.now() + 86400000 * 7),
        waitlistEnabled: true,
        status: 'upcoming',
      },
    });

    const studentIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const s = await createActiveStudent(students, admissionFees, prisma, {
        fullName: `Waitlist Student ${i}`,
        shiftId,
        actorId,
      });
      studentIds.push(s.id);
    }

    await Promise.all(
      studentIds.map((studentId) =>
        enrollments.respond({
          activityId: activity.id,
          studentId,
          accept: true,
          channel: 'portal',
          actorUserId: actorId,
        }),
      ),
    );

    const rows = await prisma.activityEnrollment.findMany({
      where: { activityId: activity.id },
    });
    const confirmed = rows.filter((r) => r.enrollmentState === 'confirmed');
    const waitlisted = rows.filter((r) => r.enrollmentState === 'waitlisted');
    expect(confirmed).toHaveLength(3);
    expect(waitlisted).toHaveLength(3);
    const positions = waitlisted.map((w) => w.waitlistPosition).sort();
    expect(positions).toEqual([1, 2, 3]);

    const withdrawId = confirmed[0].studentId;
    await enrollments.withdraw(activity.id, withdrawId);

    const after = await prisma.activityEnrollment.findMany({
      where: { activityId: activity.id },
    });
    expect(
      after.filter((r) => r.enrollmentState === 'confirmed'),
    ).toHaveLength(3);
    expect(
      after.find((r) => r.studentId === withdrawId)?.enrollmentState,
    ).not.toBe('confirmed');
  });
});
