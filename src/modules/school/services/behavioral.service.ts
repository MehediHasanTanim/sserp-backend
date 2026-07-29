import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import {
  CreateBehavioralIncidentDto,
  CreateBehaviorSupportPlanDto,
  UpdateBehaviorSupportPlanDto,
} from '../dto/behavioral.dto';

/**
 * Behavioral incident tracking and support plans.
 * docs/plan/backend/03-phase2-school-advanced.md §3 (Health and behaviour).
 */
@Injectable()
export class BehavioralService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStudentExists(studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');
    return student;
  }

  async listIncidents(studentId: string) {
    await this.assertStudentExists(studentId);
    return this.prisma.behavioralIncident.findMany({
      where: { studentId },
      orderBy: { incidentDatetime: 'desc' },
    });
  }

  async addIncident(
    studentId: string,
    input: CreateBehavioralIncidentDto,
    actorId: string,
  ) {
    await this.assertStudentExists(studentId);
    return this.prisma.behavioralIncident.create({
      data: {
        studentId,
        incidentDatetime: new Date(input.incidentDatetime),
        behaviorType: input.behaviorType,
        antecedent: input.antecedent,
        description: input.description,
        consequence: input.consequence,
        personsInvolved: input.personsInvolved as object | undefined,
        interventionApplied: input.interventionApplied,
        durationMinutes: input.durationMinutes,
        recordedBy: actorId,
        linkedIepGoalId: input.linkedIepGoalId,
      },
    });
  }

  async getSupportPlan(studentId: string) {
    await this.assertStudentExists(studentId);
    const plan = await this.prisma.behaviorSupportPlan.findFirst({
      where: { studentId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) {
      throw DomainException.notFound('No active behavior support plan');
    }
    return plan;
  }

  /** Archives any existing active plan before creating the new one. */
  async createSupportPlan(
    studentId: string,
    input: CreateBehaviorSupportPlanDto,
    actorId: string,
  ) {
    await this.assertStudentExists(studentId);
    return this.prisma.$transaction(async (tx) => {
      await tx.behaviorSupportPlan.updateMany({
        where: { studentId, status: 'active' },
        data: { status: 'archived' },
      });
      return tx.behaviorSupportPlan.create({
        data: {
          studentId,
          startDate: new Date(input.startDate),
          reviewDate: input.reviewDate ? new Date(input.reviewDate) : undefined,
          targetBehaviors: input.targetBehaviors as object,
          strategies: input.strategies as object,
          status: 'active',
          createdBy: actorId,
        },
      });
    });
  }

  async updateSupportPlan(
    studentId: string,
    input: UpdateBehaviorSupportPlanDto,
  ) {
    const plan = await this.getSupportPlan(studentId);
    return this.prisma.behaviorSupportPlan.update({
      where: { id: plan.id },
      data: {
        reviewDate: input.reviewDate ? new Date(input.reviewDate) : undefined,
        targetBehaviors: input.targetBehaviors as object | undefined,
        strategies: input.strategies as object | undefined,
        status: input.status,
      },
    });
  }

  async behavioralTrend(studentId: string) {
    await this.assertStudentExists(studentId);
    const incidents = await this.prisma.behavioralIncident.findMany({
      where: { studentId },
      orderBy: { incidentDatetime: 'asc' },
      select: { behaviorType: true, incidentDatetime: true, durationMinutes: true },
    });

    const byType = new Map<string, number>();
    for (const incident of incidents) {
      byType.set(incident.behaviorType, (byType.get(incident.behaviorType) ?? 0) + 1);
    }

    return {
      studentId,
      totalIncidents: incidents.length,
      byBehaviorType: Object.fromEntries(byType),
      timeline: incidents,
    };
  }
}
