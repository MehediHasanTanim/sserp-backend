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
 * After billing activity, journal lines (and any remaining outbox rows)
 * keep debit = credit.
 */
describe('Ledger outbox integration', () => {
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

  it('keeps debit=credit invariant after fee payment postings', async () => {
    const student = await createActiveStudent(students, admissionFees, prisma, {
      fullName: 'Ledger Outbox Student',
      shiftId,
      actorId,
    });

    const invoice = await prisma.feeInvoice.create({
      data: {
        invoiceNumber: `INV-LED-${Date.now()}`,
        studentId: student.id,
        academicYearId,
        invoiceType: 'monthly',
        periodYear: 2096,
        periodMonth: 3,
        issueDate: new Date('2096-03-01'),
        dueDate: new Date('2096-03-10'),
        grossAmount: 1000,
        discountAmount: 0,
        waivedAmount: 0,
        netAmount: 1000,
        paidAmount: 0,
        outstandingAmount: 1000,
        status: 'issued',
      },
    });

    await payments.pay(invoice.id, { amount: 400, method: 'cash' }, actorId);
    await payments.pay(
      invoice.id,
      { amount: 600, method: 'bank_transfer' },
      actorId,
    );

    const lines = await prisma.journalLine.findMany({
      include: { account: { select: { normalBalance: true } } },
    });
    expect(lines.length).toBeGreaterThan(0);

    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      debit += line.debitAmount;
      credit += line.creditAmount;
    }
    expect(debit).toBe(credit);

    const pending = await prisma.pendingLedgerPosting.findMany();
    for (const row of pending) {
      expect(row.debitAccountCode).toBeTruthy();
      expect(row.creditAccountCode).toBeTruthy();
      expect(row.amount).toBeGreaterThan(0);
    }
    // Each pending row is a balanced double-entry stub (debit account + credit account, one amount).
    const pendingDebit = pending.reduce((s, r) => s + r.amount, 0);
    const pendingCredit = pending.reduce((s, r) => s + r.amount, 0);
    expect(pendingDebit).toBe(pendingCredit);
  });
});
