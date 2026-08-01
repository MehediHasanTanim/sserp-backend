import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationPort } from '../../../shared/ports/notification.port';

@Injectable()
export class PayrollReminderJob {
  private readonly logger = new Logger(PayrollReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPort,
  ) {}

  /** Daily check: remind 3 days before each group's pay day. */
  @Cron('0 9 * * *')
  async handle() {
    const groups = await this.prisma.payrollGroup.findMany({
      where: { isActive: true },
    });
    const now = new Date();
    for (const g of groups) {
      const daysUntil = g.payDayOfMonth - now.getUTCDate();
      if (daysUntil !== 3) continue;
      this.logger.log(`Payroll reminder for group ${g.name}`);
      const hrUsers = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          roles: { some: { role: { name: 'hr_officer' } } },
        },
        take: 20,
      });
      for (const user of hrUsers) {
        await this.notifications.notify({
          userId: user.id,
          type: 'payroll_reminder',
          title: 'Payroll run due soon',
          body: `Payroll group "${g.name}" pay day is in 3 days`,
          entityType: 'payroll_group',
          entityId: g.id,
        });
      }
    }
  }
}
