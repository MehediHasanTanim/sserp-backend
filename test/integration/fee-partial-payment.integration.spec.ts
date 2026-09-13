import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import { FeePaymentService } from '../../src/modules/school/services/fee-payment.service';
import { createHarnessApp } from './helpers/harness.helper';
import {
  createActiveStudent,
  phase2AcademicYearId,
  phase2Actor,
  phase2ShiftId,
} from './helpers/phase2.helper';

/**
 * Partial payments settle an invoice; overpayment rejected; receipts unique.
 */
describe('Fee partial payment integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: FeePaymentService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let actorId: string;
  let shiftId: string;
  let academicYearId: string;

  beforeAll(async () => {
    const ctx = await createHarnessApp();
    app = ctx.app;
    prisma = ctx.prisma;
    payments = app.get(FeePaymentService);
    students = app.get(StudentService);
    admissionFees = app.get(AdmissionFeeService);
    actorId = (await phase2Actor(prisma)).id;
    shiftId = await phase2ShiftId(prisma);
    academicYearId = await phase2AcademicYearId(prisma);
  }, 180000);


  it('accepts three partials then rejects a fourth overpayment', async () => {
    const student = await createActiveStudent(students, admissionFees, prisma, {
      fullName: 'Partial Pay Student',
      shiftId,
      actorId,
    });

    const invoice = await prisma.feeInvoice.create({
      data: {
        invoiceNumber: `INV-PP-${Date.now()}`,
        studentId: student.id,
        academicYearId,
        invoiceType: 'monthly',
        periodYear: 2098,
        periodMonth: 6,
        issueDate: new Date('2098-06-01'),
        dueDate: new Date('2098-06-10'),
        grossAmount: 500,
        discountAmount: 0,
        waivedAmount: 0,
        netAmount: 500,
        paidAmount: 0,
        outstandingAmount: 500,
        status: 'issued',
      },
    });

    await payments.pay(invoice.id, { amount: 100, method: 'cash' }, actorId);
    let inv = await prisma.feeInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(inv.status).toBe('partially_paid');

    await payments.pay(invoice.id, { amount: 200, method: 'cash' }, actorId);
    inv = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(inv.status).toBe('partially_paid');

    await payments.pay(
      invoice.id,
      { amount: 200, method: 'bank_transfer' },
      actorId,
    );
    inv = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(inv.status).toBe('paid');

    await expect(
      payments.pay(invoice.id, { amount: 1, method: 'cash' }, actorId),
    ).rejects.toMatchObject({ code: 'OVERPAYMENT' });

    const rows = await prisma.feePayment.findMany({
      where: { invoiceId: invoice.id },
      select: { receiptNumber: true },
    });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.receiptNumber)).size).toBe(3);
  });
});
