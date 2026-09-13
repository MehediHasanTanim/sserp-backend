import { PrismaClient } from '@prisma/client';

const SKILL_DOMAINS = [
  { name: 'Communication', sequence: 1 },
  { name: 'Social', sequence: 2 },
  { name: 'Cognitive', sequence: 3 },
  { name: 'Motor', sequence: 4 },
  { name: 'Self-care', sequence: 5 },
  { name: 'Behavioral', sequence: 6 },
];

const ACTIVITY_TYPES = [
  { name: 'Field trip', defaultFeeAmount: 30000 },
  { name: 'Sports session', defaultFeeAmount: 0 },
  { name: 'Swimming', defaultFeeAmount: 15000 },
  { name: 'Nature walk', defaultFeeAmount: 0 },
  { name: 'Community outing', defaultFeeAmount: 20000 },
];

const MONTHLY_PROGRESS_SECTIONS = [
  { key: 'communication', label: 'Communication skills', type: 'narrative' },
  { key: 'social', label: 'Social skills', type: 'narrative' },
  { key: 'cognitive', label: 'Cognitive development', type: 'narrative' },
  { key: 'motor', label: 'Motor skills', type: 'narrative' },
  { key: 'self_care', label: 'Self-care skills', type: 'narrative' },
  { key: 'behavioral', label: 'Behavioral observations', type: 'narrative' },
  { key: 'general_remarks', label: 'General remarks', type: 'narrative' },
];

const QUARTERLY_IEP_SECTIONS = [
  { key: 'goal_summary', label: 'Goal progress summary', type: 'narrative' },
  {
    key: 'domain_ratings',
    label: 'Domain-wise rating',
    type: 'rating',
  },
  { key: 'achievements', label: 'Key achievements', type: 'narrative' },
  { key: 'challenges', label: 'Challenges observed', type: 'narrative' },
  {
    key: 'next_quarter_plan',
    label: 'Plan for next quarter',
    type: 'narrative',
  },
];

const RATING_SCALE = {
  options: [
    { value: 'not_started', label: 'Not started' },
    { value: 'emerging', label: 'Emerging' },
    { value: 'progressing', label: 'Progressing' },
    { value: 'achieved', label: 'Achieved' },
  ],
};

/**
 * Phase 2 School Advanced reference data: skill domains, catch-all report
 * templates, activity types, and the default tuition fee category/head.
 * Called from `reference.seed.ts` (docs/plan/backend/03-phase2-school-advanced.md §9).
 */
export async function seedPhase2(prisma: PrismaClient) {
  for (const domain of SKILL_DOMAINS) {
    await prisma.skillDomain.upsert({
      where: { name: domain.name },
      create: { ...domain, isActive: true },
      update: { sequence: domain.sequence, isActive: true },
    });
  }

  const existingMonthly = await prisma.reportTemplate.findFirst({
    where: { reportType: 'monthly_progress', disabilityCategory: null },
  });
  if (!existingMonthly) {
    await prisma.reportTemplate.create({
      data: {
        name: 'Monthly Progress Report (catch-all)',
        reportType: 'monthly_progress',
        disabilityCategory: null,
        sections: MONTHLY_PROGRESS_SECTIONS,
        ratingScale: RATING_SCALE,
        isActive: true,
      },
    });
  }

  const existingQuarterly = await prisma.reportTemplate.findFirst({
    where: { reportType: 'quarterly_iep', disabilityCategory: null },
  });
  if (!existingQuarterly) {
    await prisma.reportTemplate.create({
      data: {
        name: 'Quarterly IEP Programme Report (catch-all)',
        reportType: 'quarterly_iep',
        disabilityCategory: null,
        sections: QUARTERLY_IEP_SECTIONS,
        ratingScale: RATING_SCALE,
        isActive: true,
      },
    });
  }

  for (const type of ACTIVITY_TYPES) {
    await prisma.activityType.upsert({
      where: { name: type.name },
      create: { ...type, isActive: true },
      update: { defaultFeeAmount: type.defaultFeeAmount, isActive: true },
    });
  }

  const feeCategory = await prisma.feeCategory.upsert({
    where: { name: 'Standard' },
    create: {
      name: 'Standard',
      description: 'Default fee category applied to all students',
      isActive: true,
    },
    update: { isActive: true },
  });

  const tuitionHead = await prisma.feeHead.upsert({
    where: { code: 'TUITION' },
    create: {
      code: 'TUITION',
      name: 'Tuition Fee',
      headType: 'tuition',
      isRecurring: true,
      isActive: true,
    },
    update: { isActive: true },
  });

  const academicYear =
    (await prisma.academicYear.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.academicYear.findFirst({ orderBy: { startDate: 'desc' } }));

  if (academicYear) {
    const existingStructure = await prisma.feeStructure.findFirst({
      where: {
        academicYearId: academicYear.id,
        feeCategoryId: feeCategory.id,
        feeHeadId: tuitionHead.id,
        frequency: 'monthly',
      },
    });
    if (!existingStructure) {
      await prisma.feeStructure.create({
        data: {
          academicYearId: academicYear.id,
          feeCategoryId: feeCategory.id,
          feeHeadId: tuitionHead.id,
          amount: 500000,
          frequency: 'monthly',
          effectiveFrom: academicYear.startDate,
        },
      });
    }
  }

  // Assign Standard category to active students that have no open assignment.
  const activeStudents = await prisma.student.findMany({
    where: { deletedAt: null, status: 'active' },
    select: { id: true },
  });
  let assigned = 0;
  for (const student of activeStudents) {
    const open = await prisma.studentFeeAssignment.findFirst({
      where: { studentId: student.id, effectiveTo: null },
    });
    if (open) continue;
    await prisma.studentFeeAssignment.create({
      data: {
        studentId: student.id,
        feeCategoryId: feeCategory.id,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    assigned += 1;
  }

  console.log(
    `Phase 2 (School Advanced) seed complete (fee category: ${feeCategory.name}, assigned: ${assigned})`,
  );
}
