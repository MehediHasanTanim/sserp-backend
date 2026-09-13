import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import { ProgressReportService } from '../../src/modules/school/services/progress-report.service';
import { createHarnessApp } from './helpers/harness.helper';
import {
  createActiveStudent,
  createGuardianParent,
  phase2AcademicYearId,
  phase2Actor,
  phase2ShiftId,
} from './helpers/phase2.helper';

/**
 * Progress report workflow: draft → submit → reject → resubmit → approve → publish.
 */
describe('Progress report workflow integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reports: ProgressReportService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let actorId: string;
  let shiftId: string;
  let academicYearId: string;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
    reports = app.get(ProgressReportService);
    students = app.get(StudentService);
    admissionFees = app.get(AdmissionFeeService);
    actorId = (await phase2Actor(prisma)).id;
    shiftId = await phase2ShiftId(prisma);
    academicYearId = await phase2AcademicYearId(prisma);
  }, 180000);


  it('runs the full draft→publish chain; parent sees only published', async () => {
    const student = await createActiveStudent(students, admissionFees, prisma, {
      fullName: 'Progress Workflow Student',
      shiftId,
      actorId,
    });

    const draft = await reports.create(student.id, {
      reportType: 'monthly_progress',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      academicYearId,
    });
    expect(draft).toBeTruthy();
    const reportId = draft!.id;
    expect(draft!.status).toBe('draft');

    const submitted = await reports.submit(reportId, actorId);
    expect(submitted.status).toBe('submitted');

    const rejected = await reports.reject(reportId, actorId, 'Needs detail');
    expect(rejected.status).toBe('draft');
    expect(rejected.reviewComment).toBe('Needs detail');

    const resubmitted = await reports.submit(reportId, actorId);
    expect(resubmitted.status).toBe('submitted');

    const coordinator = await prisma.user.findFirstOrThrow({
      where: { username: 'superadmin' },
    });
    const approved = await reports.approve(
      reportId,
      coordinator.id,
      ['coordinator', 'super_admin'],
    );
    expect(approved.status).toBe('approved');

    const published = await reports.publish(reportId);
    expect(published.status).toBe('published');

    await createGuardianParent(prisma, [student.id]);
    const visible = await prisma.progressReport.findMany({
      where: { studentId: student.id, status: 'published' },
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe(reportId);
  });
});
