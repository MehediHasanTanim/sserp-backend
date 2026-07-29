import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { HrCalendarService } from './hr-calendar.service';
import { LeaveBalanceService } from './leave-balance.service';

const INCLUDE = {
  leaveType: true,
  employee: {
    select: { id: true, employeeCode: true, fullName: true, department: true },
  },
  approvalSteps: { orderBy: { level: 'asc' as const } },
};

@Injectable()
export class LeaveApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: HrCalendarService,
    private readonly balances: LeaveBalanceService,
    private readonly events: EventEmitter2,
  ) {}

  async approve(
    id: string,
    approverUserId: string,
    actorRoles: string[],
    comment?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.hrLeaveRequest.findUnique({
        where: { id },
        include: {
          approvalSteps: { orderBy: { level: 'asc' } },
          leaveType: true,
        },
      });
      if (!request) throw DomainException.notFound('Leave request not found');
      if (request.status !== 'pending') {
        throw DomainException.conflict(
          `Leave request is already ${request.status}`,
        );
      }

      const step = request.approvalSteps.find(
        (s) => s.level === request.currentApprovalLevel,
      );
      if (!step)
        throw DomainException.conflict('No pending approval step found');
      if (!actorRoles.includes(step.approverRole)) {
        throw DomainException.forbidden(
          `Only ${step.approverRole} may approve at level ${step.level}`,
        );
      }

      await tx.leaveApprovalStep.update({
        where: { id: step.id },
        data: {
          decision: 'approved',
          decidedAt: new Date(),
          approverUserId,
          comment,
        },
      });

      const maxLevel = Math.max(...request.approvalSteps.map((s) => s.level));
      const isFinal = request.currentApprovalLevel >= maxLevel;

      if (!isFinal) {
        return {
          request: await tx.hrLeaveRequest.update({
            where: { id },
            data: { currentApprovalLevel: request.currentApprovalLevel + 1 },
            include: INCLUDE,
          }),
          finalized: false,
        };
      }

      // L-05: final configured level approves -> move pending days to consumed.
      const year = request.startDate.getUTCFullYear();
      const balance = await this.balances.getOrInit(
        request.employeeId,
        request.leaveTypeId,
        year,
        tx,
      );
      await this.balances.consumeFromPending(
        tx,
        balance.id,
        Number(request.totalDays),
      );

      // L-07: write hr_attendance leave rows for every working day in range.
      const employee = await tx.employee.findUnique({
        where: { id: request.employeeId },
      });
      const workingDates = request.isHalfDay
        ? [request.startDate]
        : await this.calendar.listWorkingDates(
            request.startDate,
            request.endDate,
            employee?.department,
            tx,
          );
      for (const date of workingDates) {
        await tx.hrAttendance.upsert({
          where: {
            employeeId_attendanceDate: {
              employeeId: request.employeeId,
              attendanceDate: date,
            },
          },
          create: {
            employeeId: request.employeeId,
            attendanceDate: date,
            status: 'leave',
            markedBy: approverUserId,
          },
          update: { status: 'leave', markedBy: approverUserId },
        });
      }

      const updated = await tx.hrLeaveRequest.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: approverUserId,
          approvedAt: new Date(),
        },
        include: INCLUDE,
      });

      return { request: updated, finalized: true };
    });

    if (result.finalized) {
      await this.events.emitAsync(EventNames.HR_LEAVE_APPROVED, {
        leaveRequestId: result.request.id,
        employeeId: result.request.employeeId,
        leaveTypeCode: result.request.leaveType.code,
        startDate: result.request.startDate,
        endDate: result.request.endDate,
        approvedBy: approverUserId,
      });
    }

    return result.request;
  }

  async reject(
    id: string,
    approverUserId: string,
    actorRoles: string[],
    reason: string,
  ) {
    const request = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.hrLeaveRequest.findUnique({
        where: { id },
        include: { approvalSteps: { orderBy: { level: 'asc' } } },
      });
      if (!existing) throw DomainException.notFound('Leave request not found');
      if (existing.status !== 'pending') {
        throw DomainException.conflict(
          `Leave request is already ${existing.status}`,
        );
      }

      const step = existing.approvalSteps.find(
        (s) => s.level === existing.currentApprovalLevel,
      );
      if (!step)
        throw DomainException.conflict('No pending approval step found');
      if (!actorRoles.includes(step.approverRole)) {
        throw DomainException.forbidden(
          `Only ${step.approverRole} may reject at level ${step.level}`,
        );
      }

      await tx.leaveApprovalStep.update({
        where: { id: step.id },
        data: {
          decision: 'rejected',
          decidedAt: new Date(),
          approverUserId,
          comment: reason,
        },
      });

      const year = existing.startDate.getUTCFullYear();
      const balance = await this.balances.getOrInit(
        existing.employeeId,
        existing.leaveTypeId,
        year,
        tx,
      );
      await this.balances.release(tx, balance.id, Number(existing.totalDays));

      return tx.hrLeaveRequest.update({
        where: { id },
        data: { status: 'rejected', rejectedReason: reason },
        include: INCLUDE,
      });
    });

    await this.events.emitAsync(EventNames.HR_LEAVE_REJECTED, {
      leaveRequestId: request.id,
      employeeId: request.employeeId,
      reason,
    });

    return request;
  }
}
