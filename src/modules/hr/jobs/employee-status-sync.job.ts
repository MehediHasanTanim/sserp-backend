import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationPort } from '../../../shared/ports/notification.port';

const PROBATION_LOOKAHEAD_DAYS = 14;

/**
 * Weekly probation-due alert (docs/plan/backend/02-phase1-hr-school-core.md §8).
 * Flags employees whose probation ends within the next 14 days.
 */
@Injectable()
export class EmployeeStatusSyncJob {
  private readonly logger = new Logger(EmployeeStatusSyncJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPort,
  ) {}

  @Cron('0 8 * * 1') // Weekly, Monday 08:00
  async handleProbationDueAlert() {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() + PROBATION_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
    );

    const dueEmployees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: 'on_probation',
        probationEndDate: { not: null, lte: cutoff },
      },
      include: { user: { select: { id: true } } },
    });

    if (!dueEmployees.length) {
      this.logger.log('No employees with upcoming probation end dates');
      return;
    }

    for (const employee of dueEmployees) {
      const message = `Probation for ${employee.fullName} (${employee.employeeCode}) ends on ${employee.probationEndDate?.toISOString().slice(0, 10)}`;
      if (employee.user?.id) {
        await this.notifications.notify({
          userId: employee.user.id,
          type: 'probation_due',
          title: 'Probation period ending soon',
          body: message,
          entityType: 'employee',
          entityId: employee.id,
        });
      } else {
        this.logger.log(`[probation-due] ${message} (no linked user account)`);
      }
    }
  }
}
