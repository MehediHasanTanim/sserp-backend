import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { TxClient } from '../../../shared/prisma/transaction.helper';

export interface CreateMappingInput {
  studentId: string;
  teacherEmployeeId: string;
  shiftId: string;
  reason?: string;
}

interface ActiveMappingRow {
  id: string;
  shift_id: string;
}

/**
 * The shift cap lives here (M-01–M-08). All checks run inside a single
 * transaction under `SELECT ... FOR UPDATE` on the teacher's active
 * mappings so two concurrent requests cannot both pass the cap check.
 * See docs/plan/backend/02-phase1-hr-school-core.md §6.
 */
@Injectable()
export class TeacherMappingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    shiftId?: string;
    teacherEmployeeId?: string;
    studentId?: string;
    isActive?: boolean;
  }) {
    return this.prisma.studentTeacherMapping.findMany({
      where: {
        shiftId: query.shiftId,
        teacherEmployeeId: query.teacherEmployeeId,
        studentId: query.studentId,
        isActive: query.isActive,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async history(query: { studentId?: string; teacherEmployeeId?: string }) {
    return this.prisma.studentTeacherMapping.findMany({
      where: {
        studentId: query.studentId,
        teacherEmployeeId: query.teacherEmployeeId,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  /** Teachers with free shift capacity, i.e. active-mapping count < assigned-shift count. */
  async eligibility() {
    const teachers = await this.prisma.teacher.findMany({
      where: { status: 'active' },
      include: {
        shiftAssignments: { where: { isActive: true } },
      },
    });
    const results: Array<{
      teacherId: string;
      employeeId: string;
      assignedShiftIds: string[];
      activeMappingShiftIds: string[];
      freeShiftIds: string[];
    }> = [];
    for (const teacher of teachers) {
      const assignedShiftIds = teacher.shiftAssignments.map((a) => a.shiftId);
      if (!assignedShiftIds.length) continue;
      const activeMappings = await this.prisma.studentTeacherMapping.findMany({
        where: { teacherEmployeeId: teacher.employeeId, isActive: true },
      });
      const activeMappingShiftIds = activeMappings.map((m) => m.shiftId);
      const freeShiftIds = assignedShiftIds.filter(
        (shiftId) => !activeMappingShiftIds.includes(shiftId),
      );
      if (freeShiftIds.length) {
        results.push({
          teacherId: teacher.id,
          employeeId: teacher.employeeId,
          assignedShiftIds,
          activeMappingShiftIds,
          freeShiftIds,
        });
      }
    }
    return results;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(input: CreateMappingInput, _actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: { id: input.studentId, deletedAt: null },
      });
      if (!student) throw DomainException.notFound('Student not found');

      // M-05: only active students are mappable.
      if (student.status === 'pending_admission_fee') {
        throw DomainException.withCode(
          ErrorCode.ADMISSION_FEE_PENDING,
          422,
          'Student cannot be mapped until the admission fee is settled',
        );
      }
      if (student.status !== 'active') {
        throw DomainException.withCode(
          ErrorCode.STUDENT_NOT_ACTIVE,
          422,
          `Student status ${student.status} is not mappable`,
        );
      }

      // M-04: mapping shift must equal the student's currently enrolled shift.
      if (student.shiftId !== input.shiftId) {
        throw DomainException.withCode(
          ErrorCode.SHIFT_MISMATCH,
          409,
          "Mapping shift must match the student's enrolled shift",
        );
      }

      const teacher = await tx.teacher.findUnique({
        where: { employeeId: input.teacherEmployeeId },
      });
      if (!teacher) throw DomainException.notFound('Teacher profile not found');

      // M-07: lock the teacher's active mappings before evaluating the cap.
      const lockedRows = await tx.$queryRaw<ActiveMappingRow[]>`
        SELECT id, shift_id
        FROM student_teacher_mappings
        WHERE teacher_employee_id = ${input.teacherEmployeeId}::uuid
          AND is_active = true
        FOR UPDATE
      `;

      const assignedShiftAssignments = await tx.teacherShiftAssignment.findMany(
        {
          where: { teacherId: teacher.id, isActive: true },
        },
      );
      const assignedShiftIds = assignedShiftAssignments.map((a) => a.shiftId);

      // M-03: mapping shift must be one the teacher is actively assigned to.
      if (!assignedShiftIds.includes(input.shiftId)) {
        throw DomainException.withCode(
          ErrorCode.TEACHER_NOT_IN_SHIFT,
          409,
          'Teacher is not actively assigned to this shift',
        );
      }

      // M-06: a student may have only one active primary mapping.
      const existingStudentMapping = await tx.studentTeacherMapping.findFirst({
        where: { studentId: input.studentId, isActive: true },
      });
      if (existingStudentMapping) {
        throw DomainException.withCode(
          ErrorCode.STUDENT_ALREADY_MAPPED,
          409,
          'Student already has an active primary mapping; end it before creating a new one',
        );
      }

      // M-01/M-02: cap = number of assigned shifts (1 or 2), at most one mapping per shift.
      const sameShiftMapping = lockedRows.find(
        (row) => row.shift_id === input.shiftId,
      );
      if (sameShiftMapping) {
        throw DomainException.withCode(
          ErrorCode.SHIFT_CAP_EXCEEDED,
          409,
          'Teacher already holds an active mapping in this shift',
        );
      }
      if (lockedRows.length >= assignedShiftIds.length) {
        throw DomainException.withCode(
          ErrorCode.SHIFT_CAP_EXCEEDED,
          409,
          'Teacher has reached the maximum number of active mappings for their assigned shifts',
        );
      }

      try {
        return await tx.studentTeacherMapping.create({
          data: {
            studentId: input.studentId,
            teacherEmployeeId: input.teacherEmployeeId,
            shiftId: input.shiftId,
            mappingType: 'primary',
            startDate: new Date(),
            isActive: true,
            createdReason: input.reason,
          },
        });
      } catch (err) {
        // Belt-and-braces: when the teacher has zero pre-existing active
        // mappings, `SELECT ... FOR UPDATE` has no row to lock, so two
        // concurrent transactions can both pass the in-app cap check. The
        // partial unique index on (teacher_employee_id, shift_id) WHERE
        // is_active catches that phantom race — translate it to the same
        // domain error the pre-check produces.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const target =
            (err.meta?.target as string[] | string | undefined) ?? '';
          const targetStr = Array.isArray(target) ? target.join(',') : target;
          if (targetStr.includes('student_active')) {
            throw DomainException.withCode(
              ErrorCode.STUDENT_ALREADY_MAPPED,
              409,
              'Student already has an active primary mapping; end it before creating a new one',
            );
          }
          throw DomainException.withCode(
            ErrorCode.SHIFT_CAP_EXCEEDED,
            409,
            'Teacher already holds an active mapping in this shift',
          );
        }
        throw err;
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async end(mappingId: string, reason: string, _actorId: string) {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const mapping = await tx.studentTeacherMapping.findUnique({
        where: { id: mappingId },
      });
      if (!mapping) throw DomainException.notFound('Mapping not found');
      if (!mapping.isActive) {
        throw DomainException.conflict('Mapping is already ended');
      }
      return tx.studentTeacherMapping.update({
        where: { id: mappingId },
        data: {
          isActive: false,
          endDate: new Date(),
          endedReason: reason,
        },
      });
    });
  }
}
