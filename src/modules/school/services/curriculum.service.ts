import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import {
  CreateCurriculumDto,
  CreateLearningObjectiveDto,
  CreateSkillDomainDto,
  UpdateCurriculumDto,
  UpdateLearningObjectiveDto,
  UpdateSkillDomainDto,
} from '../dto/curriculum.dto';

/**
 * Skill domains, curricula per disability category, and their learning
 * objectives (docs/plan/backend/03-phase2-school-advanced.md §3, curriculum).
 */
@Injectable()
export class CurriculumService {
  constructor(private readonly prisma: PrismaService) {}

  async listSkillDomains(activeOnly?: boolean) {
    return this.prisma.skillDomain.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { sequence: 'asc' },
    });
  }

  async createSkillDomain(input: CreateSkillDomainDto) {
    const sequence =
      input.sequence ??
      ((
        await this.prisma.skillDomain.aggregate({
          _max: { sequence: true },
        })
      )._max.sequence ?? -1) + 1;

    return this.prisma.skillDomain.create({
      data: {
        name: input.name,
        description: input.description,
        sequence,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateSkillDomain(id: string, input: UpdateSkillDomainDto) {
    const existing = await this.prisma.skillDomain.findUnique({
      where: { id },
    });
    if (!existing) throw DomainException.notFound('Skill domain not found');
    return this.prisma.skillDomain.update({
      where: { id },
      data: input,
    });
  }

  async listCurricula(academicYearId?: string, disabilityCategory?: string) {
    return this.prisma.curriculum.findMany({
      where: {
        academicYearId,
        disabilityCategory,
      },
      include: { objectives: { include: { skillDomain: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCurriculum(id: string) {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id },
      include: {
        objectives: {
          include: { skillDomain: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });
    if (!curriculum) throw DomainException.notFound('Curriculum not found');
    return curriculum;
  }

  async createCurriculum(input: CreateCurriculumDto) {
    return this.prisma.curriculum.create({
      data: {
        academicYearId: input.academicYearId,
        disabilityCategory: input.disabilityCategory,
        name: input.name,
        description: input.description,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateCurriculum(id: string, input: UpdateCurriculumDto) {
    await this.getCurriculum(id);
    return this.prisma.curriculum.update({
      where: { id },
      data: input,
    });
  }

  async listObjectives(curriculumId: string) {
    await this.getCurriculum(curriculumId);
    return this.prisma.learningObjective.findMany({
      where: { curriculumId },
      include: { skillDomain: true },
      orderBy: { sequence: 'asc' },
    });
  }

  async addObjective(curriculumId: string, input: CreateLearningObjectiveDto) {
    await this.getCurriculum(curriculumId);
    const skillDomain = await this.prisma.skillDomain.findUnique({
      where: { id: input.skillDomainId },
    });
    if (!skillDomain) throw DomainException.notFound('Skill domain not found');

    const sequence =
      input.sequence ??
      ((
        await this.prisma.learningObjective.aggregate({
          where: { curriculumId },
          _max: { sequence: true },
        })
      )._max.sequence ?? -1) + 1;

    return this.prisma.learningObjective.create({
      data: {
        curriculumId,
        skillDomainId: input.skillDomainId,
        description: input.description,
        sequence,
      },
    });
  }

  async updateObjective(
    curriculumId: string,
    objectiveId: string,
    input: UpdateLearningObjectiveDto,
  ) {
    const objective = await this.prisma.learningObjective.findFirst({
      where: { id: objectiveId, curriculumId },
    });
    if (!objective)
      throw DomainException.notFound('Learning objective not found');
    return this.prisma.learningObjective.update({
      where: { id: objectiveId },
      data: input,
    });
  }

  async deleteObjective(curriculumId: string, objectiveId: string) {
    const objective = await this.prisma.learningObjective.findFirst({
      where: { id: objectiveId, curriculumId },
    });
    if (!objective)
      throw DomainException.notFound('Learning objective not found');
    await this.prisma.learningObjective.delete({ where: { id: objectiveId } });
    return { ok: true };
  }
}
