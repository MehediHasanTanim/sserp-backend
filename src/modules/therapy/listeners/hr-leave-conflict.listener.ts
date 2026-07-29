import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';

interface HrLeaveApprovedPayload {
  employeeId: string;
  startDate: Date;
  endDate: Date;
  leaveRequestId: string;
}

/**
 * C-05: When HR leave is approved, flag any therapist sessions that now conflict.
 * Coordinator can force-override (force: true) when rescheduling.
 */
@Injectable()
export class HrLeaveConflictListener {
  private readonly logger = new Logger(HrLeaveConflictListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(EventNames.HR_LEAVE_APPROVED)
  async handleLeaveApproved(payload: HrLeaveApprovedPayload) {
    const therapist = await this.prisma.therapist.findFirst({
      where: { employeeId: payload.employeeId, deletedAt: null },
    });

    if (!therapist) return;

    const conflictingSessions = await this.prisma.therapySession.findMany({
      where: {
        therapistId: therapist.id,
        scheduledStart: { lt: new Date(payload.endDate.getTime() + 86400000) },
        scheduledEnd: { gt: payload.startDate },
        status: { in: ['scheduled', 'in_progress'] },
      },
      select: { id: true, scheduledStart: true, scheduledEnd: true },
    });

    if (!conflictingSessions.length) return;

    this.logger.warn(
      `HR leave approved for therapist ${therapist.id}: ${conflictingSessions.length} session(s) conflict`,
    );

    for (const session of conflictingSessions) {
      this.events.emit(EventNames.HR_LEAVE_CONFLICT_FLAGGED, {
        therapistId: therapist.id,
        sessionId: session.id,
        leaveRequestId: payload.leaveRequestId,
        sessionStart: session.scheduledStart,
        sessionEnd: session.scheduledEnd,
      });
    }
  }
}
