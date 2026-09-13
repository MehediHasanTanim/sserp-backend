import { PrismaClient } from '@prisma/client';

export const DEFAULT_DEPARTMENTS = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    code: 'school',
    name: 'School',
    sortOrder: 1,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    code: 'therapy',
    name: 'Therapy',
    sortOrder: 2,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    code: 'administration',
    name: 'Administration',
    sortOrder: 3,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    code: 'support',
    name: 'Support',
    sortOrder: 4,
  },
] as const;

/** Common designations seeded per department (demo / scripts). */
export const DEFAULT_DESIGNATIONS: Record<string, string[]> = {
  school: [
    'Principal',
    'Coordinator',
    'Special Education Teacher',
    'Teacher',
    'School Assistant',
    'School Coordinator',
  ],
  therapy: [
    'Therapist',
    'Speech Therapist',
    'Occupational Therapist',
    'Physiotherapist',
    'Behavioral Therapist',
    'Therapy Assistant',
  ],
  administration: [
    'IT Administrator',
    'HR Officer',
    'Accountant',
    'Admin Officer',
    'Office Manager',
    'Staff',
  ],
  support: ['Receptionist', 'Caretaker', 'Security Guard', 'Staff'],
};

export async function seedHrOrg(prisma: PrismaClient) {
  for (const dept of DEFAULT_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      create: {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        sortOrder: dept.sortOrder,
        isActive: true,
      },
      update: {
        name: dept.name,
        sortOrder: dept.sortOrder,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  for (const [code, names] of Object.entries(DEFAULT_DESIGNATIONS)) {
    const department = await prisma.department.findUniqueOrThrow({
      where: { code },
    });
    for (const name of names) {
      await prisma.designation.upsert({
        where: {
          departmentId_name: { departmentId: department.id, name },
        },
        create: {
          name,
          departmentId: department.id,
          isActive: true,
        },
        update: { isActive: true, deletedAt: null },
      });
    }
  }
}

export async function resolveOrgIds(
  prisma: PrismaClient,
  departmentCode: string,
  designationName: string,
) {
  const department = await prisma.department.findFirst({
    where: { code: departmentCode, deletedAt: null },
  });
  if (!department) {
    throw new Error(`Department code not found: ${departmentCode}`);
  }

  const designation = await prisma.designation.upsert({
    where: {
      departmentId_name: {
        departmentId: department.id,
        name: designationName,
      },
    },
    create: {
      name: designationName,
      departmentId: department.id,
      isActive: true,
    },
    update: { deletedAt: null, isActive: true },
  });

  return { departmentId: department.id, designationId: designation.id };
}
