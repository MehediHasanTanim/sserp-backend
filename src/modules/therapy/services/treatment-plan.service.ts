import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TherapyType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

export interface CreateTreatmentPlanDto {
  patientId: string;
  therapyType: TherapyType;
  startDate: Date;
  reviewDate?: Date;
  goals?: Array<{
    goalType: 'short_term' | 'long_term';
    description: string;
    targetBehavior?: string;
    baselineMeasurement?: string;
    targetMeasurement?: string;
    measurementUnit?: string;
    targetDate?: Date;
    sequence?: number;
  }>;
}

export interface RecordGoalProgressDto {
  treatmentGoalId: string;
  sessionId: string;
  measuredValue?: string;
  progressPercentage?: number;
  narrative?: string;
}

@Injectable()
export class TreatmentPlanService {
  private readonly logger = new Logger(TreatmentPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateTreatmentPlanDto, createdByTherapistId: string) {
    // Check for existing active plan
    const existing = await this.prisma.treatmentPlan.findFirst({
      where: { patientId: dto.patientId, therapyType: dto.therapyType, status: 'active' },
    });
    if (existing) {
      throw new DomainException(
        ErrorCode.ACTIVE_TREATMENT_PLAN_EXISTS,
        409,
        `An active ${dto.therapyType} treatment plan already exists for this patient`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.treatmentPlan.create({
        data: {
          patientId: dto.patientId,
          therapyType: dto.therapyType,
          startDate: dto.startDate,
          reviewDate: dto.reviewDate,
          createdByTherapistId,
          status: 'draft',
        },
      });

      if (dto.goals?.length) {
        await tx.treatmentGoal.createMany({
          data: dto.goals.map((g, i) => ({
            treatmentPlanId: plan.id,
            goalType: g.goalType,
            description: g.description,
            targetBehavior: g.targetBehavior,
            baselineMeasurement: g.baselineMeasurement,
            targetMeasurement: g.targetMeasurement,
            measurementUnit: g.measurementUnit,
            targetDate: g.targetDate,
            sequence: g.sequence ?? i,
          })),
        });
      }

      return plan;
    });
  }

  async findById(id: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: { goals: { orderBy: { sequence: 'asc' } } },
    });
    if (!plan) throw DomainException.notFound('Treatment plan not found');
    return plan;
  }

  async activate(planId: string) {
    const plan = await this.findById(planId);
    if (plan.status !== 'draft') {
      throw new DomainException(
        ErrorCode.TREATMENT_PLAN_NOT_EDITABLE,
        422,
        `Plan cannot be activated from status ${plan.status}`,
      );
    }

    // Archive any existing active plan
    await this.prisma.treatmentPlan.updateMany({
      where: {
        patientId: plan.patientId,
        therapyType: plan.therapyType,
        status: 'active',
        id: { not: planId },
      },
      data: { status: 'archived' },
    });

    const updated = await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { status: 'active' },
    });

    this.events.emit(EventNames.TREATMENT_PLAN_ACTIVATED, { planId, patientId: plan.patientId });
    return updated;
  }

  async shareWithGuardian(planId: string) {
    const plan = await this.findById(planId);
    if (plan.status !== 'active') {
      throw DomainException.validation('Only active plans can be shared with guardian');
    }

    const updated = await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { sharedWithGuardianAt: new Date() },
    });

    this.events.emit(EventNames.TREATMENT_PLAN_SHARED, { planId, patientId: plan.patientId });
    return updated;
  }

  async recordGoalProgress(dto: RecordGoalProgressDto, recordedBy: string) {
    const goal = await this.prisma.treatmentGoal.findUnique({
      where: { id: dto.treatmentGoalId },
    });
    if (!goal) throw DomainException.notFound('Treatment goal not found');

    return this.prisma.treatmentGoalProgress.create({
      data: {
        treatmentGoalId: dto.treatmentGoalId,
        sessionId: dto.sessionId,
        measuredValue: dto.measuredValue,
        progressPercentage: dto.progressPercentage,
        narrative: dto.narrative,
        recordedBy,
      },
    });
  }

  async listByPatient(patientId: string) {
    return this.prisma.treatmentPlan.findMany({
      where: { patientId },
      include: { goals: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
