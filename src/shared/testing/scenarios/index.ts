import { PrismaClient } from '@prisma/client';
import {
  activeStudent,
  employeeFactory,
  patientFactory,
  stockItemFactory,
} from '../factories';

/**
 * Composite builders for recurring multi-entity integration setups.
 * These are in-memory/shape builders — persistence is left to callers.
 */

export function seedActiveStudentWithTeacher(shiftId: string) {
  const student = activeStudent.build({ shiftId });
  const teacher = employeeFactory.build({
    department: 'school',
    designation: 'Teacher',
    status: 'active',
  });
  return {
    student,
    teacher,
    mapping: { studentId: student.id, teacherId: teacher.id, shiftId },
  };
}

export function seedPayrollReadyEmployees(count: number) {
  return Array.from({ length: count }, (_, i) =>
    employeeFactory.build({
      status: 'active',
      employmentType: 'permanent',
      basicSalary: 40_000_00 + i * 1_000_00,
    }),
  );
}

export function seedStockedItem(quantity: number, location = 'main') {
  const item = stockItemFactory.build();
  return {
    item,
    location,
    quantity,
    stockLevel: { itemId: item.id, location, quantityOnHand: quantity },
  };
}

export function seedGroupWithPatients(count: number, therapyType = 'speech') {
  const patients = Array.from({ length: count }, () => patientFactory.build());
  return {
    group: {
      id: patients[0]?.id ?? 'group',
      name: `Group-${therapyType}`,
      therapyType,
      capacity: Math.max(count, 4),
    },
    patients,
  };
}

/** Optional helper when a live Prisma client is available in scenarios. */
export async function assertPrismaReachable(prisma: PrismaClient) {
  await prisma.$queryRaw`SELECT 1`;
}
