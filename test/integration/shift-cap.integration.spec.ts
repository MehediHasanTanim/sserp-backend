import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { TeacherMappingService } from '../../src/modules/school/services/teacher-mapping.service';

/**
 * M-01/M-07: the shift cap is enforced under `SELECT ... FOR UPDATE`, so
 * firing N concurrent mapping requests for the same teacher/shift must
 * produce exactly one success. See docs/plan/backend/02-phase1-hr-school-core.md §11.
 */
describe('Shift cap concurrency integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mappings: TeacherMappingService;
  const actorId = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    mappings = app.get(TeacherMappingService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('10 parallel create() calls for the same teacher/shift yield exactly one success', async () => {
    const shift = await prisma.shift.findFirstOrThrow({
      where: { name: 'Morning' },
    });
    const academicYear = await prisma.academicYear.findFirstOrThrow({
      where: { isCurrent: true },
    });

    const employee = await prisma.employee.create({
      data: {
        employeeCode: `EMP-TEST-${randomUUID()}`,
        fullName: 'Shift Cap Test Teacher',
        department: 'school',
        designation: 'Special Education Teacher',
        employmentType: 'permanent',
        joiningDate: new Date('2020-01-01'),
        basicSalary: 30000,
        status: 'active',
      },
    });
    const teacher = await prisma.teacher.create({
      data: { employeeId: employee.id, status: 'active' },
    });
    await prisma.teacherShiftAssignment.create({
      data: {
        teacherId: teacher.id,
        shiftId: shift.id,
        effectiveFrom: new Date('2020-01-01'),
        isActive: true,
      },
    });

    const students = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        prisma.student.create({
          data: {
            studentCode: `STU-TEST-${randomUUID()}`,
            fullName: `Shift Cap Test Student ${i + 1}`,
            shiftId: shift.id,
            academicYearId: academicYear.id,
            status: 'active',
          },
        }),
      ),
    );

    const results = await Promise.allSettled(
      students.map((student) =>
        mappings.create(
          {
            studentId: student.id,
            teacherEmployeeId: employee.id,
            shiftId: shift.id,
          },
          actorId,
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected',
    ) as Array<PromiseRejectedResult>;

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(9);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({
        code: 'SHIFT_CAP_EXCEEDED',
        statusCode: 409,
      });
    }

    const activeMappings = await prisma.studentTeacherMapping.count({
      where: { teacherEmployeeId: employee.id, isActive: true },
    });
    expect(activeMappings).toBe(1);
  });
});
