import { TeacherMappingService } from './teacher-mapping.service';

const MORNING = 'shift-morning';
const DAY = 'shift-day';

describe('TeacherMappingService', () => {
  let tx: {
    student: { findFirst: jest.Mock };
    teacher: { findUnique: jest.Mock };
    $queryRaw: jest.Mock;
    teacherShiftAssignment: { findMany: jest.Mock };
    studentTeacherMapping: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let prisma: { $transaction: jest.Mock };
  let service: TeacherMappingService;

  const activeStudent = { id: 'stu1', status: 'active', shiftId: MORNING };

  beforeEach(() => {
    tx = {
      student: { findFirst: jest.fn().mockResolvedValue({ ...activeStudent }) },
      teacher: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 't1', employeeId: 'emp1' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      teacherShiftAssignment: {
        findMany: jest.fn().mockResolvedValue([{ shiftId: MORNING }]),
      },
      studentTeacherMapping: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'map1', ...data })),
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'map1', ...data })),
      },
    };
    prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    service = new TeacherMappingService(prisma as never);
  });

  it('creates a mapping when the teacher has free single-shift capacity', async () => {
    const result = await service.create(
      { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: MORNING },
      'actor1',
    );
    expect(result).toMatchObject({
      studentId: 'stu1',
      shiftId: MORNING,
      isActive: true,
    });
  });

  it('blocks a second mapping in the same shift (SHIFT_CAP_EXCEEDED)', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'existing', shift_id: MORNING }]);
    await expect(
      service.create(
        { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: MORNING },
        'actor1',
      ),
    ).rejects.toMatchObject({ code: 'SHIFT_CAP_EXCEEDED', statusCode: 409 });
  });

  it('allows Morning + Day for a dual-shift teacher', async () => {
    tx.teacherShiftAssignment.findMany.mockResolvedValue([
      { shiftId: MORNING },
      { shiftId: DAY },
    ]);
    tx.$queryRaw.mockResolvedValue([{ id: 'existing', shift_id: MORNING }]);
    tx.student.findFirst.mockResolvedValue({ ...activeStudent, shiftId: DAY });

    const result = await service.create(
      { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: DAY },
      'actor1',
    );
    expect(result).toMatchObject({ shiftId: DAY });
  });

  it('blocks a third mapping for a dual-shift teacher', async () => {
    tx.teacherShiftAssignment.findMany.mockResolvedValue([
      { shiftId: MORNING },
      { shiftId: DAY },
    ]);
    tx.$queryRaw.mockResolvedValue([
      { id: 'm1', shift_id: MORNING },
      { id: 'm2', shift_id: DAY },
    ]);
    tx.student.findFirst.mockResolvedValue({ ...activeStudent, shiftId: DAY });

    await expect(
      service.create(
        { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: DAY },
        'actor1',
      ),
    ).rejects.toMatchObject({ code: 'SHIFT_CAP_EXCEEDED', statusCode: 409 });
  });

  it('blocks mapping to a shift the teacher is not assigned to (TEACHER_NOT_IN_SHIFT)', async () => {
    tx.student.findFirst.mockResolvedValue({ ...activeStudent, shiftId: DAY });
    tx.teacherShiftAssignment.findMany.mockResolvedValue([
      { shiftId: MORNING },
    ]);

    await expect(
      service.create(
        { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: DAY },
        'actor1',
      ),
    ).rejects.toMatchObject({ code: 'TEACHER_NOT_IN_SHIFT', statusCode: 409 });
  });

  it("blocks mapping when the student's shift differs from the mapping shift (SHIFT_MISMATCH)", async () => {
    tx.student.findFirst.mockResolvedValue({ ...activeStudent, shiftId: DAY });

    await expect(
      service.create(
        { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: MORNING },
        'actor1',
      ),
    ).rejects.toMatchObject({ code: 'SHIFT_MISMATCH', statusCode: 409 });
  });

  it('blocks mapping a pending_admission_fee student (ADMISSION_FEE_PENDING)', async () => {
    tx.student.findFirst.mockResolvedValue({
      ...activeStudent,
      status: 'pending_admission_fee',
    });
    await expect(
      service.create(
        { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: MORNING },
        'actor1',
      ),
    ).rejects.toMatchObject({ code: 'ADMISSION_FEE_PENDING', statusCode: 422 });
  });

  it('blocks mapping a student who already has an active mapping (STUDENT_ALREADY_MAPPED)', async () => {
    tx.studentTeacherMapping.findFirst.mockResolvedValue({
      id: 'existingMapping',
    });
    await expect(
      service.create(
        { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: MORNING },
        'actor1',
      ),
    ).rejects.toMatchObject({
      code: 'STUDENT_ALREADY_MAPPED',
      statusCode: 409,
    });
  });

  it('ending a mapping frees the shift slot for a new mapping', async () => {
    tx.studentTeacherMapping.findUnique.mockResolvedValue({
      id: 'map1',
      isActive: true,
    });
    const ended = await service.end('map1', 'transferred out', 'actor1');
    expect(ended).toMatchObject({
      isActive: false,
      endedReason: 'transferred out',
    });

    // Freed capacity: no locked active rows now.
    tx.$queryRaw.mockResolvedValue([]);
    const result = await service.create(
      { studentId: 'stu1', teacherEmployeeId: 'emp1', shiftId: MORNING },
      'actor1',
    );
    expect(result).toMatchObject({ shiftId: MORNING });
  });
});
