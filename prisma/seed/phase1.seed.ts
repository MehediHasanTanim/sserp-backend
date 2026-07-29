import { PrismaClient } from '@prisma/client';

const GLOBAL_ADMISSION_FEE_AMOUNT = 5000;
const DEFAULT_FREEZE_AFTER_DAYS = 7;

function time(hours: number, minutes = 0): Date {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

/**
 * Phase 1 School reference data: Morning + Day shifts, a current academic
 * year, the global admission fee setting, and attendance settings.
 * Called from `reference.seed.ts` (docs/plan/backend/02-phase1-hr-school-core.md §11).
 */
export async function seedPhase1(prisma: PrismaClient) {
  await prisma.shift.upsert({
    where: { name: 'Morning' },
    create: {
      name: 'Morning',
      startTime: time(8),
      endTime: time(12),
      capacityLimit: 60,
      workingHours: 4,
      isActive: true,
    },
    update: {},
  });

  await prisma.shift.upsert({
    where: { name: 'Day' },
    create: {
      name: 'Day',
      startTime: time(12),
      endTime: time(16),
      capacityLimit: 60,
      workingHours: 4,
      isActive: true,
    },
    update: {},
  });

  let currentYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
  });
  if (!currentYear) {
    const now = new Date();
    const startYear =
      now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    currentYear = await prisma.academicYear.create({
      data: {
        name: `${startYear}-${startYear + 1}`,
        startDate: new Date(Date.UTC(startYear, 6, 1)),
        endDate: new Date(Date.UTC(startYear + 1, 5, 30)),
        isCurrent: true,
        status: 'active',
      },
    });
  }

  const existingFeeSetting = await prisma.admissionFeeSetting.findFirst({
    where: { academicYearId: currentYear.id, studentCategory: null },
  });
  if (!existingFeeSetting) {
    await prisma.admissionFeeSetting.create({
      data: {
        academicYearId: currentYear.id,
        studentCategory: null,
        amount: GLOBAL_ADMISSION_FEE_AMOUNT,
        isActive: true,
      },
    });
  }

  await prisma.attendanceSetting.upsert({
    where: { academicYearId: currentYear.id },
    create: {
      academicYearId: currentYear.id,
      freezeAfterDays: DEFAULT_FREEZE_AFTER_DAYS,
      allowTeacherMarking: true,
      unauthorizedAbsenceAlertEnabled: true,
    },
    update: {},
  });

  console.log('Phase 1 (School) seed complete');
}
