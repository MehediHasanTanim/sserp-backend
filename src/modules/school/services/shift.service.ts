import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';

export interface CreateShiftInput {
  name: string;
  startTime: string;
  endTime: string;
  capacityLimit?: number;
  breakStart?: string;
  breakEnd?: string;
  workingHours?: number;
  isActive?: boolean;
}

export type UpdateShiftInput = Partial<CreateShiftInput>;

function parseTime(value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours || 0, minutes || 0, 0));
}

@Injectable()
export class ShiftService {
  constructor(private readonly prisma: PrismaService) {}

  async list(activeOnly?: boolean) {
    return this.prisma.shift.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { startTime: 'asc' },
    });
  }

  async get(id: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) throw DomainException.notFound('Shift not found');
    return shift;
  }

  async create(input: CreateShiftInput) {
    return this.prisma.shift.create({
      data: {
        name: input.name,
        startTime: parseTime(input.startTime),
        endTime: parseTime(input.endTime),
        capacityLimit: input.capacityLimit,
        breakStart: input.breakStart ? parseTime(input.breakStart) : undefined,
        breakEnd: input.breakEnd ? parseTime(input.breakEnd) : undefined,
        workingHours: input.workingHours,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(id: string, input: UpdateShiftInput) {
    await this.get(id);
    return this.prisma.shift.update({
      where: { id },
      data: {
        name: input.name,
        startTime: input.startTime ? parseTime(input.startTime) : undefined,
        endTime: input.endTime ? parseTime(input.endTime) : undefined,
        capacityLimit: input.capacityLimit,
        breakStart: input.breakStart ? parseTime(input.breakStart) : undefined,
        breakEnd: input.breakEnd ? parseTime(input.breakEnd) : undefined,
        workingHours: input.workingHours,
        isActive: input.isActive,
      },
    });
  }

  /** Shift-wise daily schedule: enrolled students and assigned teachers. */
  async schedule(shiftId: string) {
    await this.get(shiftId);
    const [students, mappings] = await Promise.all([
      this.prisma.student.findMany({
        where: { shiftId, deletedAt: null, status: 'active' },
        select: { id: true, studentCode: true, fullName: true },
      }),
      this.prisma.studentTeacherMapping.findMany({
        where: { shiftId, isActive: true },
        select: {
          id: true,
          studentId: true,
          teacherEmployeeId: true,
        },
      }),
    ]);
    return { shiftId, students, mappings };
  }

  /** M-08: removing a shift from a teacher with an active mapping in it is blocked upstream. */
  async assertNoActiveMappings(shiftId: string) {
    const count = await this.prisma.studentTeacherMapping.count({
      where: { shiftId, isActive: true },
    });
    if (count > 0) {
      throw DomainException.withCode(
        ErrorCode.MAPPING_EXISTS,
        409,
        'Shift has active student-teacher mappings; end them before removing the shift',
      );
    }
  }
}
