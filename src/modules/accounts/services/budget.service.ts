import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BudgetEnforcementMode } from '@prisma/client';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { BudgetCheckService } from './budget-check.service';

export interface BudgetLineDto {
  accountId: string;
  periodMonth?: number;
  allocatedAmount: number;
  notes?: string;
}

export interface CreateBudgetDto {
  fiscalYear: string;
  name: string;
  costCenter: string;
  department?: string;
  enforcementMode?: BudgetEnforcementMode;
  lines: BudgetLineDto[];
}

@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly budgetCheck: BudgetCheckService,
  ) {}

  async list(filters?: { fiscalYear?: string; costCenter?: string }) {
    return this.prisma.budget.findMany({
      where: filters,
      include: { lines: true },
      orderBy: [{ fiscalYear: 'desc' }, { version: 'desc' }],
    });
  }

  async findById(id: string) {
    const b = await this.prisma.budget.findUnique({
      where: { id },
      include: { lines: { include: { account: true } }, revisions: true },
    });
    if (!b) throw DomainException.notFound('Budget not found');
    return b;
  }

  async create(dto: CreateBudgetDto, createdBy: string) {
    const totalAmount = dto.lines.reduce((s, l) => s + l.allocatedAmount, 0);
    return this.prisma.budget.create({
      data: {
        fiscalYear: dto.fiscalYear,
        name: dto.name,
        costCenter: dto.costCenter,
        department: dto.department,
        enforcementMode: dto.enforcementMode ?? 'warn',
        totalAmount,
        createdBy,
        lines: { create: dto.lines },
      },
      include: { lines: true },
    });
  }

  async updateDraft(id: string, dto: Partial<CreateBudgetDto>) {
    const budget = await this.findById(id);
    if (budget.status !== 'draft') {
      throw DomainException.conflict('Only draft budgets can be edited');
    }
    if (dto.lines) {
      await this.prisma.budgetLine.deleteMany({ where: { budgetId: id } });
      await this.prisma.budget.update({
        where: { id },
        data: {
          name: dto.name,
          lines: { create: dto.lines },
          totalAmount: dto.lines.reduce((s, l) => s + l.allocatedAmount, 0),
        },
      });
    }
    return this.findById(id);
  }

  async approve(id: string, approverId: string) {
    const budget = await this.findById(id);
    if (budget.status !== 'draft') throw DomainException.conflict('Budget not in draft');
    const updated = await this.prisma.budget.update({
      where: { id },
      data: { status: 'approved', approvedBy: approverId, approvedAt: new Date() },
    });
    this.events.emit(EventNames.BUDGET_APPROVED, { budgetId: id });
    return updated;
  }

  async revise(id: string, changes: BudgetLineDto[], reason: string, requestedBy: string) {
    const budget = await this.findById(id);
    if (!['approved', 'revised'].includes(budget.status)) {
      throw DomainException.conflict('Only approved budgets can be revised');
    }
    const newVersion = budget.version + 1;
    const newBudget = await this.prisma.budget.create({
      data: {
        fiscalYear: budget.fiscalYear,
        name: budget.name,
        costCenter: budget.costCenter,
        department: budget.department,
        enforcementMode: budget.enforcementMode,
        version: newVersion,
        previousVersionId: id,
        status: 'draft',
        totalAmount: changes.reduce((s, l) => s + l.allocatedAmount, 0),
        createdBy: requestedBy,
        lines: {
          create: changes.map((c) => ({
            accountId: c.accountId,
            periodMonth: c.periodMonth,
            allocatedAmount: c.allocatedAmount,
            revisedAmount: c.allocatedAmount,
            notes: c.notes,
          })),
        },
      },
    });
    await this.prisma.budgetRevision.create({
      data: {
        budgetId: id,
        fromVersion: budget.version,
        toVersion: newVersion,
        reason,
        requestedBy,
        changes: changes as object,
      },
    });
    return newBudget;
  }

  async approveRevision(revisionId: string, approverId: string) {
    const revision = await this.prisma.budgetRevision.findUnique({
      where: { id: revisionId },
      include: { budget: true },
    });
    if (!revision) throw DomainException.notFound('Revision not found');
    const newBudget = await this.prisma.budget.findFirst({
      where: { previousVersionId: revision.budgetId, version: revision.toVersion },
    });
    if (!newBudget) throw DomainException.notFound('New budget version not found');
    await this.prisma.budget.update({
      where: { id: revision.budgetId },
      data: { status: 'revised' },
    });
    return this.prisma.budget.update({
      where: { id: newBudget.id },
      data: { status: 'approved', approvedBy: approverId, approvedAt: new Date() },
    });
  }

  async variance(costCenter?: string, fiscalYear?: string) {
    const budgets = await this.prisma.budget.findMany({
      where: {
        costCenter,
        fiscalYear,
        status: { in: ['approved', 'revised'] },
      },
      include: { lines: { include: { consumptions: true, account: true } } },
    });
    return budgets.map((b) => ({
      budgetId: b.id,
      costCenter: b.costCenter,
      lines: b.lines.map((l) => {
        const consumed = l.consumptions.reduce((s, c) => s + c.amount, 0);
        const allocated = l.revisedAmount ?? l.allocatedAmount;
        return {
          accountId: l.accountId,
          accountCode: l.account.accountCode,
          allocated,
          consumed,
          variance: allocated - consumed,
        };
      }),
    }));
  }

  async utilization(costCenter: string, fiscalYear: string) {
    const v = await this.variance(costCenter, fiscalYear);
    return v.map((b) => ({
      ...b,
      utilizationPct:
        b.lines.reduce((s, l) => s + l.allocated, 0) === 0
          ? 0
          : Math.round(
              (b.lines.reduce((s, l) => s + l.consumed, 0) /
                b.lines.reduce((s, l) => s + l.allocated, 0)) *
                100,
            ),
    }));
  }

  dryRun(params: Parameters<BudgetCheckService['dryRun']>[0]) {
    return this.budgetCheck.dryRun(params);
  }
}
