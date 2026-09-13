import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import { StudentLeaveService } from '../../src/modules/school/services/student-leave.service';
import { SchoolAttendanceService } from '../../src/modules/school/services/school-attendance.service';
import { WorkingDaysService } from '../../src/modules/school/services/working-days.service';
import { createHarnessApp } from './helpers/harness.helper';
import {
  createActiveStudent,
  phase2Actor,
  phase2ShiftId,
} from './helpers/phase2.helper';

function nextWorkingDay(from: Date): Date {
  const d = new Date(from);
  while (d.getUTCDay() === 5 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/**
 * Parent leave → coordinator approve → excused_leave rows; % excludes them.
 */
describe('Student leave to attendance integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let leaves: StudentLeaveService;
  let attendance: SchoolAttendanceService;
  let workingDays: WorkingDaysService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let actorId: string;
  let shiftId: string;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
    leaves = app.get(StudentLeaveService);
    attendance = app.get(SchoolAttendanceService);
    workingDays = app.get(WorkingDaysService);
    students = app.get(StudentService);
    admissionFees = app.get(AdmissionFeeService);
    actorId = (await phase2Actor(prisma)).id;
    shiftId = await phase2ShiftId(prisma);
  }, 180000);


  it('approval writes excused_leave on working days only and excludes from %', async () => {
    const student = await createActiveStudent(students, admissionFees, prisma, {
      fullName: 'Leave Attendance Student',
      shiftId,
      actorId,
    });

    const start = nextWorkingDay(
      new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() + 60,
        ),
      ),
    );
    const end = nextWorkingDay(
      new Date(start.getTime() + 2 * 24 * 3600 * 1000),
    );
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const working = await workingDays.listWorkingDates(start, end);
    expect(working.length).toBeGreaterThan(0);

    const leave = await leaves.submit({
      studentId: student.id,
      requestedBy: actorId,
      leaveType: 'family',
      startDate: startStr,
      endDate: endStr,
      reason: 'Family travel',
    });
    await leaves.approve(leave.id, actorId);

    const excused = await prisma.studentAttendance.findMany({
      where: { studentId: student.id, status: 'excused_leave' },
    });
    expect(excused.length).toBe(working.length);

    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + 1;
    const summary = await attendance.monthlySummary(student.id, year, month);

    expect(summary.excusedDays).toBe(working.length);
    expect(summary.excludedDays).toBe(working.length);
    // Hand fixture: excused days excluded from countedDays denominator.
    expect(summary.countedDays).toBe(0);
    expect(summary.percentage).toBe(0);
    expect(summary.absentDays).toBe(0);
  });
});
