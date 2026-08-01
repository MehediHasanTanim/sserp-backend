import { Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

/**
 * The only shape of student data any module outside `school` may see.
 * Therapy NEVER queries prisma.student directly — use this façade.
 * NEVER add fee, attendance, or IEP data here.
 */
export interface StudentSummary {
  id: string;
  studentCode: string;
  fullName: string;
  dateOfBirth: Date | null;
  gender: string | null;
  status: StudentStatus;
  disabilityCategory: string | null;
}

const SUMMARY_SELECT = {
  id: true,
  studentCode: true,
  fullName: true,
  dateOfBirth: true,
  gender: true,
  status: true,
  disabilityCategory: true,
} as const;

/**
 * Public read façade consumed by TherapyModule.
 * Returns active students only — see docs/plan/backend/04-phase3-therapy.md §PA-04.
 */
@Injectable()
export class SchoolStudentReadService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveById(id: string): Promise<StudentSummary> {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null, status: { not: 'withdrawn' } },
      select: SUMMARY_SELECT,
    });
    if (!student)
      throw DomainException.notFound('Student not found or inactive');
    return student;
  }

  async findByIds(ids: string[]): Promise<StudentSummary[]> {
    if (!ids.length) return [];
    return this.prisma.student.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: SUMMARY_SELECT,
    });
  }

  async listActive(): Promise<StudentSummary[]> {
    return this.prisma.student.findMany({
      where: { deletedAt: null, status: 'active' },
      select: SUMMARY_SELECT,
      orderBy: { fullName: 'asc' },
    });
  }
}
