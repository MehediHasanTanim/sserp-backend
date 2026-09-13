import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import { FeeInvoiceService } from '../../src/modules/school/services/fee-invoice.service';
import { FeeStructureService } from '../../src/modules/school/services/fee-structure.service';
import { createHarnessApp } from './helpers/harness.helper';
import {
  createActiveStudent,
  phase2AcademicYearId,
  phase2Actor,
  phase2ShiftId,
} from './helpers/phase2.helper';

/**
 * Monthly fee generation: mixed students, exact counts, idempotent re-run.
 */
describe('Fee monthly generation integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let invoices: FeeInvoiceService;
  let feeStructures: FeeStructureService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let actorId: string;
  let shiftId: string;
  let academicYearId: string;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
    invoices = app.get(FeeInvoiceService);
    feeStructures = app.get(FeeStructureService);
    students = app.get(StudentService);
    admissionFees = app.get(AdmissionFeeService);
    actorId = (await phase2Actor(prisma)).id;
    shiftId = await phase2ShiftId(prisma);
    academicYearId = await phase2AcademicYearId(prisma);
  }, 180000);

  it('generates for active students and is idempotent on re-run', async () => {
    // Use an open fiscal period month so AccountsLedgerAdapter can post.
    const openPeriod = await prisma.fiscalPeriod.findFirstOrThrow({
      where: { status: 'open' },
      orderBy: { startDate: 'desc' },
    });
    const period = `${openPeriod.periodYear}-${String(openPeriod.periodMonth).padStart(2, '0')}`;
    const periodYear = openPeriod.periodYear;
    const periodMonth = openPeriod.periodMonth;
    const category = await prisma.feeCategory.findFirstOrThrow({
      where: { name: 'Standard', isActive: true },
    });
    const tuitionHead = await prisma.feeHead.findFirstOrThrow({
      where: { code: 'TUITION' },
    });
    const existingStructure = await prisma.feeStructure.findFirst({
      where: {
        academicYearId,
        feeCategoryId: category.id,
        feeHeadId: tuitionHead.id,
        frequency: 'monthly',
      },
    });
    if (!existingStructure) {
      await prisma.feeStructure.create({
        data: {
          academicYearId,
          feeCategoryId: category.id,
          feeHeadId: tuitionHead.id,
          amount: 500000,
          frequency: 'monthly',
          effectiveFrom: new Date('2000-01-01'),
        },
      });
    }

    const activeIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const s = await createActiveStudent(students, admissionFees, prisma, {
        fullName: `Fee Gen Active ${i}-${Date.now()}`,
        shiftId,
        actorId,
      });
      // Clear any prior invoice for this student/period so the run is deterministic.
      await prisma.feeInvoice.deleteMany({
        where: {
          studentId: s.id,
          invoiceType: 'monthly',
          periodYear,
          periodMonth,
        },
      });
      await feeStructures.setStudentFeeCategory(s.id, {
        feeCategoryId: category.id,
        effectiveFrom: '2000-01-01',
      });
      activeIds.push(s.id);
    }
    const pending = await students.enroll(
      { fullName: `Fee Gen Pending ${Date.now()}`, shiftId },
      actorId,
    );
    expect(pending.status).toBe('pending_admission_fee');

    const first = await invoices.generateMonthly(
      { period, academicYearId },
      actorId,
    );
    const ourLines = first.lines.filter((l) => activeIds.includes(l.studentId));
    expect(ourLines).toHaveLength(5);
    expect(ourLines.every((l) => l.status === 'generated')).toBe(true);
    expect(first.lines.find((l) => l.studentId === pending.id)?.status).toBe(
      'skipped',
    );

    const second = await invoices.generateMonthly(
      { period, academicYearId },
      actorId,
    );
    const ourSecond = second.lines.filter((l) =>
      activeIds.includes(l.studentId),
    );
    expect(ourSecond.every((l) => l.status === 'skipped')).toBe(true);
    expect(second.generated).toBe(0);
  });
});
