/**
 * Local development dataset (11-test-automation §6.2).
 * Idempotent-ish: uses fixed codes; safe to re-run after reference seed.
 *
 * Usage: npm run seed:dev
 */
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

faker.seed(2026);

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding development dataset…');

  const morning = await prisma.shift.findFirst({ where: { name: 'Morning' } });
  const day = await prisma.shift.findFirst({ where: { name: 'Day' } });
  if (!morning) {
    console.warn('No Morning shift — run reference seed first.');
    return;
  }

  for (let i = 1; i <= 10; i++) {
    const code = `DEV-STU-${String(i).padStart(3, '0')}`;
    await prisma.student.upsert({
      where: { studentCode: code },
      create: {
        studentCode: code,
        fullName: faker.person.fullName(),
        status: i <= 8 ? 'active' : 'pending_admission_fee',
        shiftId: i % 2 === 0 ? day?.id ?? morning.id : morning.id,
        enrollmentDate: new Date('2026-01-10'),
      },
      update: {},
    });
  }

  for (let i = 1; i <= 5; i++) {
    const code = `DEV-EMP-${String(i).padStart(3, '0')}`;
    await prisma.employee.upsert({
      where: { employeeCode: code },
      create: {
        employeeCode: code,
        fullName: faker.person.fullName(),
        department: 'school',
        designation: 'Teacher',
        employmentType: 'permanent',
        joiningDate: new Date('2021-01-01'),
        basicSalary: 45_000_00,
        status: 'active',
      },
      update: {},
    });
  }

  console.log('Dev seed complete (students + employees).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
