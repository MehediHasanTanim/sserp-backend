import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionMode, SessionStatus, TherapyType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { ConflictDetectionService } from './conflict-detection.service';

export interface ScheduleSessionDto {
  sessionMode: SessionMode;
  therapyType: TherapyType;
  therapistId: string;
  patientId?: string;
  groupId?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  room?: string;
  notesInstruction?: string;
  recurrenceId?: string;
  recurrenceOccurrenceIndex?: number;
  isSeriesException?: boolean;
  assessmentPatientName?: string;
  createdFrom?: string;
  force?: boolean;
}

export interface RescheduleSessionDto {
  sessionId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  room?: string;
  force?: boolean;
}

export interface CompleteSessionDto {
  sessionId: string;
  durationMinutesActual?: number;
}

export interface AddSessionNoteDto {
  sessionId: string;
  patientId: string;
  narrative?: string;
  observations?: string;
  interventionsUsed?: Record<string, unknown>;
  homeworkAssigned?: string;
}

const CANCELLABLE_STATUSES: SessionStatus[] = ['scheduled'];
const COMPLETABLE_STATUSES: SessionStatus[] = ['scheduled', 'in_progress'];

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictDetection: ConflictDetectionService,
    private readonly events: EventEmitter2,
  ) {}

  async schedule(dto: ScheduleSessionDto, createdBy: string) {
    if (dto.scheduledEnd <= dto.scheduledStart) {
      throw DomainException.validation(
        'scheduledEnd must be after scheduledStart',
      );
    }

    const durationMinutesPlanned = Math.round(
      (dto.scheduledEnd.getTime() - dto.scheduledStart.getTime()) / 60000,
    );

    if (!dto.force) {
      const conflicts = await this.conflictDetection.check({
        therapistId: dto.therapistId,
        patientId: dto.patientId,
        groupId: dto.groupId,
        scheduledStart: dto.scheduledStart,
        scheduledEnd: dto.scheduledEnd,
      });

      if (conflicts.blocking.length > 0) {
        throw new DomainException(
          ErrorCode.SCHEDULE_CONFLICT,
          409,
          `Scheduling conflict: ${conflicts.blocking[0].message}`,
          { conflicts: conflicts.blocking },
        );
      }
    }

    const session = await this.prisma.therapySession.create({
      data: {
        sessionMode: dto.sessionMode,
        therapyType: dto.therapyType,
        therapistId: dto.therapistId,
        patientId: dto.patientId,
        groupId: dto.groupId,
        scheduledStart: dto.scheduledStart,
        scheduledEnd: dto.scheduledEnd,
        durationMinutesPlanned,
        room: dto.room,
        notesInstruction: dto.notesInstruction,
        recurrenceId: dto.recurrenceId,
        recurrenceOccurrenceIndex: dto.recurrenceOccurrenceIndex,
        isSeriesException: dto.isSeriesException ?? false,
        assessmentPatientName: dto.assessmentPatientName,
        createdFrom: (dto.createdFrom ?? 'main') as any,
        createdBy,
      },
    });

    this.events.emit(EventNames.SESSION_SCHEDULED, {
      sessionId: session.id,
      createdBy,
    });
    return session;
  }

  async findById(id: string) {
    const session = await this.prisma.therapySession.findUnique({
      where: { id },
      include: {
        notes: true,
        attachments: true,
        attendances: true,
        goalProgress: true,
      },
    });
    if (!session) throw DomainException.notFound('Session not found');
    return session;
  }

  async reschedule(dto: RescheduleSessionDto, updatedBy: string) {
    const session = await this.findById(dto.sessionId);
    if (!CANCELLABLE_STATUSES.includes(session.status)) {
      throw new DomainException(
        ErrorCode.SESSION_NOT_CANCELLABLE,
        422,
        `Session cannot be rescheduled in status ${session.status}`,
      );
    }

    if (!dto.force) {
      const conflicts = await this.conflictDetection.check({
        therapistId: session.therapistId,
        patientId: session.patientId,
        groupId: session.groupId,
        scheduledStart: dto.scheduledStart,
        scheduledEnd: dto.scheduledEnd,
        excludeSessionId: dto.sessionId,
      });

      if (conflicts.blocking.length > 0) {
        throw new DomainException(
          ErrorCode.SCHEDULE_CONFLICT,
          409,
          `Scheduling conflict: ${conflicts.blocking[0].message}`,
          { conflicts: conflicts.blocking },
        );
      }
    }

    const updated = await this.prisma.therapySession.update({
      where: { id: dto.sessionId },
      data: {
        scheduledStart: dto.scheduledStart,
        scheduledEnd: dto.scheduledEnd,
        durationMinutesPlanned: Math.round(
          (dto.scheduledEnd.getTime() - dto.scheduledStart.getTime()) / 60000,
        ),
        room: dto.room,
        isSeriesException: true,
      },
    });

    this.events.emit(EventNames.SESSION_RESCHEDULED, {
      sessionId: dto.sessionId,
      updatedBy,
    });
    return updated;
  }

  async complete(dto: CompleteSessionDto, completedBy: string) {
    const session = await this.findById(dto.sessionId);
    if (!COMPLETABLE_STATUSES.includes(session.status)) {
      throw new DomainException(
        ErrorCode.SESSION_ALREADY_COMPLETED,
        422,
        `Session is already in status ${session.status}`,
      );
    }

    const updated = await this.prisma.therapySession.update({
      where: { id: dto.sessionId },
      data: {
        status: 'completed',
        durationMinutesActual: dto.durationMinutesActual,
      },
    });

    this.events.emit(EventNames.SESSION_COMPLETED, {
      sessionId: dto.sessionId,
      therapistId: session.therapistId,
      patientId: session.patientId,
      groupId: session.groupId,
      completedBy,
    });

    return updated;
  }

  async cancel(
    sessionId: string,
    cancellationReason: string,
    cancelledBy: string,
  ) {
    const session = await this.findById(sessionId);
    if (!CANCELLABLE_STATUSES.includes(session.status)) {
      throw new DomainException(
        ErrorCode.SESSION_NOT_CANCELLABLE,
        422,
        `Session cannot be cancelled in status ${session.status}`,
      );
    }

    const updated = await this.prisma.therapySession.update({
      where: { id: sessionId },
      data: {
        status: 'cancelled',
        cancellationReason,
        cancelledBy,
        cancelledAt: new Date(),
      },
    });

    this.events.emit(EventNames.SESSION_CANCELLED, { sessionId, cancelledBy });
    return updated;
  }

  async markNoShow(sessionId: string, recordedBy: string) {
    const session = await this.findById(sessionId);
    if (session.status !== 'scheduled') {
      throw DomainException.validation(
        'Only scheduled sessions can be marked as no-show',
      );
    }

    const updated = await this.prisma.therapySession.update({
      where: { id: sessionId },
      data: { status: 'no_show', noShowRecordedBy: recordedBy },
    });

    this.events.emit(EventNames.SESSION_NO_SHOW, { sessionId, recordedBy });
    return updated;
  }

  async checkConflicts(dto: Omit<ScheduleSessionDto, 'force'>) {
    return this.conflictDetection.check({
      therapistId: dto.therapistId,
      patientId: dto.patientId,
      groupId: dto.groupId,
      scheduledStart: dto.scheduledStart,
      scheduledEnd: dto.scheduledEnd,
    });
  }

  async addNote(dto: AddSessionNoteDto, authoredBy: string) {
    const session = await this.findById(dto.sessionId);
    if (session.status === 'cancelled') {
      throw DomainException.validation(
        'Cannot add notes to a cancelled session',
      );
    }

    return this.prisma.sessionNote.upsert({
      where: {
        sessionId_patientId: {
          sessionId: dto.sessionId,
          patientId: dto.patientId,
        },
      },
      create: {
        sessionId: dto.sessionId,
        patientId: dto.patientId,
        narrative: dto.narrative,
        observations: dto.observations,
        interventionsUsed: dto.interventionsUsed as any,
        homeworkAssigned: dto.homeworkAssigned,
        authoredBy,
        status: 'draft',
      },
      update: {
        narrative: dto.narrative,
        observations: dto.observations,
        interventionsUsed: dto.interventionsUsed as any,
        homeworkAssigned: dto.homeworkAssigned,
      },
    });
  }

  async finalizeNote(sessionId: string, patientId: string, authoredBy: string) {
    const note = await this.prisma.sessionNote.findUnique({
      where: { sessionId_patientId: { sessionId, patientId } },
    });
    if (!note) throw DomainException.notFound('Session note not found');
    if (note.status === 'co_signed')
      throw DomainException.conflict('Note is already co-signed');

    return this.prisma.sessionNote.update({
      where: { id: note.id },
      data: { status: 'final' },
    });
  }

  async coSignNote(
    sessionId: string,
    patientId: string,
    supervisorId: string,
    comment?: string,
  ) {
    const note = await this.prisma.sessionNote.findUnique({
      where: { sessionId_patientId: { sessionId, patientId } },
    });
    if (!note) throw DomainException.notFound('Session note not found');
    if (note.status !== 'final')
      throw DomainException.validation('Only finalized notes can be co-signed');

    return this.prisma.sessionNote.update({
      where: { id: note.id },
      data: {
        status: 'co_signed',
        supervisorReviewedBy: supervisorId,
        supervisorReviewedAt: new Date(),
        supervisorComment: comment,
      },
    });
  }

  async listByTherapist(therapistId: string, from: Date, to: Date) {
    return this.prisma.therapySession.findMany({
      where: {
        therapistId,
        scheduledStart: { gte: from, lte: to },
        status: { not: 'cancelled' },
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async listByPatient(patientId: string, from?: Date, to?: Date) {
    return this.prisma.therapySession.findMany({
      where: {
        patientId,
        ...(from ? { scheduledStart: { gte: from } } : {}),
        ...(to ? { scheduledEnd: { lte: to } } : {}),
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }
}
