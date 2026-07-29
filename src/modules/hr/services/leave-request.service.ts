import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HrDepartment, LeaveRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { HrCalendarService } from './hr-calendar.service';
import { LeaveBalanceService } from './leave-balance.service';

export interface SubmitLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  isHalfDay?: boolean;
  reason?: string;
  medicalCertificateAttachmentId?: string;
}

export interface LeaveRequestListQuery {
  employeeId?: string;
  status?: LeaveRequestStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface CancelActor {
  employeeId?: string;
  isPrivileged: boolean;
}

const DEFAULT_APPROVAL_STEPS = [
  { level: 1, approverRole: 'hr_officer' },
  { level: 2, approverRole: 'principal' },
] as const;

const INCLUDE = {
  leaveType: true,
  employee: {
    select: { id: true, employeeCode: true, fullName: true, department: true },
  },
  approvalSteps: { orderBy: { level: 'asc' as const } },
};

@Injectable()
export class LeaveRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: HrCalendarService,
    private readonly balances: LeaveBalanceService,
    private readonly events: EventEmitter2,
  ) {}

  async resolveEmployeeIdForUser(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      throw DomainException.validation(
        'No employee record is linked to this account',
      );
    }
    return user.employeeId;
  }

  async submit(input: SubmitLeaveRequestInput) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (startDate.getTime() > endDate.getTime()) {
      throw DomainException.validation(
        'startDate must be on or before endDate',
      );
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, deletedAt: null },
    });
    if (!employee) throw DomainException.notFound('Employee not found');

    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id: input.leaveTypeId },
    });
    if (!leaveType || !leaveType.isActive) {
      throw DomainException.notFound('Leave type not found');
    }

    // L-01: no overlap with an existing pending/approved request.
    const overlapping = await this.prisma.hrLeaveRequest.findFirst({
      where: {
        employeeId: input.employeeId,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlapping) {
      throw DomainException.withCode(
        ErrorCode.OVERLAPPING_LEAVE,
        409,
        'An overlapping leave request already exists',
      );
    }

    let totalDays: number;
    if (input.isHalfDay) {
      if (startDate.getTime() !== endDate.getTime()) {
        throw DomainException.validation(
          'Half-day leave must have the same start and end date',
        );
      }
      totalDays = 0.5;
    } else {
      // L-02: exclude holidays and weekly off-days from the count.
      totalDays = await this.calendar.countWorkingDays(
        startDate,
        endDate,
        employee.department,
      );
      if (totalDays <= 0) {
        throw DomainException.validation(
          'Selected range has no working days to apply leave for',
        );
      }
    }

    // L-03: medical certificate required past the configured threshold.
    if (
      leaveType.requiresMedicalCertificateAfterDays != null &&
      totalDays > leaveType.requiresMedicalCertificateAfterDays &&
      !input.medicalCertificateAttachmentId
    ) {
      throw DomainException.withCode(
        ErrorCode.MEDICAL_CERTIFICATE_REQUIRED,
        422,
        `A medical certificate is required for ${leaveType.name} beyond ${leaveType.requiresMedicalCertificateAfterDays} day(s)`,
      );
    }

    const year = startDate.getUTCFullYear();

    return this.prisma.$transaction(async (tx) => {
      const balance = await this.balances.getOrInit(
        input.employeeId,
        input.leaveTypeId,
        year,
        tx,
      );
      const available = this.balances.availableDays(balance);
      if (totalDays > available) {
        throw DomainException.withCode(
          ErrorCode.INSUFFICIENT_LEAVE_BALANCE,
          422,
          `Insufficient leave balance: requested ${totalDays}, available ${available}`,
        );
      }

      // L-04: soft-hold the requested days while pending.
      await this.balances.hold(tx, balance.id, totalDays);

      return tx.hrLeaveRequest.create({
        data: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          startDate,
          endDate,
          totalDays,
          isHalfDay: input.isHalfDay ?? false,
          reason: input.reason,
          medicalCertificateAttachmentId: input.medicalCertificateAttachmentId,
          status: 'pending',
          currentApprovalLevel: 1,
          approvalSteps: {
            create: DEFAULT_APPROVAL_STEPS.map((step) => ({
              level: step.level,
              approverRole: step.approverRole,
              decision: 'pending',
            })),
          },
        },
        include: INCLUDE,
      });
    });
  }

  async list(query: LeaveRequestListQuery, restrictToEmployeeId?: string) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const where: Prisma.HrLeaveRequestWhereInput = {};
    if (restrictToEmployeeId) {
      where.employeeId = restrictToEmployeeId;
    } else if (query.employeeId) {
      where.employeeId = query.employeeId;
    }
    if (query.status) where.status = query.status;
    if (query.dateFrom) where.endDate = { gte: new Date(query.dateFrom) };
    if (query.dateTo) {
      where.startDate = {
        ...(where.startDate as object),
        lte: new Date(query.dateTo),
      };
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.hrLeaveRequest.count({ where }),
      this.prisma.hrLeaveRequest.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: INCLUDE,
      }),
    ]);
    return { items, page, pageSize, total };
  }

  async get(id: string) {
    const request = await this.prisma.hrLeaveRequest.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!request) throw DomainException.notFound('Leave request not found');
    return request;
  }

  assertCanView(
    request: { employeeId: string },
    actor: { employeeId?: string; isPrivileged: boolean },
  ) {
    if (actor.isPrivileged) return;
    if (request.employeeId !== actor.employeeId) {
      throw DomainException.forbidden(
        'You may only view your own leave requests',
      );
    }
  }

  async cancel(id: string, actor: CancelActor) {
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.hrLeaveRequest.findUnique({ where: { id } });
      if (!request) throw DomainException.notFound('Leave request not found');
      if (!actor.isPrivileged && request.employeeId !== actor.employeeId) {
        throw DomainException.forbidden(
          'You may only cancel your own leave requests',
        );
      }
      if (request.status === 'rejected' || request.status === 'cancelled') {
        throw DomainException.conflict(
          `Leave request is already ${request.status}`,
        );
      }

      const year = request.startDate.getUTCFullYear();

      if (request.status === 'pending') {
        const balance = await this.balances.getOrInit(
          request.employeeId,
          request.leaveTypeId,
          year,
          tx,
        );
        await this.balances.release(tx, balance.id, Number(request.totalDays));
      } else if (request.status === 'approved') {
        // L-08: restore balance and delete attendance for the not-yet-elapsed portion only.
        if (request.endDate.getTime() >= today.getTime()) {
          const futureStart =
            request.startDate.getTime() > today.getTime()
              ? request.startDate
              : today;
          const employee = await tx.employee.findUnique({
            where: { id: request.employeeId },
          });
          const restoreDays = request.isHalfDay
            ? Number(request.totalDays)
            : await this.calendar.countWorkingDays(
                futureStart,
                request.endDate,
                employee?.department,
                tx,
              );
          if (restoreDays > 0) {
            const balance = await this.balances.getOrInit(
              request.employeeId,
              request.leaveTypeId,
              year,
              tx,
            );
            await this.balances.restoreFromConsumed(
              tx,
              balance.id,
              restoreDays,
            );
          }
          await tx.hrAttendance.deleteMany({
            where: {
              employeeId: request.employeeId,
              attendanceDate: { gte: futureStart, lte: request.endDate },
              status: 'leave',
            },
          });
        }
      }

      return tx.hrLeaveRequest.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: now },
        include: INCLUDE,
      });
    });

    await this.events.emitAsync(EventNames.HR_LEAVE_CANCELLED, {
      leaveRequestId: result.id,
      employeeId: result.employeeId,
      startDate: result.startDate,
      endDate: result.endDate,
    });

    return result;
  }

  async calendarView(query: {
    department?: HrDepartment;
    dateFrom: string;
    dateTo: string;
  }) {
    const where: Prisma.HrLeaveRequestWhereInput = {
      status: { in: ['pending', 'approved'] },
      startDate: { lte: new Date(query.dateTo) },
      endDate: { gte: new Date(query.dateFrom) },
    };
    if (query.department) where.employee = { department: query.department };

    return this.prisma.hrLeaveRequest.findMany({
      where,
      include: INCLUDE,
      orderBy: { startDate: 'asc' },
    });
  }
}
