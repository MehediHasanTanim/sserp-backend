/**
 * Deletes E2E-{runId}- prefixed rows created by tests / e2e-seed.
 * Prefer API DELETE when available; Prisma used for baseline codes.
 *
 * Usage: RUN_ID=local npm run seed:e2e:teardown
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RUN_ID = process.env.RUN_ID || 'baseline';
const prefix = `E2E-${RUN_ID}-`;

async function main() {
  console.log(`E2E teardown prefix=${prefix}`);

  const students = await prisma.student.deleteMany({
    where: { studentCode: { startsWith: prefix } },
  });
  const employees = await prisma.employee.deleteMany({
    where: { employeeCode: { startsWith: prefix } },
  });

  console.log(
    `Deleted students=${students.count} employees=${employees.count}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
