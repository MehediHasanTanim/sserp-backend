import {
  PrismaClient,
  AcademicYear,
  Employee,
  EmployeeStatus,
  EmploymentType,
  EnrollmentStatus,
  HolidayType,
  HrDepartment,
  Shift,
  Student,
  StudentStatus,
  Teacher,
} from '@prisma/client';
import { faker } from '@faker-js/faker';

faker.seed(20260729);

const TARGET_HOLIDAYS = 10;
const TARGET_EMPLOYEES = 25;
const TARGET_TEACHERS = 12;
const TARGET_STUDENTS = 30;

/**
 * Demo dataset for Phase 1 exit criteria (docs/plan/backend/02-phase1-hr-school-core.md §11):
 * 2 academic years, 2 shifts (from `seedPhase1`), 10 holidays, 25 employees,
 * 12 teachers with mixed shift assignments, 30 students across all statuses.
 * Only invoked when `SEED_DEMO=true` — see `reference.seed.ts`.
 */
export async function seedDemo(prisma: PrismaClient) {
  const { current, previous } = await ensureAcademicYears(prisma);
  await ensureHolidays(prisma, current);
  const shifts = await prisma.shift.findMany();

  const employees = await ensureEmployees(prisma);
  const teachers = await ensureTeachers(prisma, employees);
  await ensureTeacherShiftAssignments(prisma, teachers, shifts, current);

  const students = await ensureStudents(prisma, current, shifts);
  await ensureGuardians(prisma, students);
  await ensureTeacherMappings(prisma, students);

  console.log(
    `Demo seed complete: academic years=${previous ? 2 : 1}, holidays>=${TARGET_HOLIDAYS}, employees=${employees.length}, teachers=${teachers.length}, students=${students.length}`,
  );
}

async function nextCode(
  prisma: PrismaClient,
  entityType: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        prefix: string;
        padding: number;
        current_sequence: number;
      }>
    >`
      SELECT id, prefix, padding, current_sequence
      FROM numbering_schemes
      WHERE entity_type = ${entityType}
      FOR UPDATE
    `;
    if (!rows.length) {
      throw new Error(`Numbering scheme ${entityType} not found`);
    }
    const row = rows[0];
    const sequence = row.current_sequence + 1;
    await tx.numberingScheme.update({
      where: { id: row.id },
      data: { currentSequence: sequence },
    });
    return `${row.prefix}${String(sequence).padStart(row.padding, '0')}`;
  });
}

async function ensureAcademicYears(
  prisma: PrismaClient,
): Promise<{ current: AcademicYear; previous: AcademicYear | null }> {
  const current = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
  });
  if (!current) {
    throw new Error(
      'Expected a current academic year (run seedPhase1 before seedDemo)',
    );
  }

  let previous = await prisma.academicYear.findFirst({
    where: { isCurrent: false, status: 'closed' },
  });
  if (!previous) {
    const startYear = current.startDate.getUTCFullYear() - 1;
    previous = await prisma.academicYear.create({
      data: {
        name: `${startYear}-${startYear + 1}`,
        startDate: new Date(Date.UTC(startYear, 6, 1)),
        endDate: new Date(Date.UTC(startYear + 1, 5, 30)),
        isCurrent: false,
        status: 'closed',
      },
    });
  }
  return { current, previous };
}

interface HolidayTemplate {
  name: string;
  month: number; // 0-based, matches JS Date month index
  day: number;
  type: HolidayType;
  departments: string[];
}

const HOLIDAY_TEMPLATES: HolidayTemplate[] = [
  {
    name: 'International Mother Language Day',
    month: 1,
    day: 21,
    type: 'public',
    departments: [],
  },
  {
    name: 'Independence Day',
    month: 2,
    day: 26,
    type: 'public',
    departments: [],
  },
  {
    name: 'Bengali New Year',
    month: 3,
    day: 14,
    type: 'public',
    departments: [],
  },
  { name: 'May Day', month: 4, day: 1, type: 'public', departments: [] },
  {
    name: 'National Mourning Day',
    month: 7,
    day: 15,
    type: 'public',
    departments: [],
  },
  { name: 'Victory Day', month: 11, day: 16, type: 'public', departments: [] },
  {
    name: 'Winter Break',
    month: 11,
    day: 25,
    type: 'school',
    departments: ['school'],
  },
  {
    name: 'Spring Term Break',
    month: 2,
    day: 1,
    type: 'school',
    departments: ['school', 'therapy'],
  },
  {
    name: "Founders' Day",
    month: 8,
    day: 5,
    type: 'optional',
    departments: [],
  },
  {
    name: 'Annual Sports Day',
    month: 0,
    day: 10,
    type: 'school',
    departments: ['school', 'therapy'],
  },
];

function dateInAcademicYear(
  academicYear: AcademicYear,
  month: number,
  day: number,
): Date {
  const startYear = academicYear.startDate.getUTCFullYear();
  const year = month >= 6 ? startYear : startYear + 1;
  return new Date(Date.UTC(year, month, day));
}

async function ensureHolidays(
  prisma: PrismaClient,
  academicYear: AcademicYear,
) {
  for (const tmpl of HOLIDAY_TEMPLATES) {
    const count = await prisma.holiday.count({
      where: { academicYearId: academicYear.id },
    });
    if (count >= TARGET_HOLIDAYS) break;

    const holidayDate = dateInAcademicYear(academicYear, tmpl.month, tmpl.day);
    const existing = await prisma.holiday.findFirst({
      where: { holidayDate, type: tmpl.type },
    });
    if (existing) continue;

    await prisma.holiday.create({
      data: {
        name: tmpl.name,
        holidayDate,
        type: tmpl.type,
        academicYearId: academicYear.id,
        appliesToDepartments: tmpl.departments,
        description: `${tmpl.name} (demo seed)`,
      },
    });
  }
}

interface EmployeeSpec {
  department: HrDepartment;
  designation: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  basicSalary: number;
}

/** 25 employees: 14 school (12 teacher candidates + 2 support), 5 therapy, 4 administration, 2 support. */
function buildEmployeeSpecs(): EmployeeSpec[] {
  const specs: EmployeeSpec[] = [];
  for (let i = 0; i < 10; i++) {
    specs.push({
      department: 'school',
      designation: 'Special Education Teacher',
      employmentType: 'permanent',
      status: 'active',
      basicSalary: 38000,
    });
  }
  for (let i = 0; i < 2; i++) {
    specs.push({
      department: 'school',
      designation: 'Special Education Teacher',
      employmentType: 'permanent',
      status: 'on_probation',
      basicSalary: 34000,
    });
  }
  specs.push({
    department: 'school',
    designation: 'School Coordinator',
    employmentType: 'permanent',
    status: 'active',
    basicSalary: 45000,
  });
  specs.push({
    department: 'school',
    designation: 'School Assistant',
    employmentType: 'contractual',
    status: 'on_notice',
    basicSalary: 22000,
  });
  specs.push({
    department: 'therapy',
    designation: 'Speech Therapist',
    employmentType: 'permanent',
    status: 'active',
    basicSalary: 42000,
  });
  specs.push({
    department: 'therapy',
    designation: 'Occupational Therapist',
    employmentType: 'permanent',
    status: 'active',
    basicSalary: 42000,
  });
  specs.push({
    department: 'therapy',
    designation: 'Physiotherapist',
    employmentType: 'contractual',
    status: 'active',
    basicSalary: 40000,
  });
  specs.push({
    department: 'therapy',
    designation: 'Behavioral Therapist',
    employmentType: 'permanent',
    status: 'resigned',
    basicSalary: 41000,
  });
  specs.push({
    department: 'therapy',
    designation: 'Therapy Assistant',
    employmentType: 'part_time',
    status: 'active',
    basicSalary: 20000,
  });
  specs.push({
    department: 'administration',
    designation: 'HR Officer',
    employmentType: 'permanent',
    status: 'active',
    basicSalary: 35000,
  });
  specs.push({
    department: 'administration',
    designation: 'Accountant',
    employmentType: 'permanent',
    status: 'active',
    basicSalary: 36000,
  });
  specs.push({
    department: 'administration',
    designation: 'Admin Officer',
    employmentType: 'permanent',
    status: 'terminated',
    basicSalary: 30000,
  });
  specs.push({
    department: 'administration',
    designation: 'Office Manager',
    employmentType: 'permanent',
    status: 'active',
    basicSalary: 38000,
  });
  specs.push({
    department: 'support',
    designation: 'Caretaker',
    employmentType: 'part_time',
    status: 'active',
    basicSalary: 16000,
  });
  specs.push({
    department: 'support',
    designation: 'Security Guard',
    employmentType: 'permanent',
    status: 'retired',
    basicSalary: 18000,
  });
  return specs;
}

async function ensureEmployees(prisma: PrismaClient): Promise<Employee[]> {
  const existing = await prisma.employee.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (existing.length >= TARGET_EMPLOYEES) return existing;

  const specs = buildEmployeeSpecs().slice(existing.length);
  const created: Employee[] = [];
  for (const spec of specs) {
    const employeeCode = await nextCode(prisma, 'employee');
    const joiningDate = faker.date.past({ years: 5 });
    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        fullName: faker.person.fullName(),
        dateOfBirth: faker.date.birthdate({ min: 22, max: 55, mode: 'age' }),
        gender: faker.helpers.arrayElement(['male', 'female']),
        personalEmail: faker.internet.email().toLowerCase(),
        phone: faker.phone.number(),
        department: spec.department,
        designation: spec.designation,
        employmentType: spec.employmentType,
        joiningDate,
        basicSalary: spec.basicSalary,
        status: spec.status,
      },
    });
    created.push(employee);
  }
  return [...existing, ...created];
}

const SPECIALIZATIONS = [
  'Autism Spectrum',
  'Speech & Language',
  'Behavioral Support',
  'Sensory Integration',
  'Early Intervention',
  'Life Skills',
];

async function ensureTeachers(
  prisma: PrismaClient,
  employees: Employee[],
): Promise<Teacher[]> {
  const existing = await prisma.teacher.findMany();
  if (existing.length >= TARGET_TEACHERS) return existing;

  const existingEmployeeIds = new Set(existing.map((t) => t.employeeId));
  const candidates = employees.filter(
    (e) =>
      e.department === 'school' &&
      e.designation === 'Special Education Teacher' &&
      !existingEmployeeIds.has(e.id),
  );
  const needed = TARGET_TEACHERS - existing.length;
  const toCreate = candidates.slice(0, needed);

  const created: Teacher[] = [];
  for (const employee of toCreate) {
    const teacher = await prisma.teacher.create({
      data: {
        employeeId: employee.id,
        specializationAreas: faker.helpers.arrayElements(SPECIALIZATIONS, {
          min: 1,
          max: 3,
        }),
        teachingMethodology: faker.helpers.arrayElement([
          'TEACCH',
          'ABA',
          'Montessori-adapted',
        ]),
        yearsExperienceSpecialNeeds: faker.number.int({ min: 1, max: 15 }),
        status: 'active',
      },
    });
    created.push(teacher);
  }
  return [...existing, ...created];
}

/** 5 Morning-only, 5 Day-only, 2 both — "mixed" shift coverage across 12 teachers. */
const SHIFT_PATTERN: Array<'morning' | 'day' | 'both'> = [
  'morning',
  'morning',
  'morning',
  'morning',
  'morning',
  'day',
  'day',
  'day',
  'day',
  'day',
  'both',
  'both',
];

async function ensureTeacherShiftAssignments(
  prisma: PrismaClient,
  teachers: Teacher[],
  shifts: Shift[],
  academicYear: AcademicYear,
) {
  const morning = shifts.find((s) => s.name === 'Morning');
  const day = shifts.find((s) => s.name === 'Day');
  if (!morning || !day) return;

  for (let i = 0; i < teachers.length; i++) {
    const teacher = teachers[i];
    const existingAssignments = await prisma.teacherShiftAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true },
    });
    if (existingAssignments.length) continue;

    const kind = SHIFT_PATTERN[i % SHIFT_PATTERN.length];
    const shiftIds =
      kind === 'both'
        ? [morning.id, day.id]
        : kind === 'morning'
          ? [morning.id]
          : [day.id];

    for (const shiftId of shiftIds) {
      await prisma.teacherShiftAssignment.create({
        data: {
          teacherId: teacher.id,
          shiftId,
          effectiveFrom: academicYear.startDate,
          isActive: true,
        },
      });
    }
  }
}

/** 30 students spanning every `StudentStatus`. */
function buildStudentStatusPlan(): StudentStatus[] {
  return [
    ...Array(6).fill('pending_admission_fee'),
    ...Array(14).fill('active'),
    ...Array(3).fill('on_leave'),
    ...Array(3).fill('inactive'),
    ...Array(2).fill('graduated'),
    ...Array(1).fill('transferred'),
    ...Array(1).fill('withdrawn'),
  ] as StudentStatus[];
}

function enrollmentStatusFor(status: StudentStatus): EnrollmentStatus {
  if (status === 'graduated') return 'completed';
  if (status === 'transferred' || status === 'withdrawn') return 'withdrawn';
  return 'enrolled';
}

const DISABILITY_CATEGORIES = [
  'Autism Spectrum Disorder',
  'Intellectual Disability',
  'Down Syndrome',
  'Cerebral Palsy',
  'ADHD',
];

async function ensureStudents(
  prisma: PrismaClient,
  academicYear: AcademicYear,
  shifts: Shift[],
): Promise<Student[]> {
  const existing = await prisma.student.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (existing.length >= TARGET_STUDENTS) return existing;

  const morning = shifts.find((s) => s.name === 'Morning');
  const day = shifts.find((s) => s.name === 'Day');
  if (!morning || !day) return existing;

  const feeSetting = await prisma.admissionFeeSetting.findFirst({
    where: {
      academicYearId: academicYear.id,
      studentCategory: null,
      isActive: true,
    },
  });
  const feeAmount = feeSetting?.amount ?? 5000;

  const statusPlan = buildStudentStatusPlan();
  const deficit = statusPlan.slice(existing.length);

  const created: Student[] = [];
  for (let i = 0; i < deficit.length; i++) {
    const globalIndex = existing.length + i;
    const status = deficit[i];
    // Active students alternate 7 Morning / 7 Day to line up with the 14
    // available teacher-shift slots created in ensureTeacherShiftAssignments.
    const shift = globalIndex % 2 === 0 ? morning : day;

    const studentCode = await nextCode(prisma, 'student');
    const admissionDate = faker.date.between({
      from: academicYear.startDate,
      to: new Date(),
    });

    const student = await prisma.student.create({
      data: {
        studentCode,
        fullName: faker.person.fullName(),
        dateOfBirth: faker.date.birthdate({ min: 5, max: 15, mode: 'age' }),
        gender: faker.helpers.arrayElement(['male', 'female']),
        nationality: 'Bangladeshi',
        disabilityCategory: faker.helpers.arrayElement(DISABILITY_CATEGORIES),
        severityLevel: faker.helpers.arrayElement([
          'mild',
          'moderate',
          'severe',
        ]),
        bloodGroup: faker.helpers.arrayElement([
          'A+',
          'B+',
          'O+',
          'AB+',
          'A-',
          'B-',
          'O-',
        ]),
        shiftId: shift.id,
        academicYearId: academicYear.id,
        status,
        admissionDate,
        enrollmentDate: admissionDate,
      },
    });

    await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        academicYearId: academicYear.id,
        shiftId: shift.id,
        enrollmentDate: admissionDate,
        status: enrollmentStatusFor(status),
      },
    });

    const isFeePending = status === 'pending_admission_fee';
    await prisma.admissionFee.create({
      data: {
        studentId: student.id,
        amount: feeAmount,
        status: isFeePending ? 'pending' : 'paid',
        invoiceDate: admissionDate,
        paidDate: isFeePending ? undefined : admissionDate,
        paidAmount: isFeePending ? undefined : feeAmount,
        paymentMethod: isFeePending ? undefined : 'cash',
        receiptNumber: isFeePending
          ? undefined
          : await nextCode(prisma, 'receipt'),
      },
    });

    created.push(student);
  }
  return [...existing, ...created];
}

async function ensureGuardians(prisma: PrismaClient, students: Student[]) {
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const existingCount = await prisma.studentGuardian.count({
      where: { studentId: student.id },
    });
    if (existingCount > 0) continue;
    // ~1 in 7 students has no guardian on file, so "most" (not all) do.
    if (i % 7 === 6) continue;

    const primaryRelation = i % 2 === 0 ? 'Mother' : 'Father';
    await prisma.studentGuardian.create({
      data: {
        studentId: student.id,
        fullName: faker.person.fullName(),
        relation: primaryRelation,
        phone: faker.phone.number(),
        email: faker.internet.email().toLowerCase(),
        occupation: faker.person.jobTitle(),
        isPrimary: true,
        isEmergencyContact: true,
        emergencyPriority: 1,
      },
    });

    if (i % 3 === 0) {
      await prisma.studentGuardian.create({
        data: {
          studentId: student.id,
          fullName: faker.person.fullName(),
          relation: primaryRelation === 'Mother' ? 'Father' : 'Mother',
          phone: faker.phone.number(),
          isPrimary: false,
          isEmergencyContact: false,
        },
      });
    }
  }
}

async function findFreeTeacherSlot(
  prisma: PrismaClient,
  shiftId: string,
): Promise<string | null> {
  const assignments = await prisma.teacherShiftAssignment.findMany({
    where: { shiftId, isActive: true },
    include: { teacher: true },
  });
  for (const assignment of assignments) {
    const activeMapping = await prisma.studentTeacherMapping.findFirst({
      where: {
        teacherEmployeeId: assignment.teacher.employeeId,
        shiftId,
        isActive: true,
      },
    });
    if (!activeMapping) return assignment.teacher.employeeId;
  }
  return null;
}

/** Maps active students to a free teacher-shift slot, respecting the shift cap. */
async function ensureTeacherMappings(
  prisma: PrismaClient,
  students: Student[],
) {
  const activeStudents = students.filter((s) => s.status === 'active');
  for (const student of activeStudents) {
    if (!student.shiftId) continue;
    const existingMapping = await prisma.studentTeacherMapping.findFirst({
      where: { studentId: student.id, isActive: true },
    });
    if (existingMapping) continue;

    const teacherEmployeeId = await findFreeTeacherSlot(
      prisma,
      student.shiftId,
    );
    if (!teacherEmployeeId) continue;

    await prisma.studentTeacherMapping.create({
      data: {
        studentId: student.id,
        teacherEmployeeId,
        shiftId: student.shiftId,
        mappingType: 'primary',
        startDate: new Date(),
        isActive: true,
        createdReason: 'Demo seed primary assignment',
      },
    });
  }
}
