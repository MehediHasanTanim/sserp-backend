import { Injectable } from '@nestjs/common';
import { ApproverType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';

export interface ResolvedApprovalStep {
  level: number;
  approverType: ApproverType;
  approverRole?: string | null;
  approverUserId?: string | null;
  status: 'pending' | 'skipped';
  condition?: Prisma.JsonValue;
  isMandatory: boolean;
  escalationAfterHours?: number | null;
  escalateToRole?: string | null;
}

export interface ApprovalChainSnapshot {
  chainId: string;
  workflowCode: string;
  version: number;
  steps: ResolvedApprovalStep[];
}

type Condition = { field: string; op: string; value: unknown };

@Injectable()
export class ApprovalChainService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveChain(
    workflowCode: string,
    payload: Record<string, unknown>,
    context?: { employeeId?: string; requesterUserId?: string },
  ): Promise<ApprovalChainSnapshot> {
    const chain = await this.prisma.approvalChain.findFirst({
      where: { workflowCode, isActive: true },
      orderBy: { version: 'desc' },
      include: { steps: { orderBy: { level: 'asc' } } },
    });
    if (!chain) {
      throw DomainException.notFound(`No approval chain for ${workflowCode}`);
    }

    const mandatory = chain.steps.filter((s) => s.isMandatory);
    if (!mandatory.length) {
      throw DomainException.validation(
        'Chain must have at least one mandatory step',
      );
    }

    const steps: ResolvedApprovalStep[] = [];
    for (const step of chain.steps) {
      if (
        step.condition &&
        !this.evaluateCondition(step.condition as Condition, payload)
      ) {
        steps.push({
          level: step.level,
          approverType: step.approverType,
          approverRole: step.approverRole,
          approverUserId: step.approverUserId,
          status: 'skipped',
          condition: step.condition,
          isMandatory: step.isMandatory,
          escalationAfterHours: step.escalationAfterHours,
          escalateToRole: step.escalateToRole,
        });
        continue;
      }

      const resolved = await this.resolveApprover(step, context);
      if (!resolved && step.isMandatory) {
        throw DomainException.withCode(
          ErrorCode.NO_APPROVER_RESOLVED,
          422,
          `No approver resolved for level ${step.level}`,
          { level: step.level, approverType: step.approverType },
        );
      }
      steps.push({
        level: step.level,
        approverType: step.approverType,
        approverRole: resolved?.role ?? step.approverRole,
        approverUserId: resolved?.userId ?? step.approverUserId,
        status: 'pending',
        condition: step.condition,
        isMandatory: step.isMandatory,
        escalationAfterHours: step.escalationAfterHours,
        escalateToRole: step.escalateToRole,
      });
    }

    return {
      chainId: chain.id,
      workflowCode: chain.workflowCode,
      version: chain.version,
      steps,
    };
  }

  evaluateCondition(
    condition: Condition,
    payload: Record<string, unknown>,
  ): boolean {
    const value = payload[condition.field];
    switch (condition.op) {
      case 'gte':
        return Number(value) >= Number(condition.value);
      case 'gt':
        return Number(value) > Number(condition.value);
      case 'lte':
        return Number(value) <= Number(condition.value);
      case 'lt':
        return Number(value) < Number(condition.value);
      case 'eq':
        return value === condition.value;
      default:
        return true;
    }
  }

  private async resolveApprover(
    step: {
      approverType: ApproverType;
      approverRole?: string | null;
      approverUserId?: string | null;
    },
    context?: { employeeId?: string; requesterUserId?: string },
  ): Promise<{ userId?: string; role?: string } | null> {
    switch (step.approverType) {
      case ApproverType.role:
        return step.approverRole ? { role: step.approverRole } : null;
      case ApproverType.specific_user:
        return step.approverUserId ? { userId: step.approverUserId } : null;
      case ApproverType.reporting_manager:
        return this.resolveReportingManager(
          context?.employeeId,
          step.approverRole,
        );
      case ApproverType.department_head:
        return step.approverRole
          ? { role: step.approverRole }
          : { role: 'coordinator' };
      default:
        return null;
    }
  }

  private async resolveReportingManager(
    employeeId?: string,
    fallbackRole?: string | null,
  ): Promise<{ userId?: string; role?: string } | null> {
    if (!employeeId) return fallbackRole ? { role: fallbackRole } : null;
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { reportingManager: { include: { user: true } } },
    });
    if (employee?.reportingManager?.user?.id) {
      return { userId: employee.reportingManager.user.id };
    }
    return fallbackRole ? { role: fallbackRole } : null;
  }

  async listChains() {
    return this.prisma.approvalChain.findMany({
      include: { steps: { orderBy: { level: 'asc' } } },
      orderBy: { workflowCode: 'asc' },
    });
  }

  async createChain(data: {
    workflowCode: string;
    name: string;
    description?: string;
    steps: Array<{
      level: number;
      approverType: ApproverType;
      approverRole?: string;
      approverUserId?: string;
      condition?: Prisma.InputJsonValue;
      isMandatory?: boolean;
      escalationAfterHours?: number;
      escalateToRole?: string;
    }>;
  }) {
    if (!data.steps.some((s) => s.isMandatory !== false)) {
      throw DomainException.validation('At least one mandatory step required');
    }
    const chain = await this.prisma.approvalChain.create({
      data: {
        workflowCode: data.workflowCode,
        name: data.name,
        description: data.description,
        isActive: true,
        version: 1,
        steps: { create: data.steps },
      },
      include: { steps: true },
    });
    return chain;
  }

  async updateChain(
    id: string,
    data: Partial<{ name: string; description: string; isActive: boolean }>,
  ) {
    return this.prisma.approvalChain.update({ where: { id }, data });
  }
}
