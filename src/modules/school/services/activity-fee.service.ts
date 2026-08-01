import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { EventNames } from '../../../shared/events/event-names';
import { notifyGuardiansForStudent } from './guardian-notify.util';
import { NotificationPort } from '../../../shared/ports/notification.port';

const COST_CENTER = 'school';
const ACCOUNT_AR_STUDENTS = '1200';
const ACCOUNT_ACTIVITY_INCOME = '4005';
const ACTIVITY_FEE_HEAD_CODE = 'ACTIVITY';

/**
 * O-05/O-06: generates the single activity invoice for a confirmed
 * enrollment, reusing the fee engine's numbering and ledger posting
 * conventions. Triggered by `ActivityFeeListener` on `activity.optin.confirmed`.
 * docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class ActivityFeeService {
  private readonly logger = new Logger(ActivityFeeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
    private readonly ledger: LedgerPort,
    private readonly notifications: NotificationPort,
  ) {}

  /** O-05: exactly one invoice per confirmation; a no-op if one already exists or the fee is zero. */
  async generateForEnrollment(activityId: string, studentId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.activityEnrollment.findUnique({
        where: { activityId_studentId: { activityId, studentId } },
      });
      if (!enrollment || enrollment.enrollmentState !== 'confirmed') {
        return null;
      }
      if (enrollment.invoiceId) {
        return null;
      }

      const activity = await tx.outdoorActivity.findUnique({
        where: { id: activityId },
        include: { activityType: true },
      });
      if (!activity) return null;

      const feeAmount =
        activity.feeAmount > 0
          ? activity.feeAmount
          : activity.activityType.defaultFeeAmount;
      if (feeAmount <= 0) return null;

      const student = await tx.student.findUnique({ where: { id: studentId } });
      if (!student) return null;

      const academicYear =
        (student.academicYearId
          ? await tx.academicYear.findUnique({
              where: { id: student.academicYearId },
            })
          : null) ??
        (await tx.academicYear.findFirst({ where: { isCurrent: true } }));
      if (!academicYear) return null;

      const feeHead = await tx.feeHead.findUnique({
        where: { code: ACTIVITY_FEE_HEAD_CODE },
      });
      if (!feeHead) {
        this.logger.warn(
          `No '${ACTIVITY_FEE_HEAD_CODE}' fee head configured; skipping activity invoice generation`,
        );
        return null;
      }

      const invoiceNumber = await this.numbering.nextCode('invoice', tx);
      const today = new Date();
      const invoice = await tx.feeInvoice.create({
        data: {
          invoiceNumber,
          studentId,
          academicYearId: academicYear.id,
          invoiceType: 'activity',
          activityId,
          issueDate: today,
          dueDate: activity.activityDate,
          grossAmount: feeAmount,
          discountAmount: 0,
          waivedAmount: 0,
          netAmount: feeAmount,
          paidAmount: 0,
          outstandingAmount: feeAmount,
          status: 'issued',
        },
      });
      await tx.feeInvoiceLine.create({
        data: {
          invoiceId: invoice.id,
          feeHeadId: feeHead.id,
          description: `Activity fee: ${activity.name}`,
          amount: feeAmount,
          discountAmount: 0,
          netAmount: feeAmount,
        },
      });
      await tx.activityEnrollment.update({
        where: { id: enrollment.id },
        data: { invoiceId: invoice.id },
      });

      return invoice;
    });

    if (!result) return null;

    await this.ledger.post({
      referenceType: 'fee_invoice',
      referenceId: result.id,
      amount: result.netAmount,
      costCenter: COST_CENTER,
      description: `Activity invoice ${result.invoiceNumber}`,
      debitAccountCode: ACCOUNT_AR_STUDENTS,
      creditAccountCode: ACCOUNT_ACTIVITY_INCOME,
      postingDate: result.issueDate,
    });

    await this.events.emitAsync(EventNames.FEE_INVOICE_GENERATED, {
      studentId,
      invoiceId: result.id,
      amount: result.netAmount,
      invoiceType: 'activity',
    });

    await notifyGuardiansForStudent(
      this.prisma,
      this.notifications,
      studentId,
      {
        type: 'activity_fee_invoice',
        title: 'Activity fee invoice issued',
        body: `Invoice ${result.invoiceNumber} for ${result.netAmount} has been issued for an upcoming activity.`,
      },
    );

    return result;
  }
}
