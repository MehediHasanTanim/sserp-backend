import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

@Injectable()
export class AppraisalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ---- Review cycles -------------------------------------------------

  listCycles() {
    return this.prisma.reviewCycle.findMany({
      orderBy: { periodStart: 'desc' },
    });
  }

  createCycle(data: {
    name: string;
    cycleType: 'annual' | 'bi_annual';
    periodStart: string;
    periodEnd: string;
    selfAppraisalDeadline: string;
    managerAppraisalDeadline: string;
  }) {
    return this.prisma.reviewCycle.create({
      data: {
        name: data.name,
        cycleType: data.cycleType,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        selfAppraisalDeadline: new Date(data.selfAppraisalDeadline),
        managerAppraisalDeadline: new Date(data.managerAppraisalDeadline),
        status: 'planned',
      },
    });
  }

  async updateCycle(id: string, data: Prisma.ReviewCycleUpdateInput) {
    return this.prisma.reviewCycle.update({ where: { id }, data });
  }

  /** PF-01: generate one appraisal per eligible employee. */
  async openCycle(id: string) {
    const cycle = await this.prisma.reviewCycle.findUnique({ where: { id } });
    if (!cycle) throw DomainException.notFound('Review cycle not found');
    if (cycle.status !== 'planned') {
      throw DomainException.conflict('Cycle already opened');
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: { in: ['active', 'on_probation'] },
        joiningDate: { lt: cycle.periodStart },
      },
    });

    return this.prisma.$transaction(async (tx) => {
      for (const emp of employees) {
        await tx.appraisal.create({
          data: {
            reviewCycleId: id,
            employeeId: emp.id,
            reviewerUserId: emp.reportingManagerId,
            status: 'draft',
          },
        });
      }
      return tx.reviewCycle.update({
        where: { id },
        data: { status: 'open' },
        include: { appraisals: true },
      });
    });
  }

  // ---- KPIs ----------------------------------------------------------

  listKpis() {
    return this.prisma.kpi.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createKpi(data: {
    name: string;
    description?: string;
    department?: string;
    designation?: string;
    measurementType: 'rating' | 'numeric' | 'boolean';
    weightPercent: number;
    targetValue?: string;
  }) {
    return this.prisma.kpi.create({
      data: {
        name: data.name,
        description: data.description,
        department: data.department,
        designation: data.designation,
        measurementType: data.measurementType,
        weightPercent: data.weightPercent,
        targetValue: data.targetValue,
      },
    });
  }

  async updateKpi(id: string, data: Prisma.KpiUpdateInput) {
    return this.prisma.kpi.update({ where: { id }, data });
  }

  // ---- Appraisals ----------------------------------------------------

  listAppraisals(filters?: {
    reviewCycleId?: string;
    employeeId?: string;
    status?: string;
  }) {
    return this.prisma.appraisal.findMany({
      where: {
        reviewCycleId: filters?.reviewCycleId,
        employeeId: filters?.employeeId,
        status: filters?.status as never,
      },
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true } },
        reviewCycle: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAppraisal(id: string) {
    const appraisal = await this.prisma.appraisal.findUnique({
      where: { id },
      include: {
        kpiScores: { include: { kpi: true } },
        feedback360: true,
        increments: true,
        employee: true,
        reviewCycle: true,
      },
    });
    if (!appraisal) throw DomainException.notFound('Appraisal not found');
    // PF-05: strip provider id when anonymous
    return {
      ...appraisal,
      feedback360: appraisal.feedback360.map((f) =>
        f.isAnonymous ? { ...f, feedbackProviderUserId: undefined } : f,
      ),
    };
  }

  async submitSelf(
    id: string,
    input: {
      overallRating: number;
      kpiScores: Array<{ kpiId: string; selfScore: number; comment?: string }>;
    },
    employeeUserId: string,
  ) {
    const appraisal = await this.requireAppraisal(id);
    const cycle = await this.prisma.reviewCycle.findUnique({
      where: { id: appraisal.reviewCycleId },
    });
    if (!cycle) throw DomainException.notFound('Review cycle not found');
    if (new Date() > cycle.selfAppraisalDeadline) {
      throw DomainException.withCode(
        ErrorCode.DEADLINE_PASSED,
        422,
        'Self-appraisal deadline has passed',
      );
    }
    const linked = await this.prisma.user.findFirst({
      where: { employeeId: appraisal.employeeId, id: employeeUserId },
    });
    if (!linked) {
      throw DomainException.forbidden(
        'Only the employee may submit self-appraisal',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const score of input.kpiScores) {
        await tx.appraisalKpiScore.upsert({
          where: {
            appraisalId_kpiId: { appraisalId: id, kpiId: score.kpiId },
          },
          create: {
            appraisalId: id,
            kpiId: score.kpiId,
            selfScore: score.selfScore,
            comment: score.comment,
          },
          update: {
            selfScore: score.selfScore,
            comment: score.comment,
          },
        });
      }
      return tx.appraisal.update({
        where: { id },
        data: {
          selfOverallRating: input.overallRating,
          selfSubmittedAt: new Date(),
          status: 'self_submitted',
        },
      });
    });
  }

  async submitManager(
    id: string,
    input: {
      overallRating: number;
      strengths?: string;
      improvementAreas?: string;
      kpiScores: Array<{
        kpiId: string;
        managerScore: number;
        comment?: string;
      }>;
    },
    managerUserId: string,
  ) {
    const appraisal = await this.requireAppraisal(id);
    const selfAsManager = await this.prisma.user.findFirst({
      where: { employeeId: appraisal.employeeId, id: managerUserId },
    });
    if (selfAsManager) {
      throw DomainException.withCode(
        ErrorCode.SELF_REVIEW_FORBIDDEN,
        422,
        'An employee may not be their own reviewer',
      );
    }
    const cycle = await this.prisma.reviewCycle.findUnique({
      where: { id: appraisal.reviewCycleId },
    });
    if (cycle && new Date() > cycle.managerAppraisalDeadline) {
      throw DomainException.withCode(
        ErrorCode.DEADLINE_PASSED,
        422,
        'Manager appraisal deadline has passed',
      );
    }

    const kpis = await this.prisma.kpi.findMany({
      where: {
        id: { in: input.kpiScores.map((s) => s.kpiId) },
        isActive: true,
      },
    });
    const weightSum = kpis.reduce((s, k) => s + Number(k.weightPercent), 0);
    if (Math.abs(weightSum - 100) > 0.01) {
      throw DomainException.withCode(
        ErrorCode.KPI_WEIGHTS_INVALID,
        422,
        'KPI weights for scoring must sum to 100',
        { weightSum },
      );
    }

    let finalScore = 0;
    return this.prisma.$transaction(async (tx) => {
      for (const score of input.kpiScores) {
        const kpi = kpis.find((k) => k.id === score.kpiId);
        const weighted =
          (score.managerScore * Number(kpi?.weightPercent ?? 0)) / 100;
        finalScore += weighted;
        await tx.appraisalKpiScore.upsert({
          where: {
            appraisalId_kpiId: { appraisalId: id, kpiId: score.kpiId },
          },
          create: {
            appraisalId: id,
            kpiId: score.kpiId,
            managerScore: score.managerScore,
            weightedScore: weighted,
            comment: score.comment,
          },
          update: {
            managerScore: score.managerScore,
            weightedScore: weighted,
            comment: score.comment,
          },
        });
      }
      return tx.appraisal.update({
        where: { id },
        data: {
          managerOverallRating: input.overallRating,
          strengths: input.strengths,
          improvementAreas: input.improvementAreas,
          finalScore: Math.round(finalScore * 100) / 100,
          managerSubmittedAt: new Date(),
          status: 'manager_submitted',
          reviewerUserId: managerUserId,
        },
      });
    });
  }

  async finalise(id: string, finalRating: string = 'meets') {
    const updated = await this.prisma.appraisal.update({
      where: { id },
      data: {
        status: 'finalised',
        finalRating: finalRating as never,
      },
    });
    await this.events.emitAsync(EventNames.APPRAISAL_FINALISED, {
      appraisalId: id,
      employeeId: updated.employeeId,
    });
    return updated;
  }

  async acknowledge(id: string, employeeUserId: string) {
    const appraisal = await this.requireAppraisal(id);
    const linked = await this.prisma.user.findFirst({
      where: { employeeId: appraisal.employeeId, id: employeeUserId },
    });
    if (!linked) {
      throw DomainException.forbidden('Only the employee may acknowledge');
    }
    return this.prisma.appraisal.update({
      where: { id },
      data: {
        status: 'acknowledged',
        employeeAcknowledgedAt: new Date(),
      },
    });
  }

  addFeedback360(
    id: string,
    providerUserId: string,
    body: {
      relationship: 'peer' | 'subordinate' | 'other_manager';
      responses: Record<string, unknown>;
      isAnonymous?: boolean;
    },
  ) {
    return this.submitFeedback360(id, body, providerUserId);
  }

  async submitFeedback360(
    id: string,
    input: {
      relationship: 'peer' | 'subordinate' | 'other_manager';
      responses: Record<string, unknown>;
      isAnonymous?: boolean;
    },
    providerUserId: string,
  ) {
    await this.requireAppraisal(id);
    return this.prisma.feedback360.create({
      data: {
        appraisalId: id,
        feedbackProviderUserId: providerUserId,
        relationship: input.relationship,
        responses: input.responses as Prisma.InputJsonValue,
        isAnonymous: input.isAnonymous ?? true,
      },
    });
  }

  async recommendIncrement(
    appraisalId: string,
    input: {
      recommendedPercent: number;
      recommendedAmount: number;
      justification?: string;
    },
  ) {
    const appraisal = await this.requireAppraisal(appraisalId);
    return this.prisma.incrementRecommendation.create({
      data: {
        appraisalId,
        employeeId: appraisal.employeeId,
        recommendedPercent: input.recommendedPercent,
        recommendedAmount: input.recommendedAmount,
        justification: input.justification,
        status: 'pending',
      },
    });
  }

  async approveIncrement(
    id: string,
    actorId: string,
    applyEffectiveFromOrFlag?: string | boolean,
  ) {
    const applyEffectiveFrom =
      typeof applyEffectiveFromOrFlag === 'string'
        ? applyEffectiveFromOrFlag
        : applyEffectiveFromOrFlag
          ? new Date().toISOString().slice(0, 10)
          : undefined;
    const rec = await this.prisma.incrementRecommendation.findUnique({
      where: { id },
    });
    if (!rec)
      throw DomainException.notFound('Increment recommendation not found');
    if (rec.status !== 'pending') {
      throw DomainException.conflict('Already decided');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let appliedStructureId: string | undefined;
      if (applyEffectiveFrom) {
        const prior = await tx.salaryStructure.findFirst({
          where: { employeeId: rec.employeeId, status: 'active' },
          include: { lines: true },
        });
        if (prior) {
          const dayBefore = new Date(applyEffectiveFrom);
          dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
          await tx.salaryStructure.update({
            where: { id: prior.id },
            data: { status: 'superseded', effectiveTo: dayBefore },
          });
          const newGross = prior.grossAmount + rec.recommendedAmount;
          const created = await tx.salaryStructure.create({
            data: {
              employeeId: rec.employeeId,
              payrollGroupId: prior.payrollGroupId,
              effectiveFrom: new Date(applyEffectiveFrom),
              grossAmount: newGross,
              status: 'active',
              approvedBy: actorId,
              approvedAt: new Date(),
              revisionReason: `Increment from appraisal recommendation ${id}`,
              lines: {
                create: prior.lines.map((l) => ({
                  salaryComponentId: l.salaryComponentId,
                  amount:
                    l.amount +
                    Math.round(
                      (l.amount / Math.max(prior.grossAmount, 1)) *
                        rec.recommendedAmount,
                    ),
                  overrideValue: l.overrideValue,
                })),
              },
            },
          });
          appliedStructureId = created.id;
        }
      }
      return tx.incrementRecommendation.update({
        where: { id },
        data: {
          status: appliedStructureId ? 'applied' : 'approved',
          approvedBy: actorId,
          appliedSalaryStructureId: appliedStructureId,
        },
      });
    });

    await this.events.emitAsync(EventNames.INCREMENT_APPROVED, {
      incrementId: id,
      employeeId: rec.employeeId,
      actorId,
    });
    return updated;
  }

  private async requireAppraisal(id: string) {
    const a = await this.prisma.appraisal.findUnique({ where: { id } });
    if (!a) throw DomainException.notFound('Appraisal not found');
    return a;
  }
}
