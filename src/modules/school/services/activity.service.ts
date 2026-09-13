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
import { NotificationPort } from '../../../shared/ports/notification.port';
import { CreateActivityDto } from '../dto/activity.dto';
import {
  notifyGuardiansForStudent,
  notifyStaffByRoles,
} from './guardian-notify.util';

function parseTime(value: string): Date {
  const [hours, minutes, seconds] = value.split(':').map(Number);
  return new Date(
    Date.UTC(1970, 0, 1, hours || 0, minutes || 0, seconds || 0),
  );
}

function enrollmentCounts(
  enrollments: Array<{ enrollmentState: string; consentStatus: string }>,
) {
  let confirmedCount = 0;
  let waitlistedCount = 0;
  for (const row of enrollments) {
    if (row.enrollmentState === 'confirmed') {
      confirmedCount += 1;
    } else if (
      row.enrollmentState === 'waitlisted' &&
      row.consentStatus === 'confirmed'
    ) {
      waitlistedCount += 1;
    }
  }
  return { confirmedCount, waitlistedCount };
}

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationPort,
  ) {}

  listTypes() {
    return this.prisma.activityType.findMany({ orderBy: { name: 'asc' } });
  }

  /** Calendar feed: activities between optional from/to (inclusive dates). */
  async calendar(filters?: { from?: Date; to?: Date }) {
    const from =
      filters?.from ??
      new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const to =
      filters?.to ??
      new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 2, 0),
      );
    const activities = await this.list({ from, to });
    return activities.map((a) => ({
      id: a.id,
      title: a.name,
      date: a.activityDate,
      startTime: a.startTime,
      endTime: a.endTime,
      venue: a.venue,
      status: a.status,
      capacity: a.capacity,
      confirmedCount: a.confirmedCount,
      waitlistedCount: a.waitlistedCount,
      activityType: a.activityType,
    }));
  }

  /**
   * O-02: close registration after opt-in deadline — decline pending invites
   * and notify coordinators. Idempotent once no pending remain.
   */
  async closeExpiredOptIns(now: Date = new Date()) {
    const due = await this.prisma.outdoorActivity.findMany({
      where: {
        status: 'upcoming',
        optInDeadline: { lte: now },
      },
      include: {
        enrollments: {
          where: { consentStatus: 'pending' },
        },
      },
    });

    let closed = 0;
    let pendingDeclined = 0;
    for (const activity of due) {
      if (!activity.enrollments.length) continue;
      for (const enrollment of activity.enrollments) {
        await this.prisma.activityEnrollment.update({
          where: { id: enrollment.id },
          data: {
            consentStatus: 'declined',
            enrollmentState: 'withdrawn',
            declinedReason: 'Opt-in deadline passed',
            withdrawnAt: now,
          },
        });
        pendingDeclined += 1;
      }
      await notifyStaffByRoles(this.prisma, this.notifications, ['coordinator'], {
        type: 'activity_optin_closed',
        title: 'Activity registration closed',
        body: `Registration for "${activity.name}" closed. Confirmed: ${activity.participantCount}. Pending invites declined: ${activity.enrollments.length}.`,
        entityType: 'outdoor_activity',
        entityId: activity.id,
      });
      closed += 1;
    }
    return { closed, pendingDeclined };
  }

  /** Unpaid activity fee alerts for upcoming activities. */
  async sendUnpaidFeeReminders(now: Date = new Date()) {
    const enrollments = await this.prisma.activityEnrollment.findMany({
      where: {
        enrollmentState: 'confirmed',
        feeStatus: 'pending',
        invoiceId: { not: null },
        activity: {
          status: 'upcoming',
          activityDate: { gte: now },
        },
      },
      include: { activity: true },
    });

    let remindersSent = 0;
    for (const enrollment of enrollments) {
      await notifyGuardiansForStudent(
        this.prisma,
        this.notifications,
        enrollment.studentId,
        {
          type: 'activity_fee_unpaid',
          title: 'Activity fee unpaid',
          body: `Fee for "${enrollment.activity.name}" on ${enrollment.activity.activityDate.toISOString().slice(0, 10)} is still unpaid.`,
        },
      );
      await this.events.emitAsync(EventNames.ACTIVITY_FEE_UNPAID, {
        activityId: enrollment.activityId,
        studentId: enrollment.studentId,
        invoiceId: enrollment.invoiceId,
      });
      remindersSent += 1;
    }
    return { remindersSent };
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
    data: Partial<{
      name: string;
      defaultFeeAmount: number;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.activityType.update({ where: { id }, data });
  }

  async list(filters?: { from?: Date; to?: Date }) {
    const activities = await this.prisma.outdoorActivity.findMany({
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
      include: {
        activityType: true,
        enrollments: {
          select: { enrollmentState: true, consentStatus: true },
        },
      },
      orderBy: { activityDate: 'asc' },
    });
    return activities.map(({ enrollments, ...activity }) => ({
      ...activity,
      ...enrollmentCounts(enrollments),
    }));
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
    return { ...a, ...enrollmentCounts(a.enrollments) };
  }

  async create(data: CreateActivityDto) {
    const type = await this.prisma.activityType.findUnique({
      where: { id: data.activityTypeId },
    });
    if (!type) throw DomainException.notFound('Activity type not found');

    const supervisorTeacherIds = data.supervisorTeacherIds ?? [];
    if (supervisorTeacherIds.length > 0) {
      const teachers = await this.prisma.teacher.findMany({
        where: { id: { in: supervisorTeacherIds } },
        select: { id: true },
      });
      if (teachers.length !== supervisorTeacherIds.length) {
        throw DomainException.validation('One or more supervisors not found');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const activity = await tx.outdoorActivity.create({
        data: {
          activityTypeId: data.activityTypeId,
          name: data.name,
          description: data.description,
          activityDate: new Date(data.activityDate),
          startTime: data.startTime ? parseTime(data.startTime) : undefined,
          endTime: data.endTime ? parseTime(data.endTime) : undefined,
          durationMinutes: data.durationMinutes,
          capacity: data.capacity,
          feeAmount: data.feeAmount ?? type.defaultFeeAmount,
          optInDeadline: new Date(data.optInDeadline),
          venue: data.venue,
          waitlistEnabled: data.waitlistEnabled ?? true,
        },
      });

      if (supervisorTeacherIds.length > 0) {
        await tx.activitySupervisor.createMany({
          data: supervisorTeacherIds.map((teacherId) => ({
            activityId: activity.id,
            teacherId,
          })),
        });
      }

      return activity;
    });

    await this.events.emitAsync(EventNames.ACTIVITY_CREATED, {
      activityId: created.id,
    });
    return this.get(created.id);
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
    const updated = await this.prisma.outdoorActivity.update({
      where: { id },
      data: { postSummary, status: 'completed' },
      select: { id: true, postSummary: true, updatedAt: true },
    });

    const notes = updated.postSummary ?? '';
    return {
      activityId: updated.id,
      notes,
      updatedAt: notes ? updated.updatedAt.toISOString() : null,
    };
  }

  async getSummary(id: string) {
    const activity = await this.prisma.outdoorActivity.findUnique({
      where: { id },
      select: { id: true, postSummary: true, updatedAt: true },
    });
    if (!activity) throw DomainException.notFound('Activity not found');

    const notes = activity.postSummary ?? '';
    return {
      activityId: activity.id,
      notes,
      updatedAt: notes ? activity.updatedAt.toISOString() : null,
    };
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
      include: {
        student: { select: { id: true, fullName: true, studentCode: true } },
      },
      orderBy: [{ enrollmentState: 'asc' }, { waitlistPosition: 'asc' }],
    });
  }

  async invite(activityId: string, studentIds: string[], actorUserId: string) {
    const uniqueStudentIds = [...new Set(studentIds)];
    const activity = await this.prisma.outdoorActivity.findUnique({
      where: { id: activityId },
    });
    if (!activity) throw DomainException.notFound('Activity not found');
    if (activity.status === 'cancelled') {
      throw DomainException.conflict('Activity has been cancelled');
    }

    const students = await this.prisma.student.findMany({
      where: {
        id: { in: uniqueStudentIds },
        deletedAt: null,
        status: 'active',
      },
      select: { id: true },
    });
    if (students.length !== uniqueStudentIds.length) {
      throw DomainException.validation(
        'One or more students are invalid or inactive',
      );
    }

    const results = [];
    for (const studentId of uniqueStudentIds) {
      const existing = await this.prisma.activityEnrollment.findUnique({
        where: { activityId_studentId: { activityId, studentId } },
      });
      if (
        existing?.consentStatus === 'confirmed' &&
        existing.enrollmentState === 'confirmed'
      ) {
        continue;
      }

      const enrollment = await this.prisma.activityEnrollment.upsert({
        where: { activityId_studentId: { activityId, studentId } },
        create: {
          activityId,
          studentId,
          consentStatus: 'pending',
          enrollmentState: 'waitlisted',
          waitlistPosition: null,
        },
        update: {
          consentStatus: 'pending',
          enrollmentState: 'waitlisted',
          waitlistPosition: null,
          withdrawnAt: null,
          declinedReason: null,
          consentChannel: null,
          consentRecordedAt: null,
          consentRecordedBy: null,
        },
        include: {
          student: { select: { id: true, fullName: true, studentCode: true } },
        },
      });

      await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_INVITED, {
        activityId,
        studentId,
        activityName: activity.name,
        actorUserId,
      });
      results.push(enrollment);
    }

    return results;
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
      const row = await this.prisma.$transaction(async (tx) => {
        // Check if there was a prior confirmed enrollment with an invoice
        const existing = await tx.activityEnrollment.findUnique({
          where: {
            activityId_studentId: {
              activityId: params.activityId,
              studentId: params.studentId,
            },
          },
        });

        // If declining after being confirmed, decrement participantCount
        if (existing?.enrollmentState === 'confirmed') {
          await tx.outdoorActivity.update({
            where: { id: params.activityId },
            data: { participantCount: { decrement: 1 } },
          });
        }

        const updated = await tx.activityEnrollment.upsert({
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

        // Cancel the existing invoice if it's unpaid
        if (existing?.invoiceId) {
          const inv = await tx.feeInvoice.findUnique({
            where: { id: existing.invoiceId },
          });
          if (inv && inv.paidAmount === 0 && inv.status !== 'cancelled') {
            await tx.feeInvoice.update({
              where: { id: inv.id },
              data: {
                status: 'cancelled',
                cancelledReason: 'Student declined activity participation',
              },
            });
          }
        }

        return updated;
      });

      await this.events.emitAsync(EventNames.ACTIVITY_OPTIN_DECLINED, {
        activityId: params.activityId,
        studentId: params.studentId,
      });
      return row;
    }

    return this.prisma
      .$transaction(async (tx) => {
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
      })
      .then(async (enrollment) => {
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
      const enrollment = await tx.activityEnrollment.update({
        where: { id: existing.id },
        data: {
          consentStatus: 'pending',
          enrollmentState: 'waitlisted',
          waitlistPosition: null,
          withdrawnAt: new Date(),
          consentChannel: null,
          consentRecordedAt: null,
          consentRecordedBy: null,
          declinedReason: null,
        },
        include: {
          student: { select: { id: true, fullName: true, studentCode: true } },
        },
      });

      if (wasConfirmed) {
        await tx.outdoorActivity.update({
          where: { id: activityId },
          data: { participantCount: { decrement: 1 } },
        });

        // Cancel the invoice of the withdrawing student if unpaid
        if (existing.invoiceId) {
          const inv = await tx.feeInvoice.findUnique({
            where: { id: existing.invoiceId },
          });
          if (inv && inv.paidAmount === 0 && inv.status !== 'cancelled') {
            await tx.feeInvoice.update({
              where: { id: inv.id },
              data: {
                status: 'cancelled',
                cancelledReason: 'Student withdrew from activity',
              },
            });
          }
        }

        const next = await tx.activityEnrollment.findFirst({
          where: {
            activityId,
            enrollmentState: 'waitlisted',
            consentStatus: 'confirmed',
          },
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
      return enrollment;
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
    marks: Array<{
      studentId: string;
      status: 'present' | 'absent' | 'withdrew_last_minute';
      remarks?: string;
    }>,
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

@Injectable()
export class ActivityMediaService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureActivity(activityId: string) {
    const activity = await this.prisma.outdoorActivity.findUnique({
      where: { id: activityId },
      select: { id: true },
    });
    if (!activity) throw DomainException.notFound('Activity not found');
  }

  async list(activityId: string) {
    await this.ensureActivity(activityId);
    const rows = await this.prisma.activityMedia.findMany({
      where: { activityId },
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) return [];

    const attachments = await this.prisma.attachment.findMany({
      where: {
        id: { in: rows.map((row) => row.attachmentId) },
        deletedAt: null,
      },
      select: { id: true, originalFilename: true },
    });
    const byId = new Map(attachments.map((a) => [a.id, a]));

    return rows.map((row) => ({
      id: row.id,
      activityId: row.activityId,
      attachmentId: row.attachmentId,
      caption: row.caption ?? '',
      fileName: byId.get(row.attachmentId)?.originalFilename ?? 'photo',
    }));
  }

  async add(
    activityId: string,
    input: { attachmentId: string; caption?: string },
  ) {
    await this.ensureActivity(activityId);

    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: input.attachmentId,
        deletedAt: null,
        status: 'confirmed',
      },
    });
    if (!attachment) {
      throw DomainException.notFound('Attachment not found or not confirmed');
    }

    const media = await this.prisma.activityMedia.create({
      data: {
        activityId,
        attachmentId: input.attachmentId,
        caption: input.caption?.trim() || attachment.originalFilename,
      },
    });

    await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        entityType: 'activity_media',
        entityId: media.id,
      },
    });

    return {
      id: media.id,
      activityId: media.activityId,
      attachmentId: media.attachmentId,
      caption: media.caption ?? '',
      fileName: attachment.originalFilename,
    };
  }

  async remove(activityId: string, mediaId: string) {
    const row = await this.prisma.activityMedia.findFirst({
      where: { id: mediaId, activityId },
    });
    if (!row) throw DomainException.notFound('Media not found');

    await this.prisma.activityMedia.delete({ where: { id: mediaId } });
    return { ok: true };
  }
}
