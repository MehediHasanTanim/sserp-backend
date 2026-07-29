import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubstituteService } from '../services/substitute.service';
import { SchoolAttendanceService } from '../services/school-attendance.service';

/**
 * Cron jobs for the `school-ops` queue (docs/plan/backend/02-phase1-hr-school-core.md §8).
 */
@Injectable()
export class SchoolOpsJobs {
  private readonly logger = new Logger(SchoolOpsJobs.name);

  constructor(
    private readonly substitutes: SubstituteService,
    private readonly attendance: SchoolAttendanceService,
  ) {}

  @Cron('15 0 * * *') // Daily 00:15
  async substituteAutoRevert() {
    const result = await this.substitutes.autoRevertElapsed();
    this.logger.log(
      `substitute-auto-revert reverted ${result.count} assignment(s)`,
    );
  }

  @Cron('0 6 * * *') // Daily 06:00
  async substituteUnassignedAlert() {
    const result = await this.substitutes.emitUnassignedAlerts();
    this.logger.log(
      `substitute-unassigned-alert notified ${result.alerted} group(s)`,
    );
  }

  @Cron('0 11 * * *') // Daily 11:00
  async unauthorizedAbsenceAlert() {
    const result = await this.attendance.unauthorizedAbsenceAlert();
    this.logger.log(
      `unauthorized-absence-alert notified ${result.alerted} student(s)`,
    );
  }
}
