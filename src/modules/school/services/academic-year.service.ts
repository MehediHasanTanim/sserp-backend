import { Injectable } from '@nestjs/common';
import { AcademicYearStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';

export interface CreateAcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
  status?: AcademicYearStatus;
}

export type UpdateAcademicYearInput = Partial<CreateAcademicYearInput>;

export interface CreateAcademicTermInput {
  name: string;
  startDate: string;
  endDate: string;
  sequence: number;
}

@Injectable()
export class AcademicYearService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      include: { terms: { orderBy: { sequence: 'asc' } } },
    });
  }

  async get(id: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id },
      include: { terms: { orderBy: { sequence: 'asc' } } },
    });
    if (!year) throw DomainException.notFound('Academic year not found');
    return year;
  }

  async getCurrent() {
    const year = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
    });
    if (!year) throw DomainException.notFound('No current academic year set');
    return year;
  }

  async create(input: CreateAcademicYearInput) {
    return this.prisma.academicYear.create({
      data: {
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        status: input.status,
      },
    });
  }

  async update(id: string, input: UpdateAcademicYearInput) {
    await this.get(id);
    return this.prisma.academicYear.update({
      where: { id },
      data: {
        name: input.name,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        status: input.status,
      },
    });
  }

  /** Partial-unique-index-backed: exactly one `is_current = true` at a time. */
  async setCurrent(id: string) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
      return tx.academicYear.update({
        where: { id },
        data: { isCurrent: true, status: 'active' },
      });
    });
  }

  async listTerms(academicYearId: string) {
    await this.get(academicYearId);
    return this.prisma.academicTerm.findMany({
      where: { academicYearId },
      orderBy: { sequence: 'asc' },
    });
  }

  async createTerm(academicYearId: string, input: CreateAcademicTermInput) {
    await this.get(academicYearId);
    return this.prisma.academicTerm.create({
      data: {
        academicYearId,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        sequence: input.sequence,
      },
    });
  }
}
