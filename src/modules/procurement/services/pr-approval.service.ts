import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BudgetCheckService } from '../../accounts/services/budget-check.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { PurchaseRequestService } from './purchase-request.service';

const PR_INCLUDE = {
  lines: true,
};

@Injectable()
export class PrApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetCheck: BudgetCheckService,
    private readonly prService: PurchaseRequestService,
    private readonly events: EventEmitter2,
  ) {}

  private assertNotSelf(prRequesterId: string, actorId: string) {
    if (prRequesterId === actorId) {
      throw DomainException.withCode(
        ErrorCode.SELF_APPROVAL_FORBIDDEN,
        403,
        'You may not approve your own purchase request',
      );
    }
  }

  async deptReview(
    id: string,
    actorId: string,
    actorRoles: string[],
    input: { approved: boolean; comment?: string; reason?: string },
  ) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where: { id },
      include: PR_INCLUDE,
    });
    if (!pr) throw DomainException.notFound('Purchase request not found');
    if (pr.status !== 'pending_dept_review') {
      throw DomainException.withCode(
        ErrorCode.INVALID_PR_TRANSITION,
        409,
        'PR is not awaiting department review',
      );
    }

    const canReview =
      actorRoles.includes('coordinator') ||
      actorRoles.includes('principal') ||
      actorRoles.includes('super_admin');
    if (!canReview) {
      throw DomainException.forbidden(
        'Department head or coordinator role required',
      );
    }
    this.assertNotSelf(pr.requestedBy, actorId);

    if (!input.approved) {
      if (!input.reason?.trim()) {
        throw DomainException.validation('Rejection reason is required');
      }
      const updated = await this.prisma.purchaseRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectionReason: input.reason,
          deptReviewedBy: actorId,
          deptReviewedAt: new Date(),
          deptReviewComment: input.comment,
        },
        include: PR_INCLUDE,
      });
      this.events.emit(EventNames.PROCUREMENT_PR_REJECTED, {
        prId: id,
        requesterId: pr.requestedBy,
        reason: input.reason,
      });
      this.prService.emitStatusChanged(
        updated,
        'pending_dept_review',
        'rejected',
      );
      return updated;
    }

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: 'pending_principal_approval',
        deptReviewedBy: actorId,
        deptReviewedAt: new Date(),
        deptReviewComment: input.comment,
      },
      include: PR_INCLUDE,
    });
    this.prService.emitStatusChanged(
      updated,
      'pending_dept_review',
      'pending_principal_approval',
    );
    return updated;
  }

  async approve(
    id: string,
    actorId: string,
    actorRoles: string[],
    input?: { comment?: string; budgetOverrideReason?: string },
  ) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where: { id },
      include: PR_INCLUDE,
    });
    if (!pr) throw DomainException.notFound('Purchase request not found');
    if (pr.status !== 'pending_principal_approval') {
      throw DomainException.withCode(
        ErrorCode.INVALID_PR_TRANSITION,
        409,
        'PR is not awaiting principal approval',
      );
    }

    const isPrincipal =
      actorRoles.includes('principal') || actorRoles.includes('super_admin');
    if (!isPrincipal) {
      throw DomainException.withCode(
        ErrorCode.FORBIDDEN,
        403,
        'Principal approval is mandatory for all purchase requests',
      );
    }
    this.assertNotSelf(pr.requestedBy, actorId);

    let budgetCheckResult: Record<string, unknown> = { skipped: true };
    if (pr.budgetLineId) {
      const budgetLine = await this.prisma.budgetLine.findUnique({
        where: { id: pr.budgetLineId },
        include: { budget: true, account: true },
      });
      if (budgetLine) {
        const dry = await this.budgetCheck.dryRun({
          accountId: budgetLine.accountId,
          costCenter: budgetLine.budget.costCenter,
          amount: pr.estimatedTotal,
          entryDate: new Date(),
        });
        budgetCheckResult = dry;
        if (!dry.ok && !input?.budgetOverrideReason) {
          throw DomainException.withCode(
            ErrorCode.BUDGET_EXCEEDED,
            422,
            'Budget check failed; principal override reason required',
            dry.details as Record<string, unknown>,
          );
        }
      }
    }

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: actorId,
        approvedAt: new Date(),
        approvalComment: input?.comment,
        budgetCheckResult: {
          ...budgetCheckResult,
          overrideReason: input?.budgetOverrideReason,
        },
      },
      include: PR_INCLUDE,
    });
    this.events.emit(EventNames.PROCUREMENT_PR_APPROVED, {
      prId: id,
      requesterId: pr.requestedBy,
    });
    this.prService.emitStatusChanged(
      updated,
      'pending_principal_approval',
      'approved',
    );
    return updated;
  }

  async reject(
    id: string,
    actorId: string,
    actorRoles: string[],
    reason: string,
  ) {
    if (!reason?.trim()) {
      throw DomainException.validation('Rejection reason is required');
    }
    const pr = await this.prisma.purchaseRequest.findUnique({
      where: { id },
      include: PR_INCLUDE,
    });
    if (!pr) throw DomainException.notFound('Purchase request not found');
    if (
      !['pending_dept_review', 'pending_principal_approval'].includes(pr.status)
    ) {
      throw DomainException.withCode(
        ErrorCode.INVALID_PR_TRANSITION,
        409,
        'PR cannot be rejected in current status',
      );
    }

    const canRejectDept =
      pr.status === 'pending_dept_review' &&
      (actorRoles.includes('coordinator') ||
        actorRoles.includes('principal') ||
        actorRoles.includes('super_admin'));
    const canRejectPrincipal =
      pr.status === 'pending_principal_approval' &&
      (actorRoles.includes('principal') || actorRoles.includes('super_admin'));
    if (!canRejectDept && !canRejectPrincipal) {
      throw DomainException.forbidden('Not authorized to reject this PR');
    }
    this.assertNotSelf(pr.requestedBy, actorId);

    const prev = pr.status;
    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason: reason,
        approvedBy: actorId,
        approvedAt: new Date(),
      },
      include: PR_INCLUDE,
    });
    this.events.emit(EventNames.PROCUREMENT_PR_REJECTED, {
      prId: id,
      requesterId: pr.requestedBy,
      reason,
    });
    this.prService.emitStatusChanged(updated, prev, 'rejected');
    return updated;
  }

  async dryRunBudgetCheck(id: string) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where: { id },
    });
    if (!pr) throw DomainException.notFound('Purchase request not found');
    if (!pr.budgetLineId) {
      return { ok: true, message: 'No budget line mapped' };
    }
    const budgetLine = await this.prisma.budgetLine.findUnique({
      where: { id: pr.budgetLineId },
      include: { budget: true },
    });
    if (!budgetLine) {
      return { ok: true, message: 'Budget line not found' };
    }
    return this.budgetCheck.dryRun({
      accountId: budgetLine.accountId,
      costCenter: budgetLine.budget.costCenter,
      amount: pr.estimatedTotal,
      entryDate: new Date(),
    });
  }
}
