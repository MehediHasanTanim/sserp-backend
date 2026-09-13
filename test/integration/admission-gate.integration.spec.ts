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
import { StudentService } from '../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../src/modules/school/services/admission-fee.service';
import { TeacherMappingService } from '../../src/modules/school/services/teacher-mapping.service';
import { employeeOrgIds } from './helpers/org.helper';

/**
 * S-02/M-05: a student cannot be mapped to a teacher while their admission
 * fee is pending; paying the fee (which flips status -> active) unblocks it.
 * See docs/plan/backend/02-phase1-hr-school-core.md §11.
 */
describe('Admission fee gate integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let students: StudentService;
  let admissionFees: AdmissionFeeService;
  let mappings: TeacherMappingService;
  let actorId: string;
  let shiftId: string;
  let teacherEmployeeId: string;

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
    mappings = app.get(TeacherMappingService);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { username: 'superadmin' },
    });
    actorId = admin.id;

    const morning = await prisma.shift.findFirstOrThrow({
      where: { name: 'Morning' },
    });
    shiftId = morning.id;

    const { departmentId, designationId } = await employeeOrgIds(prisma);
    const employee = await prisma.employee.create({
      data: {
        employeeCode: `EMP-TEST-${randomUUID()}`,
        fullName: 'Admission Gate Test Teacher',
        departmentId,
        designationId,
        employmentType: 'permanent',
        joiningDate: new Date('2020-01-01'),
        basicSalary: 30000,
        status: 'active',
      },
    });
    teacherEmployeeId = employee.id;
    const teacher = await prisma.teacher.create({
      data: { employeeId: employee.id, status: 'active' },
    });
    await prisma.teacherShiftAssignment.create({
      data: {
        teacherId: teacher.id,
        shiftId,
        effectiveFrom: new Date('2020-01-01'),
        isActive: true,
      },
    });
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('blocks mapping while fee is pending, then allows it once paid', async () => {
    const student = await students.enroll(
      { fullName: 'Gate Test Student', shiftId },
      actorId,
    );
    expect(student.status).toBe('pending_admission_fee');

    await expect(
      mappings.create(
        { studentId: student.id, teacherEmployeeId, shiftId },
        actorId,
      ),
    ).rejects.toMatchObject({
      code: 'ADMISSION_FEE_PENDING',
      statusCode: 422,
    });

    const fee = await prisma.admissionFee.findUniqueOrThrow({
      where: { studentId: student.id },
    });
    expect(fee.status).toBe('pending');

    const paidFee = await admissionFees.pay(
      student.id,
      { amount: fee.amount, paymentMethod: 'cash' },
      actorId,
    );
    expect(paidFee.status).toBe('paid');

    const activated = await students.get(student.id);
    expect(activated.status).toBe('active');

    const mapping = await mappings.create(
      { studentId: student.id, teacherEmployeeId, shiftId },
      actorId,
    );
    expect(mapping).toMatchObject({
      studentId: student.id,
      teacherEmployeeId,
      shiftId,
      isActive: true,
    });
  });
});
