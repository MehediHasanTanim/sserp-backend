import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PurchaseRequestStatus } from '@prisma/client';
import { NumberingService } from '../../admin/services/organization.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

const PR_INCLUDE = {
  lines: {
    include: {
      item: true,
      unitOfMeasure: true,
    },
  },
};

export interface PrLineInput {
  itemId?: string;
  itemDescription: string;
  quantity: number;
  unitOfMeasureId?: string;
  estimatedUnitCost: number;
  remarks?: string;
}

@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
  ) {}

  async resolveDepartmentForUser(userId: string): Promise<string> {
    const employee = await this.prisma.employee.findFirst({
      where: { user: { id: userId }, deletedAt: null },
      include: { department: { select: { code: true } } },
    });
    return employee?.department.code ?? 'administration';
  }

  async resolveEmployeeIdForUser(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { user: { id: userId }, deletedAt: null },
    });
    return employee?.id;
  }

  list(
    filters: {
      status?: PurchaseRequestStatus;
      department?: string;
      requestedBy?: string;
      page?: number;
      pageSize?: number;
    },
    restrictToRequesterId?: string,
  ) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    return this.prisma.purchaseRequest.findMany({
      where: {
        status: filters.status,
        department: filters.department,
        requestedBy: restrictToRequesterId ?? filters.requestedBy,
      },
      include: PR_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async findById(id: string) {
    const row = await this.prisma.purchaseRequest.findUnique({
      where: { id },
      include: PR_INCLUDE,
    });
    if (!row) throw DomainException.notFound('Purchase request not found');
    return row;
  }

  private lineTotal(qty: number, unitCost: number) {
    return Math.round(qty * unitCost);
  }

  async create(
    input: {
      requiredByDate?: string;
      justification?: string;
      budgetLineId?: string;
      attachmentId?: string;
      lines: PrLineInput[];
    },
    requesterId: string,
  ) {
    const department = await this.resolveDepartmentForUser(requesterId);
    const prNumber = await this.numbering.nextCode('purchase_request');
    const estimatedTotal = input.lines.reduce(
      (s, l) => s + this.lineTotal(l.quantity, l.estimatedUnitCost),
      0,
    );
    return this.prisma.purchaseRequest.create({
      data: {
        prNumber,
        requestedBy: requesterId,
        department,
        requiredByDate: input.requiredByDate
          ? new Date(input.requiredByDate)
          : undefined,
        justification: input.justification,
        estimatedTotal,
        budgetLineId: input.budgetLineId,
        attachmentId: input.attachmentId,
        status: 'draft',
        lines: {
          create: input.lines.map((l) => ({
            itemId: l.itemId,
            itemDescription: l.itemDescription,
            quantity: l.quantity,
            unitOfMeasureId: l.unitOfMeasureId,
            estimatedUnitCost: l.estimatedUnitCost,
            estimatedTotal: this.lineTotal(l.quantity, l.estimatedUnitCost),
            remarks: l.remarks,
          })),
        },
      },
      include: PR_INCLUDE,
    });
  }

  async updateDraft(
    id: string,
    requesterId: string,
    input: {
      requiredByDate?: string;
      justification?: string;
      budgetLineId?: string;
      attachmentId?: string;
      lines?: PrLineInput[];
    },
  ) {
    const pr = await this.findById(id);
    if (pr.status !== 'draft') {
      throw DomainException.conflict('Only draft PRs may be edited');
    }
    if (pr.requestedBy !== requesterId) {
      throw DomainException.forbidden('Only the requester may edit this PR');
    }

    let estimatedTotal = pr.estimatedTotal;
    if (input.lines) {
      estimatedTotal = input.lines.reduce(
        (s, l) => s + this.lineTotal(l.quantity, l.estimatedUnitCost),
        0,
      );
      await this.prisma.purchaseRequestLine.deleteMany({ where: { prId: id } });
    }

    return this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        requiredByDate: input.requiredByDate
          ? new Date(input.requiredByDate)
          : undefined,
        justification: input.justification,
        budgetLineId: input.budgetLineId,
        attachmentId: input.attachmentId,
        estimatedTotal,
        lines: input.lines
          ? {
              create: input.lines.map((l) => ({
                itemId: l.itemId,
                itemDescription: l.itemDescription,
                quantity: l.quantity,
                unitOfMeasureId: l.unitOfMeasureId,
                estimatedUnitCost: l.estimatedUnitCost,
                estimatedTotal: this.lineTotal(l.quantity, l.estimatedUnitCost),
                remarks: l.remarks,
              })),
            }
          : undefined,
      },
      include: PR_INCLUDE,
    });
  }

  async submit(id: string, requesterId: string) {
    const pr = await this.findById(id);
    if (pr.requestedBy !== requesterId) {
      throw DomainException.forbidden('Only the requester may submit');
    }
    if (pr.status !== 'draft') {
      throw DomainException.withCode(
        ErrorCode.INVALID_PR_TRANSITION,
        409,
        'Only draft PRs may be submitted',
      );
    }
    if (!pr.lines.length) {
      throw DomainException.validation('At least one line is required');
    }

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: 'pending_dept_review' },
      include: PR_INCLUDE,
    });
    this.events.emit(EventNames.PROCUREMENT_PR_SUBMITTED, {
      prId: id,
      requesterId,
    });
    this.emitStatusChanged(updated, 'draft', 'pending_dept_review');
    return updated;
  }

  async cancel(id: string, actorId: string, actorRoles: string[]) {
    const pr = await this.findById(id);
    const isRequester = pr.requestedBy === actorId;
    const isPrincipal =
      actorRoles.includes('principal') || actorRoles.includes('super_admin');
    if (!isRequester && !isPrincipal) {
      throw DomainException.forbidden('Only requester or principal may cancel');
    }
    if (
      !['draft', 'pending_dept_review', 'pending_principal_approval'].includes(
        pr.status,
      )
    ) {
      throw DomainException.withCode(
        ErrorCode.INVALID_PR_TRANSITION,
        409,
        `Cannot cancel PR in status ${pr.status}`,
      );
    }
    const prev = pr.status;
    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: 'cancelled' },
      include: PR_INCLUDE,
    });
    this.emitStatusChanged(updated, prev, 'cancelled');
    return updated;
  }

  emitStatusChanged(
    pr: { id: string; requestedBy: string; prNumber: string; status: string },
    from: string,
    to: string,
  ) {
    this.events.emit(EventNames.PROCUREMENT_PR_STATUS_CHANGED, {
      prId: pr.id,
      prNumber: pr.prNumber,
      requesterId: pr.requestedBy,
      from,
      to,
    });
  }
}
