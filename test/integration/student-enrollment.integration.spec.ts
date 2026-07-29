import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';

/**
 * S-01/S-03: enrollment creates a pending admission fee and puts the
 * student in `pending_admission_fee`; full payment activates the student
 * and posts through `LedgerPort` into `pending_ledger_postings`.
 * Mirrors docs/plan/backend/02-phase1-hr-school-core.md §11.
 */
describe('Student enrollment + admission fee integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let actorId: string;
  let shiftId: string;

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
    students = app.get(StudentService);
    admissionFees = app.get(AdmissionFeeService);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { username: 'superadmin' },
    });
    actorId = admin.id;

    const morning = await prisma.shift.findFirstOrThrow({
      where: { name: 'Morning' },
    });
    shiftId = morning.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('enroll() creates a pending fee and pending_admission_fee status', async () => {
    const student = await students.enroll(
      { fullName: 'Enrollment Test Student', shiftId },
      actorId,
    );

    expect(student.status).toBe('pending_admission_fee');

    const fee = await prisma.admissionFee.findUniqueOrThrow({
      where: { studentId: student.id },
    });
    expect(fee.status).toBe('pending');
    expect(fee.amount).toBeGreaterThan(0);

    const enrollment = await prisma.studentEnrollment.findFirstOrThrow({
      where: { studentId: student.id },
    });
    expect(enrollment.status).toBe('enrolled');

    const invoicePostings = await prisma.pendingLedgerPosting.findMany({
      where: { referenceType: 'admission_fee', referenceId: fee.id },
    });
    expect(invoicePostings).toHaveLength(1);
    expect(invoicePostings[0]).toMatchObject({
      status: 'pending',
      debitAccountCode: '1200',
      creditAccountCode: '4001',
      amount: fee.amount,
    });
  });

  it('pay() activates the student and writes a pending_ledger_postings row', async () => {
    const student = await students.enroll(
      { fullName: 'Payment Test Student', shiftId },
      actorId,
    );
    const fee = await prisma.admissionFee.findUniqueOrThrow({
      where: { studentId: student.id },
    });

    const paidFee = await admissionFees.pay(
      student.id,
      { amount: fee.amount, paymentMethod: 'bank_transfer' },
      actorId,
    );
    expect(paidFee.status).toBe('paid');
    expect(paidFee.receiptNumber).toBeTruthy();

    const activated = await students.get(student.id);
    expect(activated.status).toBe('active');

    const paymentPostings = await prisma.pendingLedgerPosting.findMany({
      where: {
        referenceType: 'admission_fee',
        referenceId: fee.id,
        debitAccountCode: '1020',
      },
    });
    expect(paymentPostings).toHaveLength(1);
    expect(paymentPostings[0]).toMatchObject({
      status: 'pending',
      creditAccountCode: '1200',
      amount: fee.amount,
    });

    // Two postings total for this fee: the original invoice + the payment.
    const allPostings = await prisma.pendingLedgerPosting.findMany({
      where: { referenceType: 'admission_fee', referenceId: fee.id },
    });
    expect(allPostings).toHaveLength(2);
  });
});
