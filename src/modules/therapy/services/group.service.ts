import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TherapyType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { ConflictDetectionService } from './conflict-detection.service';

export interface CreateGroupDto {
  name: string;
  therapyType: TherapyType;
  therapistId: string;
  description?: string;
  maxCapacity: number;
  defaultDurationMinutes?: number;
}

export interface EnrollPatientDto {
  groupId: string;
  patientId: string;
  enrollmentDate: Date;
}

export interface MarkGroupAttendanceDto {
  sessionId: string;
  attendances: Array<{
    patientId: string;
    status: 'present' | 'absent' | 'late' | 'excused';
    arrivalTime?: Date;
    individualNotes?: string;
  }>;
}

const MIN_ATTENDANCE_WARNING = 2;

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictDetection: ConflictDetectionService,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateGroupDto, createdBy: string) {
    // Validate therapist supports group sessions for this type
    const spec = await this.prisma.therapistSpecialization.findFirst({
      where: { therapistId: dto.therapistId, therapyType: dto.therapyType },
    });
    if (!spec || !spec.supportsGroup) {
      throw new DomainException(
        ErrorCode.UNSUPPORTED_THERAPY_TYPE,
        422,
        `Therapist does not support group sessions for ${dto.therapyType}`,
      );
    }

    return this.prisma.therapyGroup.create({
      data: {
        name: dto.name,
        therapyType: dto.therapyType,
        therapistId: dto.therapistId,
        description: dto.description,
        maxCapacity: dto.maxCapacity,
        defaultDurationMinutes: dto.defaultDurationMinutes ?? 60,
        createdBy,
      },
    });
  }

  async findById(id: string) {
    const group = await this.prisma.therapyGroup.findUnique({
      where: { id },
      include: {
        memberships: {
          where: { state: 'active' },
          orderBy: { enrollmentDate: 'asc' },
        },
      },
    });
    if (!group) throw DomainException.notFound('Group not found');
    return group;
  }

  async enroll(dto: EnrollPatientDto, enrolledBy: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock row and check capacity
      const group = await tx.therapyGroup.findFirst({
        where: { id: dto.groupId },
        // simulate FOR UPDATE via findFirst inside transaction
      });
      if (!group) throw DomainException.notFound('Group not found');
      if (group.status === 'closed') {
        throw new DomainException(
          ErrorCode.GROUP_CLOSED,
          422,
          'Group is closed',
        );
      }

      const activeCount = await tx.groupMembership.count({
        where: { groupId: dto.groupId, state: 'active' },
      });

      // Check if already enrolled
      const existing = await tx.groupMembership.findFirst({
        where: {
          groupId: dto.groupId,
          patientId: dto.patientId,
          state: { in: ['active', 'waitlisted'] },
        },
      });
      if (existing) {
        throw new DomainException(
          ErrorCode.ALREADY_ENROLLED,
          409,
          'Patient is already enrolled or waitlisted in this group',
        );
      }

      if (activeCount >= group.maxCapacity) {
        // Add to waitlist
        const maxWaitlistPos = await tx.groupMembership.aggregate({
          where: { groupId: dto.groupId, state: 'waitlisted' },
          _max: { waitlistPosition: true },
        });
        const position = (maxWaitlistPos._max.waitlistPosition ?? 0) + 1;

        const membership = await tx.groupMembership.create({
          data: {
            groupId: dto.groupId,
            patientId: dto.patientId,
            enrollmentDate: dto.enrollmentDate,
            state: 'waitlisted',
            waitlistPosition: position,
            enrolledBy,
          },
        });

        await tx.groupHistory.create({
          data: {
            groupId: dto.groupId,
            changeType: 'membership_added',
            detail: {
              patientId: dto.patientId,
              state: 'waitlisted',
              position,
            } as any,
            effectiveDate: dto.enrollmentDate,
            changedBy: enrolledBy,
          },
        });

        this.events.emit(EventNames.GROUP_MEMBERSHIP_WAITLISTED, {
          groupId: dto.groupId,
          patientId: dto.patientId,
          position,
          enrolledBy,
        });

        return membership;
      }

      // Enroll directly
      const membership = await tx.groupMembership.create({
        data: {
          groupId: dto.groupId,
          patientId: dto.patientId,
          enrollmentDate: dto.enrollmentDate,
          state: 'active',
          enrolledBy,
        },
      });

      await tx.groupHistory.create({
        data: {
          groupId: dto.groupId,
          changeType: 'membership_added',
          detail: { patientId: dto.patientId, state: 'active' } as any,
          effectiveDate: dto.enrollmentDate,
          changedBy: enrolledBy,
        },
      });

      this.events.emit(EventNames.GROUP_MEMBERSHIP_ENROLLED, {
        groupId: dto.groupId,
        patientId: dto.patientId,
        enrolledBy,
      });

      return membership;
    });
  }

  async exitMember(
    groupId: string,
    patientId: string,
    exitReason: string,
    exitedBy: string,
  ) {
    const membership = await this.prisma.groupMembership.findFirst({
      where: { groupId, patientId, state: 'active' },
    });
    if (!membership) {
      throw new DomainException(
        ErrorCode.NOT_ENROLLED,
        404,
        'Patient is not an active member of this group',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMembership.update({
        where: { id: membership.id },
        data: { state: 'exited', exitDate: new Date(), exitReason },
      });

      // Promote first waitlisted patient
      const nextWaiting = await tx.groupMembership.findFirst({
        where: { groupId, state: 'waitlisted' },
        orderBy: { waitlistPosition: 'asc' },
      });

      if (nextWaiting) {
        await tx.groupMembership.update({
          where: { id: nextWaiting.id },
          data: { state: 'active', waitlistPosition: null },
        });
        this.events.emit(EventNames.GROUP_MEMBERSHIP_PROMOTED, {
          groupId,
          patientId: nextWaiting.patientId,
          promotedBy: exitedBy,
        });
      }

      await tx.groupHistory.create({
        data: {
          groupId,
          changeType: 'membership_removed',
          detail: { patientId, exitReason } as any,
          effectiveDate: new Date(),
          changedBy: exitedBy,
        },
      });
    });

    this.events.emit(EventNames.GROUP_MEMBERSHIP_EXITED, {
      groupId,
      patientId,
      exitedBy,
    });
  }

  async markGroupAttendance(dto: MarkGroupAttendanceDto, markedBy: string) {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) throw DomainException.notFound('Session not found');
    if (session.sessionMode !== 'group')
      throw DomainException.validation('Session is not a group session');

    const results = await this.prisma.$transaction(
      dto.attendances.map((a) =>
        this.prisma.groupSessionAttendance.upsert({
          where: {
            sessionId_patientId: {
              sessionId: dto.sessionId,
              patientId: a.patientId,
            },
          },
          create: {
            sessionId: dto.sessionId,
            patientId: a.patientId,
            status: a.status,
            arrivalTime: a.arrivalTime,
            individualNotes: a.individualNotes,
            markedBy,
          },
          update: {
            status: a.status,
            arrivalTime: a.arrivalTime,
            individualNotes: a.individualNotes,
            markedBy,
          },
        }),
      ),
    );

    const presentCount = dto.attendances.filter(
      (a) => a.status === 'present' || a.status === 'late',
    ).length;
    if (presentCount < MIN_ATTENDANCE_WARNING) {
      this.logger.warn(
        `Group session ${dto.sessionId} has low attendance: ${presentCount}`,
      );
    }

    return results;
  }

  async close(groupId: string, closeReason: string, closedBy: string) {
    const group = await this.findById(groupId);
    if (group.status === 'closed')
      throw DomainException.conflict('Group is already closed');

    await this.prisma.$transaction(async (tx) => {
      await tx.therapyGroup.update({
        where: { id: groupId },
        data: { status: 'closed', closedAt: new Date(), closeReason },
      });

      await tx.groupHistory.create({
        data: {
          groupId,
          changeType: 'status_changed',
          detail: { status: 'closed', reason: closeReason } as any,
          effectiveDate: new Date(),
          changedBy: closedBy,
        },
      });
    });
  }
}
