import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { WorkingDaysService } from './working-days.service';

@Injectable()
export class StudentLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly workingDays: WorkingDaysService,
  ) {}

  list(filters?: { status?: string; studentId?: string }) {
    return this.prisma.studentLeaveRequest.findMany({
      where: {
        ...(filters?.status
          ? { status: filters.status as 'pending' | 'approved' | 'rejected' }
          : {}),
        ...(filters?.studentId ? { studentId: filters.studentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, fullName: true, studentCode: true } },
      },
    });
  }

  async get(id: string) {
    const row = await this.prisma.studentLeaveRequest.findUnique({
      where: { id },
      include: { student: true },
    });
    if (!row) throw DomainException.notFound('Leave request not found');
    return row;
  }

  async submit(params: {
    studentId: string;
    requestedBy: string;
    leaveType: 'medical' | 'family' | 'travel' | 'other';
    startDate: string;
    endDate: string;
    reason?: string;
  }) {
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (start < today) {
      throw DomainException.withCode(
        ErrorCode.BACKDATED_REQUEST,
        422,
        'Advance leave must start today or later',
      );
    }
    if (start > end) {
      throw DomainException.validation('startDate must be ≤ endDate');
    }

    const overlap = await this.prisma.studentLeaveRequest.findFirst({
      where: {
        studentId: params.studentId,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap) {
      throw DomainException.withCode(
        ErrorCode.OVERLAPPING_LEAVE,
        409,
        'Overlapping leave request exists',
      );
    }

    const days = await this.workingDays.countWorkingDays(start, end);
    const created = await this.prisma.studentLeaveRequest.create({
      data: {
        studentId: params.studentId,
        requestedBy: params.requestedBy,
        leaveType: params.leaveType,
        startDate: start,
        endDate: end,
        totalDays: days,
        reason: params.reason,
      },
    });
    await this.events.emitAsync(EventNames.STUDENT_LEAVE_SUBMITTED, {
      leaveRequestId: created.id,
      studentId: params.studentId,
    });
    return created;
  }

  async approve(id: string, reviewedBy: string) {
    const req = await this.get(id);
    if (req.status !== 'pending') {
      throw DomainException.conflict('Leave request is not pending');
    }
    const updated = await this.prisma.studentLeaveRequest.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedBy,
        reviewedAt: new Date(),
      },
    });
    await this.events.emitAsync(EventNames.STUDENT_LEAVE_APPROVED, {
      leaveRequestId: id,
      studentId: req.studentId,
      startDate: req.startDate.toISOString().slice(0, 10),
      endDate: req.endDate.toISOString().slice(0, 10),
      reviewedBy,
    });
    return updated;
  }

  async reject(id: string, reviewedBy: string, reviewNote: string) {
    if (!reviewNote?.trim()) {
      throw DomainException.validation('Rejection reason is required');
    }
    const req = await this.get(id);
    if (req.status !== 'pending') {
      throw DomainException.conflict('Leave request is not pending');
    }
    const updated = await this.prisma.studentLeaveRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy,
        reviewedAt: new Date(),
        reviewNote,
      },
    });
    await this.events.emitAsync(EventNames.STUDENT_LEAVE_REJECTED, {
      leaveRequestId: id,
      studentId: req.studentId,
      reason: reviewNote,
    });
    return updated;
  }
}

@Injectable()
export class AttendanceExcusedLeaveListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workingDays: WorkingDaysService,
  ) {}

  @OnEvent(EventNames.STUDENT_LEAVE_APPROVED)
  async onApproved(payload: {
    leaveRequestId: string;
    studentId: string;
    startDate: string;
    endDate: string;
    reviewedBy: string;
  }) {
    const student = await this.prisma.student.findUnique({
      where: { id: payload.studentId },
    });
    if (!student?.shiftId) return;

    const start = new Date(payload.startDate);
    const end = new Date(payload.endDate);
    const workingDates = await this.workingDays.listWorkingDates(start, end);

    for (const attendanceDate of workingDates) {
      const existing = await this.prisma.studentAttendance.findUnique({
        where: {
          studentId_attendanceDate: {
            studentId: payload.studentId,
            attendanceDate,
          },
        },
      });
      if (existing?.status === 'present') continue;
      await this.prisma.studentAttendance.upsert({
        where: {
          studentId_attendanceDate: {
            studentId: payload.studentId,
            attendanceDate,
          },
        },
        create: {
          studentId: payload.studentId,
          attendanceDate,
          shiftId: student.shiftId,
          status: 'excused_leave',
          markedBy: payload.reviewedBy,
          markedAt: new Date(),
          remarks: `Leave ${payload.leaveRequestId}`,
        },
        update: {
          status: 'excused_leave',
          markedBy: payload.reviewedBy,
          markedAt: new Date(),
        },
      });
    }
  }
}
