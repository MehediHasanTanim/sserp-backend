import { randomUUID } from 'crypto';
import { PrismaService } from '../../../src/shared/prisma/prisma.service';
import { StudentService } from '../../../src/modules/school/services/student.service';
import { AdmissionFeeService } from '../../../src/modules/school/services/admission-fee.service';
import { employeeOrgIds } from './org.helper';
import { issueTestToken } from '../../../src/shared/testing/auth.helper';

export async function phase2Actor(prisma: PrismaService) {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { username: 'superadmin' },
  });
  return admin;
}

export async function phase2ShiftId(prisma: PrismaService) {
  const morning = await prisma.shift.findFirstOrThrow({
    where: { name: 'Morning' },
  });
  return morning.id;
}

export async function phase2AcademicYearId(prisma: PrismaService) {
  const year =
    (await prisma.academicYear.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.academicYear.findFirstOrThrow());
  return year.id;
}

/** Enroll + pay admission fee so the student is `active`. */
export async function createActiveStudent(
  students: StudentService,
  admissionFees: AdmissionFeeService,
  prisma: PrismaService,
  opts: { fullName: string; shiftId: string; actorId: string },
) {
  const student = await students.enroll(
    { fullName: opts.fullName, shiftId: opts.shiftId },
    opts.actorId,
  );
  const fee = await prisma.admissionFee.findUniqueOrThrow({
    where: { studentId: student.id },
  });
  await admissionFees.pay(
    student.id,
    { amount: fee.amount, paymentMethod: 'cash' },
    opts.actorId,
  );
  return prisma.student.findUniqueOrThrow({ where: { id: student.id } });
}

export async function createTeacherWithUser(prisma: PrismaService) {
  const { departmentId, designationId } = await employeeOrgIds(prisma);
  const employee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-P2-${randomUUID().slice(0, 8)}`,
      fullName: 'Phase2 Test Teacher',
      departmentId,
      designationId,
      employmentType: 'permanent',
      joiningDate: new Date('2020-01-01'),
      basicSalary: 30000,
      status: 'active',
    },
  });
  const teacher = await prisma.teacher.create({
    data: { employeeId: employee.id, status: 'active' },
  });
  const user = await prisma.user.create({
    data: {
      username: `p2t-${randomUUID().slice(0, 8)}`,
      email: `p2t-${randomUUID().slice(0, 8)}@example.test`,
      passwordHash: 'unused',
      employeeId: employee.id,
      isActive: true,
    },
  });
  return { employee, teacher, user };
}

export async function createGuardianParent(
  prisma: PrismaService,
  studentIds: string[],
) {
  const guardian = await prisma.guardianProfile.create({
    data: {
      fullName: 'Phase2 Guardian',
      email: `guardian-${randomUUID().slice(0, 8)}@example.test`,
      phone: `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
    },
  });
  for (const studentId of studentIds) {
    await prisma.studentGuardian.create({
      data: {
        studentId,
        guardianProfileId: guardian.id,
        fullName: guardian.fullName,
        relation: 'father',
        isPrimary: true,
        portalAccessEnabled: true,
      },
    });
  }
  const user = await prisma.user.create({
    data: {
      username: `parent-${randomUUID().slice(0, 8)}`,
      email: `parent-${randomUUID().slice(0, 8)}@example.test`,
      passwordHash: 'unused',
      guardianId: guardian.id,
      isActive: true,
    },
  });
  const token = await issueTestToken({
    userId: user.id,
    role: 'parent',
    permissions: ['portal:read', 'portal:create'],
    scope: {
      studentIds,
      guardianProfileId: guardian.id,
    },
  });
  return { guardian, user, token };
}

export async function staffToken(
  role: 'coordinator' | 'teacher' | 'accountant' | 'principal' | 'super_admin',
  permissions: string[],
  userId = randomUUID(),
) {
  return issueTestToken({ userId, role, permissions });
}
