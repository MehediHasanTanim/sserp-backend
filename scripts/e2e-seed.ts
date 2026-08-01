/**
 * E2E baseline dataset for frontend Playwright (11-test-automation §6.3).
 * Prefix created entities with E2E-{runId}- when tests add data.
 *
 * Usage: RUN_ID=local npm run seed:e2e
 */
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

faker.seed(18112);

const prisma = new PrismaClient();
const RUN_ID = process.env.RUN_ID || 'baseline';

async function main() {
  console.log(`E2E seed runId=${RUN_ID}`);

  const morning = await prisma.shift.findFirst({ where: { name: 'Morning' } });
  if (!morning) {
    throw new Error('Reference seed required (Morning shift missing)');
  }

  for (let i = 1; i <= 10; i++) {
    const code = `E2E-${RUN_ID}-STU-${String(i).padStart(2, '0')}`;
    await prisma.student.upsert({
      where: { studentCode: code },
      create: {
        studentCode: code,
        fullName: `E2E-${RUN_ID}-${faker.person.fullName()}`,
        status: 'active',
        shiftId: morning.id,
        enrollmentDate: new Date('2026-02-01'),
      },
      update: { fullName: `E2E-${RUN_ID}-${faker.person.fullName()}` },
    });
  }

  for (let i = 1; i <= 5; i++) {
    const code = `E2E-${RUN_ID}-EMP-${String(i).padStart(2, '0')}`;
    await prisma.employee.upsert({
      where: { employeeCode: code },
      create: {
        employeeCode: code,
        fullName: `E2E-${RUN_ID}-${faker.person.fullName()}`,
        department: 'school',
        designation: 'Teacher',
        employmentType: 'permanent',
        joiningDate: new Date('2022-01-01'),
        basicSalary: 50_000_00,
        status: 'active',
      },
      update: {},
    });
  }

  console.log('E2E baseline seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
