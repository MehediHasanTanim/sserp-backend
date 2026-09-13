import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import {
  ActivityAttendanceService,
  ActivityEnrollmentService,
} from '../../src/modules/school/services/activity.service';
import { SchoolAttendanceService } from '../../src/modules/school/services/school-attendance.service';
import { createHarnessApp } from './helpers/harness.helper';
import {
  createActiveStudent,
  phase2Actor,
  phase2ShiftId,
} from './helpers/phase2.helper';

/**
 * Activity attendance must not mutate student_attendance / school %.
 */
describe('Activity attendance isolation integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let activityAttendance: ActivityAttendanceService;
  let enrollments: ActivityEnrollmentService;
  let schoolAttendance: SchoolAttendanceService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let actorId: string;
  let shiftId: string;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
    activityAttendance = app.get(ActivityAttendanceService);
    enrollments = app.get(ActivityEnrollmentService);
    schoolAttendance = app.get(SchoolAttendanceService);
    students = app.get(StudentService);
    admissionFees = app.get(AdmissionFeeService);
    actorId = (await phase2Actor(prisma)).id;
    shiftId = await phase2ShiftId(prisma);
  }, 180000);


  it('marking activity attendance leaves school attendance unchanged', async () => {
    const student = await createActiveStudent(students, admissionFees, prisma, {
      fullName: 'Activity Isolation Student',
      shiftId,
      actorId,
    });
    const type = await prisma.activityType.findFirstOrThrow();
    const activity = await prisma.outdoorActivity.create({
      data: {
        activityTypeId: type.id,
        name: `Isolation Activity ${Date.now()}`,
        activityDate: new Date('2099-07-01'),
        capacity: 10,
        feeAmount: 0,
        optInDeadline: new Date(Date.now() + 86400000 * 7),
        waitlistEnabled: true,
        status: 'upcoming',
      },
    });
    await enrollments.respond({
      activityId: activity.id,
      studentId: student.id,
      accept: true,
      channel: 'coordinator_manual',
      actorUserId: actorId,
    });

    const beforeCount = await prisma.studentAttendance.count({
      where: { studentId: student.id },
    });
    const beforeSummary = await schoolAttendance.monthlySummary(
      student.id,
      2099,
      7,
    );

    await activityAttendance.bulkMark(
      activity.id,
      [{ studentId: student.id, status: 'present' }],
      actorId,
    );

    const afterCount = await prisma.studentAttendance.count({
      where: { studentId: student.id },
    });
    const afterSummary = await schoolAttendance.monthlySummary(
      student.id,
      2099,
      7,
    );

    expect(afterCount).toBe(beforeCount);
    expect(afterSummary).toEqual(beforeSummary);
    const activityRows = await prisma.activityAttendance.findMany({
      where: { activityId: activity.id },
    });
    expect(activityRows).toHaveLength(1);
  });
});
