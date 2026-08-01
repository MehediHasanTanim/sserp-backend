import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { LeaveBalanceService } from './leave-balance.service';

/**
 * Eligible days formula (EN-02):
 *   eligibleDays = max(0, min(
 *     availableBalance − minBalanceToRetain,
 *     maxEncashableDaysPerYear − alreadyEncashedThisYear
 *   ))
 *
 * Six combinations asserted by unit tests:
 * 1. High balance, room under cap → limited by (available − retain)
 * 2. High balance, near annual cap → limited by (max − already)
 * 3. Balance below retain → eligible = 0
 * 4. Already at annual cap → eligible = 0
 * 5. Exactly at retain + 1 day with full cap → eligible = 1
 * 6. Both constraints equal → either side yields the same eligible figure
 */
export function computeEligibleDays(input: {
  availableBalance: number;
  minBalanceToRetain: number;
  maxEncashableDaysPerYear: number;
  alreadyEncashedThisYear: number;
}): number {
  const fromBalance = input.availableBalance - input.minBalanceToRetain;
  const fromCap =
    input.maxEncashableDaysPerYear - input.alreadyEncashedThisYear;
  return Math.max(0, Math.min(fromBalance, fromCap));
}

/** Alias used by unit tests / mutation suite. */
export const computeEligibleEncashmentDays = computeEligibleDays;

@Injectable()
export class EncashmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveBalances: LeaveBalanceService,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { employeeId?: string; status?: string }) {
    return this.prisma.encashmentRequest.findMany({
      where: {
        employeeId: filters?.employeeId,
        status: filters?.status as never,
      },
      include: {
        leaveType: true,
        approvalSteps: { orderBy: { level: 'asc' } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async eligibility(employeeId: string, year?: number) {
    const y = year ?? new Date().getUTCFullYear();
    const types = await this.prisma.leaveType.findMany({
      where: { isActive: true, isEncashable: true },
    });
    const results = [];
    for (const lt of types) {
      const balance = await this.leaveBalances.getOrInit(employeeId, lt.id, y);
      const available =
        this.leaveBalances.availableDays(balance) -
        Number(balance.encashedDays);
      const eligibleDays = computeEligibleDays({
        availableBalance: available,
        minBalanceToRetain: Number(lt.minBalanceToRetain),
        maxEncashableDaysPerYear: Number(lt.maxEncashableDaysPerYear ?? 0),
        alreadyEncashedThisYear: Number(balance.encashedDays),
      });
      results.push({
        leaveTypeId: lt.id,
        leaveTypeCode: lt.code,
        leaveTypeName: lt.name,
        year: y,
        availableBalance: available,
        eligibleDays,
        minBalanceToRetain: Number(lt.minBalanceToRetain),
        maxEncashableDaysPerYear: Number(lt.maxEncashableDaysPerYear ?? 0),
        alreadyEncashedThisYear: Number(balance.encashedDays),
      });
    }
    return results;
  }

  async request(input: {
    employeeId: string;
    leaveTypeId: string;
    requestedDays: number;
    year?: number;
    trigger?: 'employee_request' | 'exit_automatic';
  }) {
    const year = input.year ?? new Date().getUTCFullYear();
    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id: input.leaveTypeId },
    });
    if (!leaveType) throw DomainException.notFound('Leave type not found');
    if (!leaveType.isEncashable) {
      throw DomainException.withCode(
        ErrorCode.LEAVE_TYPE_NOT_ENCASHABLE,
        422,
        'Leave type is not encashable',
      );
    }

    const balance = await this.leaveBalances.getOrInit(
      input.employeeId,
      input.leaveTypeId,
      year,
    );
    const available =
      this.leaveBalances.availableDays(balance) - Number(balance.encashedDays);
    const eligibleDays = computeEligibleDays({
      availableBalance: available,
      minBalanceToRetain: Number(leaveType.minBalanceToRetain),
      maxEncashableDaysPerYear: Number(leaveType.maxEncashableDaysPerYear ?? 0),
      alreadyEncashedThisYear: Number(balance.encashedDays),
    });

    if (input.requestedDays > eligibleDays + 1e-9) {
      throw DomainException.withCode(
        ErrorCode.EXCEEDS_ELIGIBLE_DAYS,
        422,
        'Requested days exceed eligible encashment days',
        { eligibleDays, requestedDays: input.requestedDays },
      );
    }

    const structure = await this.prisma.salaryStructure.findFirst({
      where: { employeeId: input.employeeId, status: 'active' },
      include: { lines: { include: { salaryComponent: true } } },
    });
    const basic =
      structure?.lines.find((l) => l.salaryComponent.code === 'BASIC')
        ?.amount ?? 0;
    const org = await this.prisma.organizationSettings.findFirst();
    const divisor = org?.encashmentPerDayDivisor ?? 30;
    const perDayAmount = Math.round(basic / divisor);
    const calculatedAmount = Math.round(input.requestedDays * perDayAmount);

    const created = await this.prisma.encashmentRequest.create({
      data: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        year,
        requestedDays: input.requestedDays,
        eligibleDays,
        perDayAmount,
        calculatedAmount,
        status: 'pending',
        trigger: input.trigger ?? 'employee_request',
        currentApprovalLevel: 1,
        approvalSteps: {
          create: [
            { level: 1, approverRole: 'hr_officer', decision: 'pending' },
            { level: 2, approverRole: 'principal', decision: 'pending' },
          ],
        },
      },
      include: { approvalSteps: true },
    });

    await this.events.emitAsync(EventNames.ENCASHMENT_REQUESTED, {
      encashmentRequestId: created.id,
      employeeId: input.employeeId,
    });
    return created;
  }

  async approve(id: string, actorId: string, roles: string[]) {
    const req = await this.prisma.encashmentRequest.findUnique({
      where: { id },
      include: { approvalSteps: { orderBy: { level: 'asc' } } },
    });
    if (!req) throw DomainException.notFound('Encashment request not found');
    if (!['pending', 'hr_approved'].includes(req.status)) {
      throw DomainException.conflict('Request is not awaiting approval');
    }

    const level = req.currentApprovalLevel;
    const step = req.approvalSteps.find((s) => s.level === level);
    if (!step) throw DomainException.conflict('Approval step missing');

    const isHr = roles.some((r) => ['hr_officer', 'super_admin'].includes(r));
    const isPrincipal = roles.some((r) =>
      ['principal', 'super_admin'].includes(r),
    );
    if (level === 1 && !isHr) {
      throw DomainException.forbidden('HR officer approval required');
    }
    if (level === 2 && !isPrincipal) {
      throw DomainException.forbidden('Principal approval required');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.encashmentApprovalStep.update({
        where: { id: step.id },
        data: {
          decision: 'approved',
          decidedAt: new Date(),
          approverUserId: actorId,
        },
      });

      if (level === 1) {
        return tx.encashmentRequest.update({
          where: { id },
          data: { status: 'hr_approved', currentApprovalLevel: 2 },
          include: { approvalSteps: true },
        });
      }

      // Final (principal) approval: deduct balance + create payroll adjustment (EN-05)
      const balance = await this.leaveBalances.getOrInit(
        req.employeeId,
        req.leaveTypeId,
        req.year,
        tx,
      );
      const days = Number(req.requestedDays);
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { encashedDays: { increment: days } },
      });

      const now = new Date();
      const adjustment = await tx.payrollAdjustment.create({
        data: {
          employeeId: req.employeeId,
          periodMonth: now.getUTCMonth() + 1,
          periodYear: now.getUTCFullYear(),
          adjustmentType: 'addition',
          label: 'Leave encashment',
          amount: req.calculatedAmount,
          sourceType: 'encashment',
          sourceId: req.id,
          status: 'pending',
        },
      });

      const updated = await tx.encashmentRequest.update({
        where: { id },
        data: {
          status: 'approved',
          approvedAmount: req.calculatedAmount,
          payrollAdjustmentId: adjustment.id,
        },
        include: { approvalSteps: true },
      });

      await this.events.emitAsync(EventNames.ENCASHMENT_APPROVED, {
        encashmentRequestId: id,
        employeeId: req.employeeId,
        actorId,
      });
      return updated;
    });
  }

  async reject(id: string, actorId: string, reason: string) {
    if (!reason?.trim()) {
      throw DomainException.validation('Rejection reason is mandatory');
    }
    const req = await this.prisma.encashmentRequest.findUnique({
      where: { id },
      include: { approvalSteps: true },
    });
    if (!req) throw DomainException.notFound('Encashment request not found');
    if (!['pending', 'hr_approved'].includes(req.status)) {
      throw DomainException.conflict(
        'Request cannot be rejected in current status',
      );
    }

    const step = req.approvalSteps.find(
      (s) => s.level === req.currentApprovalLevel,
    );
    return this.prisma.$transaction(async (tx) => {
      if (step) {
        await tx.encashmentApprovalStep.update({
          where: { id: step.id },
          data: {
            decision: 'rejected',
            decidedAt: new Date(),
            approverUserId: actorId,
            comment: reason,
          },
        });
      }
      return tx.encashmentRequest.update({
        where: { id },
        data: { status: 'rejected', rejectionReason: reason },
      });
    });
  }

  async process(id: string, payrollRunId: string) {
    const req = await this.prisma.encashmentRequest.findUnique({
      where: { id },
    });
    if (!req) throw DomainException.notFound('Encashment request not found');
    if (req.status !== 'approved') {
      throw DomainException.conflict(
        'Only approved encashments can be processed',
      );
    }
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
    });
    if (!run) throw DomainException.notFound('Payroll run not found');
    if (run.status !== 'locked' && run.status !== 'paid') {
      // EN-06: processed only when run is locked — attach while draft/calculated,
      // mark processed once locked by payroll flow; here we require locked.
      throw DomainException.withCode(
        ErrorCode.PAYROLL_NOT_LOCKED,
        409,
        'Encashment is processed only when its payroll run is locked',
      );
    }

    const updated = await this.prisma.encashmentRequest.update({
      where: { id },
      data: {
        status: 'processed',
        payrollRunId,
        processedAt: new Date(),
      },
    });
    if (req.payrollAdjustmentId) {
      await this.prisma.payrollAdjustment.update({
        where: { id: req.payrollAdjustmentId },
        data: {
          appliedPayrollRunId: payrollRunId,
          status: 'applied',
        },
      });
    }
    await this.events.emitAsync(EventNames.ENCASHMENT_PROCESSED, {
      encashmentRequestId: id,
      payrollRunId,
    });
    return updated;
  }
}
