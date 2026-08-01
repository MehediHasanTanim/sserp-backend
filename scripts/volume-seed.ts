/**
 * UAT volume seed — anonymised generators toward Phase 9 NFR volumes.
 * Usage: VOLUME_STUDENTS=50 npm run seed:volume
 */
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

faker.seed(9001);

const prisma = new PrismaClient();

const STUDENT_TARGET = Number(process.env.VOLUME_STUDENTS ?? 50);
const EMPLOYEE_TARGET = Number(process.env.VOLUME_EMPLOYEES ?? 20);

async function main() {
  console.log(
    `Volume seed targets: students=${STUDENT_TARGET} employees=${EMPLOYEE_TARGET}`,
  );

  const morning = await prisma.shift.findFirst({ where: { name: 'Morning' } });
  if (!morning) {
    throw new Error('Run reference seed before volume-seed');
  }

  const existingStudents = await prisma.student.count({
    where: { studentCode: { startsWith: 'VOL-STU-' } },
  });
  for (let i = existingStudents + 1; i <= STUDENT_TARGET; i++) {
    const code = `VOL-STU-${String(i).padStart(4, '0')}`;
    await prisma.student.create({
      data: {
        studentCode: code,
        fullName: faker.person.fullName(),
        status: 'active',
        shiftId: morning.id,
        enrollmentDate: faker.date.between({
          from: '2025-01-01',
          to: '2026-06-01',
        }),
      },
    });
  }

  const existingEmployees = await prisma.employee.count({
    where: { employeeCode: { startsWith: 'VOL-EMP-' } },
  });
  for (let i = existingEmployees + 1; i <= EMPLOYEE_TARGET; i++) {
    const code = `VOL-EMP-${String(i).padStart(4, '0')}`;
    await prisma.employee.create({
      data: {
        employeeCode: code,
        fullName: faker.person.fullName(),
        department: faker.helpers.arrayElement(['school', 'therapy', 'administration']),
        designation: 'Staff',
        employmentType: 'permanent',
        joiningDate: new Date('2020-01-01'),
        basicSalary: 35_000_00 + i * 10_000,
        status: 'active',
      },
    });
  }

  const studentCount = await prisma.student.count();
  const employeeCount = await prisma.employee.count();
  console.log(`Done. Totals: students=${studentCount} employees=${employeeCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
