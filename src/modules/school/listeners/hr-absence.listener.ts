import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventNames } from '../../../shared/events/event-names';
import {
  AbsenceTriggerEvent,
  AttendanceCorrectedTriggerEvent,
  LeaveApprovedTriggerEvent,
  LeaveCancelledTriggerEvent,
  SubstituteService,
} from '../services/substitute.service';

/**
 * Consumes `hr.attendance.absent`, `hr.leave.approved`, `hr.leave.cancelled`,
 * and `hr.attendance.corrected` to drive the substitute workflow (B-01–B-09).
 */
@Injectable()
export class HrAbsenceListener {
  private readonly logger = new Logger(HrAbsenceListener.name);

  constructor(private readonly substitutes: SubstituteService) {}

  @OnEvent(EventNames.HR_ATTENDANCE_ABSENT)
  async onAttendanceAbsent(event: AbsenceTriggerEvent) {
    const result = await this.substitutes.createForAbsence(event);
    this.logger.log(
      `Created ${result.created} pending substitute row(s) for absence ${event.id}`,
    );
  }

  @OnEvent(EventNames.HR_LEAVE_APPROVED)
  async onLeaveApproved(event: LeaveApprovedTriggerEvent) {
    const result = await this.substitutes.createForLeaveApproved(event);
    this.logger.log(
      `Created ${result.created} pending substitute row(s) for leave ${event.leaveRequestId}`,
    );
  }

  @OnEvent(EventNames.HR_LEAVE_CANCELLED)
  async onLeaveCancelled(event: LeaveCancelledTriggerEvent) {
    await this.substitutes.cancelForLeaveCancelled(event);
  }

  @OnEvent(EventNames.HR_ATTENDANCE_CORRECTED)
  async onAttendanceCorrected(event: AttendanceCorrectedTriggerEvent) {
    await this.substitutes.cancelForAttendanceCorrected(event);
  }
}
