import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  listTypes() {
    return this.prisma.activityType.findMany({ orderBy: { name: 'asc' } });
  }

  async createType(data: {
    name: string;
    defaultFeeAmount?: number;
    isActive?: boolean;
  }) {
    return this.prisma.activityType.create({
      data: {
        name: data.name,
        defaultFeeAmount: data.defaultFeeAmount ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateType(
    id: string,
    data: Partial<{ name: string; defaultFeeAmount: number; isActive: boolean }>,
  ) {
    return this.prisma.activityType.update({ where: { id }, data });
  }

  list(filters?: { from?: Date; to?: Date }) {
    return this.prisma.outdoorActivity.findMany({
      where: {
        ...(filters?.from || filters?.to
          ? {
              activityDate: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: { activityType: true, _count: { select: { enrollments: true } } },
      orderBy: { activityDate: 'asc' },
    });
  }

  async get(id: string) {
    const a = await this.prisma.outdoorActivity.findUnique({
      where: { id },
      include: {
        activityType: true,
        supervisors: true,
        enrollments: true,
        media: true,
      },
    });
    if (!a) throw DomainException.notFound('Activity not found');
    return a;
  }

  async create(data: {
    activityTypeId: string;
    name: string;
    description?: string;
    activityDate: string;
    capacity: number;
    feeAmount?: number;
    optInDeadline: string;
    venue?: string;
    waitlistEnabled?: boolean;
  }) {
    const type = await this.prisma.activityType.findUnique({
      where: { id: data.activityTypeId },
    });
    if (!type) throw DomainException.notFound('Activity type not found');
    const created = await this.prisma.outdoorActivity.create({
      data: {
        activityTypeId: data.activityTypeId,
        name: data.name,
        description: data.description,
        activityDate: new Date(data.activityDate),
        capacity: data.capacity,
        feeAmount: data.feeAmount ?? type.defaultFeeAmount,
        optInDeadline: new Date(data.optInDeadline),
        venue: data.venue,
        waitlistEnabled: data.waitlistEnabled ?? true,
      },
    });
    await this.events.emitAsync(EventNames.ACTIVITY_CREATED, {
      activityId: created.id,
    });
    return created;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      capacity: number;
      feeAmount: number;
      optInDeadline: string;
      venue: string;
      postSummary: string;
    }>,
  ) {
    await this.get(id);
    return this.prisma.outdoorActivity.update({
      where: { id },
      data: {
        ...data,
        optInDeadline: data.optInDeadline
          ? new Date(data.optInDeadline)
          : undefined,
      },
    });
  }

  async cancel(id: string, reason: string) {
    await this.get(id);
    const updated = await this.prisma.outdoorActivity.update({
      where: { id },
      data: { status: 'cancelled', cancellationReason: reason },
    });
    await this.events.emitAsync(EventNames.ACTIVITY_CANCELLED, {
      activityId: id,
      reason,
    });
    return updated;
  }

  async setSummary(id: string, postSummary: string) {
    return this.prisma.outdoorActivity.update({
      where: { id },
      data: { postSummary, status: 'completed' },
    });
  }
}

@Injectable()
export class ActivityEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly numbering: NumberingService,
    private readonly ledger: LedgerPort,
  ) {}

  listEnrollments(activityId: string) {
    return this.prisma.activityEnrollment.findMany({
      where: { activityId },
      include: { student: { select: { id: true, fullName: true, studentCode: true } } },
      orderBy: [{ enrollmentState: 'asc' }, { waitlistPosition: 'asc' }],
    });
  }

  /**
   * Confirm or waitlist a student (O-01–O-05, O-10).
   */
  async respond(params: {
    activityId: string;
    studentId: string;
    accept: boolean;
    channel: 'portal' | 'coordinator_manual';
    actorUserId: string;
    declinedReason?: string;
  }) {
    const activity = await this.prisma.outdoorActivity.findUnique({
      where: { id: params.activityId },
    });
    if (!activity) throw DomainException.notFound('Activity not found');
    if (activity.status === 'cancelled') {
      throw DomainException.conflict('Activity cancelled');
    }
    if (new Date() > activity.optInDeadline) {
      throw DomainException.withCode(
        ErrorCode.OPTIN_CLOSED,
        409,
        'Opt-in deadline has passed',
      );
    }

    const student = await this.prisma.student.findFirst({
      where: { id: params.studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');
    if (student.status !== 'active') {
      throw DomainException.withCode(
        ErrorCode.STUDENT_NOT_ACTIVE,
        422,
        'Only active students may enroll',
      );
    }

    if (!params.accept) {
      const row = await this.prisma.activityEnrollment.upsert({
        where: {
          activityId_studentId: {
            activityId: params.activityId,
            studentId: params.studentId,
          },
        },
        create: {
          activityId: params.activityId,
          studentId: params.studentId,
          consentStatus: 'declined',
          enrollmentState: 'declined',
          consentChannel: params.channel,
          consentRecordedAt: new Date(),
          consentRecordedBy: params.actorUserId,
          declinedReason: params.declinedReason,
        },
        update: {
          consentStatus: 'declined',
          enrollmentState: 'declined',
          declinedReason: params.declinedReason,
          consentRecordedAt: new Date(),
        },
      });
      await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_DECLINED, {
        activityId: params.activityId,
        studentId: params.studentId,
      });
      return row;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM outdoor_activities WHERE id = ${params.activityId}::uuid FOR UPDATE
      `;
      const confirmedCount = await tx.activityEnrollment.count({
        where: {
          activityId: params.activityId,
          enrollmentState: 'confirmed',
        },
      });

      let enrollmentState: 'confirmed' | 'waitlisted' = 'confirmed';
      let waitlistPosition: number | null = null;
      if (confirmedCount >= activity.capacity) {
        if (!activity.waitlistEnabled) {
          throw DomainException.conflict('Activity is at capacity');
        }
        enrollmentState = 'waitlisted';
        const maxPos = await tx.activityEnrollment.aggregate({
          where: {
            activityId: params.activityId,
            enrollmentState: 'waitlisted',
          },
          _max: { waitlistPosition: true },
        });
        waitlistPosition = (maxPos._max.waitlistPosition ?? 0) + 1;
      }

      const enrollment = await tx.activityEnrollment.upsert({
        where: {
          activityId_studentId: {
            activityId: params.activityId,
            studentId: params.studentId,
          },
        },
        create: {
          activityId: params.activityId,
          studentId: params.studentId,
          consentStatus: 'confirmed',
          enrollmentState,
          waitlistPosition,
          consentChannel: params.channel,
          consentRecordedAt: new Date(),
          consentRecordedBy: params.actorUserId,
        },
        update: {
          consentStatus: 'confirmed',
          enrollmentState,
          waitlistPosition,
          consentRecordedAt: new Date(),
          declinedReason: null,
        },
      });

      if (enrollmentState === 'confirmed') {
        await tx.outdoorActivity.update({
          where: { id: params.activityId },
          data: { participantCount: { increment: 1 } },
        });
      }

      return enrollment;
    }).then(async (enrollment) => {
      if (enrollment.enrollmentState === 'confirmed') {
        await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_CONFIRMED, {
          activityId: params.activityId,
          studentId: params.studentId,
          enrollmentId: enrollment.id,
        });
      }
      return enrollment;
    });
  }

  async withdraw(activityId: string, studentId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM outdoor_activities WHERE id = ${activityId}::uuid FOR UPDATE
      `;
      const existing = await tx.activityEnrollment.findUnique({
        where: { activityId_studentId: { activityId, studentId } },
      });
      if (!existing) throw DomainException.notFound('Enrollment not found');

      const wasConfirmed = existing.enrollmentState === 'confirmed';
      await tx.activityEnrollment.update({
        where: { id: existing.id },
        data: {
          enrollmentState: 'withdrawn',
          withdrawnAt: new Date(),
          waitlistPosition: null,
        },
      });

      if (wasConfirmed) {
        await tx.outdoorActivity.update({
          where: { id: activityId },
          data: { participantCount: { decrement: 1 } },
        });
        const next = await tx.activityEnrollment.findFirst({
          where: { activityId, enrollmentState: 'waitlisted' },
          orderBy: { waitlistPosition: 'asc' },
        });
        if (next) {
          await tx.activityEnrollment.update({
            where: { id: next.id },
            data: {
              enrollmentState: 'confirmed',
              waitlistPosition: null,
            },
          });
          await tx.outdoorActivity.update({
            where: { id: activityId },
            data: { participantCount: { increment: 1 } },
          });
          await this.events.emitAsync(EventNames.ACTIVITY_WAITLIST_PROMOTED, {
            activityId,
            studentId: next.studentId,
            enrollmentId: next.id,
          });
          await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_CONFIRMED, {
            activityId,
            studentId: next.studentId,
            enrollmentId: next.id,
          });
        }
      }
      return { withdrawn: true };
    });
  }

  /** Generate activity invoice for a confirmed enrollment (O-05). */
  async generateInvoice(activityId: string, studentId: string) {
    const activity = await this.prisma.outdoorActivity.findUnique({
      where: { id: activityId },
    });
    if (!activity) throw DomainException.notFound('Activity not found');
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student?.academicYearId) {
      throw DomainException.validation('Student missing academic year');
    }

    const enrollment = await this.prisma.activityEnrollment.findUnique({
      where: { activityId_studentId: { activityId, studentId } },
    });
    if (!enrollment || enrollment.enrollmentState !== 'confirmed') {
      throw DomainException.conflict('Enrollment not confirmed');
    }
    if (enrollment.invoiceId) {
      return this.prisma.feeInvoice.findUnique({
        where: { id: enrollment.invoiceId },
      });
    }

    let activityHead = await this.prisma.feeHead.findUnique({
      where: { code: 'ACTIVITY' },
    });
    if (!activityHead) {
      activityHead = await this.prisma.feeHead.create({
        data: {
          code: 'ACTIVITY',
          name: 'Activity Fee',
          headType: 'other',
          isRecurring: false,
        },
      });
    }

    const invoiceNumber = await this.numbering.nextCode('invoice');
    const issueDate = new Date();
    const dueDate = activity.activityDate;
    const amount = activity.feeAmount;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.feeInvoice.create({
        data: {
          invoiceNumber,
          studentId,
          academicYearId: student.academicYearId!,
          invoiceType: 'activity',
          activityId,
          issueDate,
          dueDate,
          grossAmount: amount,
          discountAmount: 0,
          waivedAmount: 0,
          netAmount: amount,
          paidAmount: 0,
          outstandingAmount: amount,
          status: 'issued',
          lines: {
            create: [
              {
                feeHeadId: activityHead!.id,
                description: activity.name,
                amount,
                discountAmount: 0,
                netAmount: amount,
              },
            ],
          },
        },
      });
      await tx.activityEnrollment.update({
        where: { id: enrollment.id },
        data: { invoiceId: inv.id, feeStatus: 'pending' },
      });
      return inv;
    });

    await this.ledger.post({
      referenceType: 'fee_invoice',
      referenceId: invoice.id,
      amount,
      costCenter: 'school',
      description: `Activity fee ${activity.name}`,
      debitAccountCode: '1200',
      creditAccountCode: '4005',
      postingDate: issueDate,
    });

    return invoice;
  }
}

@Injectable()
export class ActivityAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  list(activityId: string) {
    return this.prisma.activityAttendance.findMany({ where: { activityId } });
  }

  /** O-08: writes only activity_attendance — never student_attendance. */
  async bulkMark(
    activityId: string,
    marks: Array<{ studentId: string; status: 'present' | 'absent' | 'withdrew_last_minute'; remarks?: string }>,
    markedBy: string,
  ) {
    const results = [];
    for (const m of marks) {
      const row = await this.prisma.activityAttendance.upsert({
        where: {
          activityId_studentId: { activityId, studentId: m.studentId },
        },
        create: {
          activityId,
          studentId: m.studentId,
          status: m.status,
          remarks: m.remarks,
          markedBy,
        },
        update: { status: m.status, remarks: m.remarks, markedBy },
      });
      results.push(row);
    }
    return results;
  }
}
