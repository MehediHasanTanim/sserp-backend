import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionMode, TherapyType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';

export interface RecordPaymentDto {
  invoiceId: string;
  amount: number;
  method: 'cash' | 'bank_transfer' | 'cheque' | 'online';
  reference?: string;
  paymentDate: Date;
  receivedBy: string;
}

export interface ApplyDiscountDto {
  patientId: string;
  invoiceId?: string;
  groupId?: string;
  discountType: 'percentage' | 'fixed';
  value: number;
  reason: string;
  approvedBy: string;
}

@Injectable()
export class TherapyBillingService {
  private readonly logger = new Logger(TherapyBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: NumberingService,
    private readonly ledger: LedgerPort,
    private readonly events: EventEmitter2,
  ) {}

  /** Resolve fee: group-specific > mode+type+duration > mode+type */
  private async resolveFee(
    therapyType: TherapyType,
    sessionMode: SessionMode,
    durationMinutes: number,
    groupId?: string | null,
  ): Promise<number> {
    const now = new Date();

    if (groupId) {
      const groupFee = await this.prisma.therapyFeeStructure.findFirst({
        where: {
          groupId,
          therapyType,
          sessionMode,
          durationMinutes,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (groupFee) return groupFee.amount;
    }

    const specificFee = await this.prisma.therapyFeeStructure.findFirst({
      where: {
        groupId: null,
        therapyType,
        sessionMode,
        durationMinutes,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (specificFee) return specificFee.amount;

    const fallbackFee = await this.prisma.therapyFeeStructure.findFirst({
      where: {
        groupId: null,
        therapyType,
        sessionMode,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (fallbackFee) return fallbackFee.amount;

    return 0;
  }

  async generatePerSessionInvoice(sessionId: string, createdBy: string) {
    const session = await this.prisma.therapySession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw DomainException.notFound('Session not found');
    if (session.status !== 'completed') throw DomainException.validation('Session must be completed to generate invoice');

    if (!session.patientId) {
      throw DomainException.validation('Session has no associated patient for billing');
    }

    // Check for existing invoice on this session
    const existingLine = await this.prisma.therapyInvoiceLine.findFirst({
      where: { sessionId },
    });
    if (existingLine) throw DomainException.conflict('Invoice already generated for this session');

    const amount = await this.resolveFee(
      session.therapyType,
      session.sessionMode,
      session.durationMinutesActual ?? session.durationMinutesPlanned,
      session.groupId,
    );

    const invoiceNumber = await this.numberingService.nextCode('therapy_invoice');

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.therapyInvoice.create({
        data: {
          invoiceNumber,
          patientId: session.patientId!,
          sessionMode: session.sessionMode,
          groupId: session.groupId,
          billingType: 'per_session',
          grossAmount: amount,
          netAmount: amount,
          outstandingAmount: amount,
          status: 'issued',
          createdBy,
        },
      });

      await tx.therapyInvoiceLine.create({
        data: {
          invoiceId: inv.id,
          sessionId,
          description: `${session.therapyType} session - ${session.scheduledStart.toISOString().split('T')[0]}`,
          amount,
          netAmount: amount,
        },
      });

      return inv;
    });

    await this.ledger.post({
      referenceType: 'therapy_invoice',
      referenceId: invoice.id,
      amount,
      description: `Therapy invoice ${invoiceNumber}`,
      costCenter: 'therapy',
      debitAccountCode: '1200',
      creditAccountCode: '4100',
      postingDate: new Date(),
      payload: { patientId: session.patientId! },
    });

    this.events.emit(EventNames.THERAPY_INVOICE_GENERATED, {
      invoiceId: invoice.id,
      patientId: session.patientId,
      sessionId,
      createdBy,
    });

    return invoice;
  }

  async generateMonthlyConsolidated(patientId: string, month: number, year: number, createdBy: string) {
    // Get all completed sessions in the period without existing invoice lines
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    const sessions = await this.prisma.therapySession.findMany({
      where: {
        patientId,
        status: 'completed',
        scheduledStart: { gte: periodStart, lt: periodEnd },
        invoiceLines: { none: {} },
      },
    });

    if (!sessions.length) return null;

    const invoiceNumber = await this.numberingService.nextCode('therapy_invoice');

    const lines = await Promise.all(
      sessions.map(async (s) => ({
        session: s,
        amount: await this.resolveFee(s.therapyType, s.sessionMode, s.durationMinutesActual ?? s.durationMinutesPlanned, s.groupId),
      })),
    );

    const grossAmount = lines.reduce((sum, l) => sum + l.amount, 0);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.therapyInvoice.create({
        data: {
          invoiceNumber,
          patientId,
          sessionMode: 'individual',
          billingType: 'monthly_consolidated',
          periodMonth: month,
          periodYear: year,
          grossAmount,
          netAmount: grossAmount,
          outstandingAmount: grossAmount,
          status: 'issued',
          createdBy,
        },
      });

      await tx.therapyInvoiceLine.createMany({
        data: lines.map((l) => ({
          invoiceId: inv.id,
          sessionId: l.session.id,
          description: `${l.session.therapyType} session - ${l.session.scheduledStart.toISOString().split('T')[0]}`,
          amount: l.amount,
          netAmount: l.amount,
        })),
      });

      return inv;
    });

    this.events.emit(EventNames.THERAPY_INVOICE_GENERATED, {
      invoiceId: invoice.id,
      patientId,
      month,
      year,
      createdBy,
    });

    return invoice;
  }

  async recordPayment(dto: RecordPaymentDto, createdBy: string) {
    const invoice = await this.prisma.therapyInvoice.findUnique({
      where: { id: dto.invoiceId },
    });
    if (!invoice) throw DomainException.notFound('Invoice not found');
    if (invoice.status === 'cancelled') throw DomainException.conflict('Invoice is cancelled');

    if (dto.amount > invoice.outstandingAmount) {
      throw new DomainException(ErrorCode.OVERPAYMENT, 422, 'Payment exceeds outstanding amount');
    }

    const receiptNumber = await this.numberingService.nextCode('therapy_receipt');

    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.therapyPayment.create({
        data: {
          receiptNumber,
          invoiceId: dto.invoiceId,
          patientId: invoice.patientId,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          paymentDate: dto.paymentDate,
          receivedBy: dto.receivedBy,
          status: 'recorded',
        },
      });

      const newPaid = invoice.paidAmount + dto.amount;
      const newOutstanding = invoice.outstandingAmount - dto.amount;
      const newStatus = newOutstanding <= 0 ? 'paid' : 'partially_paid';

      await tx.therapyInvoice.update({
        where: { id: dto.invoiceId },
        data: {
          paidAmount: newPaid,
          outstandingAmount: newOutstanding,
          status: newStatus,
        },
      });

      return p;
    });

    await this.ledger.post({
      referenceType: 'therapy_payment',
      referenceId: payment.id,
      amount: dto.amount,
      description: `Therapy payment receipt ${receiptNumber}`,
      costCenter: 'therapy',
      debitAccountCode: '1000',
      creditAccountCode: '1200',
      postingDate: new Date(),
      payload: { patientId: invoice.patientId },
    });

    this.events.emit(EventNames.THERAPY_PAYMENT_RECEIVED, {
      paymentId: payment.id,
      invoiceId: dto.invoiceId,
      amount: dto.amount,
      receivedBy: dto.receivedBy,
    });

    return payment;
  }

  async reversePayment(paymentId: string, reversedBy: string) {
    const payment = await this.prisma.therapyPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw DomainException.notFound('Payment not found');
    if (payment.status === 'reversed') throw DomainException.conflict('Payment already reversed');

    await this.prisma.$transaction(async (tx) => {
      await tx.therapyPayment.update({
        where: { id: paymentId },
        data: { status: 'reversed' },
      });

      const invoice = await tx.therapyInvoice.findUnique({
        where: { id: payment.invoiceId },
      });
      if (!invoice) return;

      const newPaid = invoice.paidAmount - payment.amount;
      const newOutstanding = invoice.outstandingAmount + payment.amount;

      await tx.therapyInvoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidAmount: newPaid,
          outstandingAmount: newOutstanding,
          status: newPaid > 0 ? 'partially_paid' : 'issued',
        },
      });
    });

    this.events.emit(EventNames.THERAPY_PAYMENT_REVERSED, { paymentId, reversedBy });
  }

  async applyDiscount(dto: ApplyDiscountDto) {
    if (dto.invoiceId) {
      const invoice = await this.prisma.therapyInvoice.findUnique({
        where: { id: dto.invoiceId },
      });
      if (!invoice) throw DomainException.notFound('Invoice not found');

      const discountAmount =
        dto.discountType === 'percentage'
          ? Math.round(invoice.grossAmount * (dto.value / 100))
          : dto.value;

      const newNet = invoice.grossAmount - invoice.discountAmount - discountAmount;

      await this.prisma.$transaction(async (tx) => {
        await tx.therapyDiscount.create({
          data: {
            patientId: dto.patientId,
            invoiceId: dto.invoiceId,
            groupId: dto.groupId,
            discountType: dto.discountType,
            value: dto.value,
            reason: dto.reason,
            approvedBy: dto.approvedBy,
            approvedAt: new Date(),
          },
        });

        await tx.therapyInvoice.update({
          where: { id: dto.invoiceId },
          data: {
            discountAmount: invoice.discountAmount + discountAmount,
            netAmount: newNet,
            outstandingAmount: Math.max(0, newNet - invoice.paidAmount),
          },
        });
      });
    }
  }
}
