import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import {
  CreateIepGoalDto,
  RecordGoalProgressDto,
  UpdateIepGoalDto,
} from '../dto/iep.dto';

export interface GoalActor {
  id: string;
  roles: string[];
}

const COORDINATOR_ROLES = ['coordinator', 'super_admin'];

/**
 * IEP goal CRUD and progress tracking.
 * Rules I-05, I-06, I-07 — docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class IepGoalService {
  constructor(private readonly prisma: PrismaService) {}

  async list(iepId: string) {
    await this.getPlan(iepId);
    const goals = await this.prisma.iepGoal.findMany({
      where: { iepId },
      include: { skillDomain: { select: { id: true, name: true } } },
      orderBy: { sequence: 'asc' },
    });
    return this.withGoalLabels(goals);
  }

  async get(goalId: string) {
    const goal = await this.prisma.iepGoal.findUnique({
      where: { id: goalId },
      include: { skillDomain: { select: { id: true, name: true } } },
    });
    if (!goal) throw DomainException.notFound('IEP goal not found');
    const [labeled] = await this.withGoalLabels([goal]);
    return labeled;
  }

  private async withGoalLabels<
    T extends {
      responsibleTeacherId: string | null;
      skillDomain?: { id: string; name: string } | null;
    },
  >(goals: T[]) {
    const teacherIds = [
      ...new Set(
        goals
          .map((g) => g.responsibleTeacherId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const teachers =
      teacherIds.length > 0
        ? await this.prisma.teacher.findMany({
            where: { id: { in: teacherIds } },
            include: {
              employee: { select: { fullName: true, employeeCode: true } },
            },
          })
        : [];
    const teacherNameById = new Map(
      teachers.map((t) => [
        t.id,
        t.employee?.fullName ?? t.employee?.employeeCode ?? null,
      ]),
    );

    return goals.map((goal) => ({
      ...goal,
      skillDomainName: goal.skillDomain?.name ?? null,
      responsibleTeacherName: goal.responsibleTeacherId
        ? (teacherNameById.get(goal.responsibleTeacherId) ?? null)
        : null,
    }));
  }

  private async getPlan(iepId: string) {
    const plan = await this.prisma.iepPlan.findUnique({
      where: { id: iepId },
    });
    if (!plan) throw DomainException.notFound('IEP plan not found');
    return plan;
  }

  private assertPlanEditable(status: string) {
    if (status !== 'draft') {
      throw DomainException.withCode(
        ErrorCode.IEP_NOT_EDITABLE,
        409,
        'Goals can only be added or edited while the plan is a draft',
      );
    }
  }

  /** I-05: a goal's responsible teacher must be an active teacher. */
  private async assertActiveTeacher(teacherId?: string) {
    if (!teacherId) return;
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
    });
    if (!teacher || teacher.status !== 'active') {
      throw DomainException.validation(
        'The responsible teacher must reference an active teacher',
      );
    }
  }

  async create(iepId: string, input: CreateIepGoalDto) {
    const plan = await this.getPlan(iepId);
    this.assertPlanEditable(plan.status);
    await this.assertActiveTeacher(input.responsibleTeacherId);

    const created = await this.prisma.iepGoal.create({
      data: {
        iepId,
        skillDomainId: input.skillDomainId,
        learningObjectiveId: input.learningObjectiveId,
        goalType: input.goalType ?? 'short_term',
        description: input.description,
        baselineDescription: input.baselineDescription,
        measurementCriteria: input.measurementCriteria,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
        responsibleTeacherId: input.responsibleTeacherId,
        sequence: input.sequence ?? 0,
      },
      include: { skillDomain: { select: { id: true, name: true } } },
    });
    const [labeled] = await this.withGoalLabels([created]);
    return labeled;
  }

  async update(goalId: string, input: UpdateIepGoalDto) {
    const goal = await this.get(goalId);
    const plan = await this.getPlan(goal.iepId);
    this.assertPlanEditable(plan.status);
    if (input.responsibleTeacherId) {
      await this.assertActiveTeacher(input.responsibleTeacherId);
    }

    const updated = await this.prisma.iepGoal.update({
      where: { id: goalId },
      data: {
        skillDomainId: input.skillDomainId,
        learningObjectiveId: input.learningObjectiveId,
        goalType: input.goalType,
        description: input.description,
        baselineDescription: input.baselineDescription,
        measurementCriteria: input.measurementCriteria,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
        responsibleTeacherId: input.responsibleTeacherId,
        sequence: input.sequence,
      },
      include: { skillDomain: { select: { id: true, name: true } } },
    });
    const [labeled] = await this.withGoalLabels([updated]);
    return labeled;
  }

  /**
   * I-06: only the responsible teacher or a coordinator may record progress.
   * I-07: every status change writes a progress entry — never silently
   * overwritten.
   */
  async recordProgress(
    goalId: string,
    input: RecordGoalProgressDto,
    actor: GoalActor,
  ) {
    const goal = await this.get(goalId);
    const plan = await this.getPlan(goal.iepId);
    if (plan.status === 'archived') {
      throw DomainException.conflict(
        'Cannot record progress on an archived IEP plan',
      );
    }

    const isCoordinator = actor.roles.some((r) =>
      COORDINATOR_ROLES.includes(r),
    );
    const actorTeacherId = isCoordinator
      ? undefined
      : await this.resolveTeacherId(actor.id);
    const isResponsibleTeacher =
      !!goal.responsibleTeacherId &&
      goal.responsibleTeacherId === actorTeacherId;
    if (!isCoordinator && !isResponsibleTeacher) {
      throw DomainException.forbidden(
        'Only the responsible teacher or a coordinator may record goal progress',
      );
    }

    const fromStatus = goal.status;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.iepGoal.update({
        where: { id: goalId },
        data: {
          status: input.toStatus,
          progressPercentage: input.progressPercentage,
        },
      });

      await tx.iepGoalProgressEntry.create({
        data: {
          goalId,
          entryDate: new Date(),
          fromStatus,
          toStatus: input.toStatus,
          progressPercentage: input.progressPercentage,
          narrative: input.narrative,
          recordedBy: actor.id,
        },
      });

      return updated;
    });
  }

  private async resolveTeacherId(userId: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return undefined;
    const teacher = await this.prisma.teacher.findUnique({
      where: { employeeId: user.employeeId },
      select: { id: true },
    });
    return teacher?.id;
  }

  async progressTimeline(goalId: string) {
    await this.get(goalId);
    return this.prisma.iepGoalProgressEntry.findMany({
      where: { goalId },
      orderBy: { entryDate: 'desc' },
    });
  }
}
