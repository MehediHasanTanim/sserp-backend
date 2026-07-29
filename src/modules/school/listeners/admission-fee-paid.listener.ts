import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotificationPort } from '../../../shared/ports/notification.port';
import { EventNames } from '../../../shared/events/event-names';

interface AdmissionFeePaidEvent {
  studentId: string;
  admissionFeeId: string;
  amount: number;
  receiptNumber?: string;
}

interface AdmissionFeeWaivedEvent {
  studentId: string;
  admissionFeeId: string;
  amount: number;
  reason: string;
}

/**
 * Reacts to `admission_fee.paid` / `admission_fee.waived`. Student
 * activation and the ledger posting already happen synchronously inside
 * `AdmissionFeeService`; this listener only handles guardian notification.
 */
@Injectable()
export class AdmissionFeePaidListener {
  private readonly logger = new Logger(AdmissionFeePaidListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationPort,
  ) {}

  private async notifyGuardians(
    studentId: string,
    title: string,
    body: string,
  ) {
    const guardians = await this.prisma.studentGuardian.findMany({
      where: { studentId, portalAccessEnabled: true },
    });
    if (!guardians.length) return;
    const users = await this.prisma.user.findMany({
      where: { guardianId: { in: guardians.map((g) => g.id) } },
    });
    for (const user of users) {
      await this.notifications.notify({
        userId: user.id,
        type: 'admission_fee',
        title,
        body,
        entityType: 'student',
        entityId: studentId,
      });
    }
  }

  @OnEvent(EventNames.ADMISSION_FEE_PAID)
  async onPaid(event: AdmissionFeePaidEvent) {
    await this.notifyGuardians(
      event.studentId,
      'Admission fee received',
      `Payment of ${event.amount} received. Receipt: ${event.receiptNumber ?? 'N/A'}.`,
    );
  }

  @OnEvent(EventNames.ADMISSION_FEE_WAIVED)
  async onWaived(event: AdmissionFeeWaivedEvent) {
    await this.notifyGuardians(
      event.studentId,
      'Admission fee waived',
      `The admission fee of ${event.amount} was waived: ${event.reason}.`,
    );
    this.logger.log(`Admission fee waived for student ${event.studentId}`);
  }
}
