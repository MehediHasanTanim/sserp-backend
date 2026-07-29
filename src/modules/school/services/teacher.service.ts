import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import {
  HrEmployeeReadService,
  HrEmployeeSummary,
} from '../../hr/services/hr-employee-read.service';

export interface CreateTeacherInput {
  employeeId: string;
  specializationAreas?: string[];
  teachingMethodology?: string;
  yearsExperienceSpecialNeeds?: number;
}

export interface UpdateTeacherInput {
  specializationAreas?: string[];
  teachingMethodology?: string;
  yearsExperienceSpecialNeeds?: number;
  status?: 'active' | 'on_leave' | 'resigned' | 'transferred';
}

const MAX_SHIFT_ASSIGNMENTS = 2;

/**
 * School-specific profile layered over the HR employee. Name/contact/
 * designation are NEVER duplicated — always read through
 * `HrEmployeeReadService` (docs/plan/backend/02-phase1-hr-school-core.md §4).
 */
@Injectable()
export class TeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrEmployees: HrEmployeeReadService,
  ) {}

  private async withEmployee<T extends { employeeId: string }>(
    teacher: T,
  ): Promise<T & { employee: HrEmployeeSummary }> {
    const employee = await this.hrEmployees.findById(teacher.employeeId);
    return { ...teacher, employee };
  }

  async list() {
    const teachers = await this.prisma.teacher.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const employees = await this.hrEmployees.findByIds(
      teachers.map((t) => t.employeeId),
    );
    const byId = new Map(employees.map((e) => [e.id, e]));
    return teachers.map((t) => ({ ...t, employee: byId.get(t.employeeId) }));
  }

  async get(id: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: {
        certifications: true,
        shiftAssignments: {
          where: { isActive: true },
          include: { shift: true },
        },
      },
    });
    if (!teacher) throw DomainException.notFound('Teacher not found');
    const mappings = await this.prisma.studentTeacherMapping.findMany({
      where: { teacherEmployeeId: teacher.employeeId, isActive: true },
    });
    return { ...(await this.withEmployee(teacher)), mappings };
  }

  async getByEmployeeId(employeeId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { employeeId },
    });
    if (!teacher) throw DomainException.notFound('Teacher profile not found');
    return teacher;
  }

  /** Creates the School profile for an existing HR employee (never `prisma.employee`). */
  async create(input: CreateTeacherInput) {
    await this.hrEmployees.findById(input.employeeId);
    const existing = await this.prisma.teacher.findUnique({
      where: { employeeId: input.employeeId },
    });
    if (existing) {
      throw DomainException.conflict(
        'This employee already has a teacher profile',
      );
    }
    return this.prisma.teacher.create({
      data: {
        employeeId: input.employeeId,
        specializationAreas: input.specializationAreas ?? [],
        teachingMethodology: input.teachingMethodology,
        yearsExperienceSpecialNeeds: input.yearsExperienceSpecialNeeds,
      },
    });
  }

  async update(id: string, input: UpdateTeacherInput) {
    const existing = await this.prisma.teacher.findUnique({ where: { id } });
    if (!existing) throw DomainException.notFound('Teacher not found');
    return this.prisma.teacher.update({
      where: { id },
      data: {
        specializationAreas: input.specializationAreas,
        teachingMethodology: input.teachingMethodology,
        yearsExperienceSpecialNeeds: input.yearsExperienceSpecialNeeds,
        status: input.status,
      },
    });
  }

  /** A teacher may hold at most two active shift assignments (one per shift). */
  async setShifts(id: string, shiftIds: string[]) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id } });
    if (!teacher) throw DomainException.notFound('Teacher not found');

    const uniqueShiftIds = [...new Set(shiftIds)];
    if (uniqueShiftIds.length > MAX_SHIFT_ASSIGNMENTS) {
      throw DomainException.withCode(
        ErrorCode.SHIFT_CAP_EXCEEDED,
        409,
        `A teacher may be assigned to at most ${MAX_SHIFT_ASSIGNMENTS} shifts`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.teacherShiftAssignment.findMany({
        where: { teacherId: id, isActive: true },
      });

      // M-08: block removal of a shift that still has an active mapping.
      const removed = current.filter(
        (c) => !uniqueShiftIds.includes(c.shiftId),
      );
      for (const removal of removed) {
        const mappingCount = await tx.studentTeacherMapping.count({
          where: {
            teacherEmployeeId: teacher.employeeId,
            shiftId: removal.shiftId,
            isActive: true,
          },
        });
        if (mappingCount > 0) {
          throw DomainException.withCode(
            ErrorCode.MAPPING_EXISTS,
            409,
            'Cannot remove a shift with an active student mapping',
          );
        }
      }

      const today = new Date();
      await tx.teacherShiftAssignment.updateMany({
        where: {
          teacherId: id,
          isActive: true,
          shiftId: { notIn: uniqueShiftIds },
        },
        data: { isActive: false, effectiveTo: today },
      });

      for (const shiftId of uniqueShiftIds) {
        const already = current.find((c) => c.shiftId === shiftId);
        if (already) continue;
        await tx.teacherShiftAssignment.create({
          data: {
            teacherId: id,
            shiftId,
            effectiveFrom: today,
            isActive: true,
          },
        });
      }

      return tx.teacherShiftAssignment.findMany({
        where: { teacherId: id, isActive: true },
        include: { shift: true },
      });
    });
  }

  async listCertifications(teacherId: string) {
    await this.get(teacherId);
    return this.prisma.teacherCertification.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addCertification(
    teacherId: string,
    input: {
      title: string;
      issuingBody: string;
      issuedDate?: string;
      expiryDate?: string;
      attachmentId?: string;
    },
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
    });
    if (!teacher) throw DomainException.notFound('Teacher not found');
    return this.prisma.teacherCertification.create({
      data: {
        teacherId,
        title: input.title,
        issuingBody: input.issuingBody,
        issuedDate: input.issuedDate ? new Date(input.issuedDate) : undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        attachmentId: input.attachmentId,
      },
    });
  }
}
