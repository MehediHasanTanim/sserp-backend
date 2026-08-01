import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import {
  RecordPaymentDto,
  ReversePaymentDto,
  WaiveInvoiceDto,
} from '../dto/fee-invoice.dto';

const COST_CENTER = 'school';
const ACCOUNT_AR_STUDENTS = '1200';
const ACCOUNT_CASH = '1010';
const ACCOUNT_BANK = '1020';
const ACCOUNT_WAIVER_EXPENSE = '5090';
const REVERSAL_ROLES = ['accountant', 'principal', 'super_admin'];
const WAIVER_ROLES = ['principal', 'super_admin'];

function cashOrBankAccount(method: string): string {
  return method === 'cash' ? ACCOUNT_CASH : ACCOUNT_BANK;
}

function statusForBalance(
  netAmount: number,
  paidAmount: number,
  waivedAmount: number,
  outstandingAmount: number,
): 'issued' | 'partially_paid' | 'paid' | 'waived' {
  if (outstandingAmount <= 0) {
    return waivedAmount >= netAmount && paidAmount === 0 ? 'waived' : 'paid';
  }
  return paidAmount > 0 || waivedAmount > 0 ? 'partially_paid' : 'issued';
}

/**
 * Fee payment recording, reversal, and waiver.
 * Rules F-05 through F-11 — docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class FeePaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
    private readonly ledger: LedgerPort,
  ) {}

  /** F-05/F-06/F-07/F-08/F-11: partial payments allowed, overpayment rejected. */
  async pay(invoiceId: string, input: RecordPaymentDto, actorId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.feeInvoice.findUnique({
        where: { id: invoiceId },
      });
      if (!invoice) throw DomainException.notFound('Invoice not found');
      if (invoice.status === 'cancelled' || invoice.status === 'waived') {
        throw DomainException.conflict(
          `Cannot record a payment on a ${invoice.status} invoice`,
        );
      }
      if (input.amount > invoice.outstandingAmount) {
        throw DomainException.withCode(
          ErrorCode.OVERPAYMENT,
          422,
          `Payment of ${input.amount} exceeds outstanding balance of ${invoice.outstandingAmount}`,
        );
      }

      const receiptNumber = await this.numbering.nextCode('receipt', tx);
      const paymentDate = input.paymentDate
        ? new Date(input.paymentDate)
        : new Date();

      const payment = await tx.feePayment.create({
        data: {
          receiptNumber,
          invoiceId,
          studentId: invoice.studentId,
          amount: input.amount,
          method: input.method,
          reference: input.reference,
          paymentDate,
          receivedBy: actorId,
          attachmentId: input.attachmentId,
          status: 'recorded',
        },
      });

      const paidAmount = invoice.paidAmount + input.amount;
      const outstandingAmount = invoice.outstandingAmount - input.amount;
      const status = statusForBalance(
        invoice.netAmount,
        paidAmount,
        invoice.waivedAmount,
        outstandingAmount,
      );

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: { paidAmount, outstandingAmount, status },
      });

      return { payment, invoice: updatedInvoice };
    });

    await this.ledger.post({
      referenceType: 'fee_payment',
      referenceId: result.payment.id,
      amount: result.payment.amount,
      costCenter: COST_CENTER,
      description: `Fee payment ${result.payment.receiptNumber} (${result.payment.method})`,
      debitAccountCode: cashOrBankAccount(result.payment.method),
      creditAccountCode: ACCOUNT_AR_STUDENTS,
      postingDate: result.payment.paymentDate,
      payload: {
        paymentMethod: result.payment.method,
        variant: result.payment.method,
      },
    });

    await this.events.emitAsync(EventNames.FEE_PAYMENT_RECEIVED, {
      invoiceId,
      studentId: result.invoice.studentId,
      paymentId: result.payment.id,
      amount: result.payment.amount,
      receiptNumber: result.payment.receiptNumber,
    });

    return result.payment;
  }

  /** F-09: requires principal or accountant and a reason; never deletes the row. */
  async reverse(
    paymentId: string,
    input: ReversePaymentDto,
    actorId: string,
    actorRoles: string[],
  ) {
    if (!actorRoles.some((r) => REVERSAL_ROLES.includes(r))) {
      throw DomainException.forbidden(
        'Only an accountant or principal may reverse a payment',
      );
    }
    if (!input.reason || !input.reason.trim()) {
      throw DomainException.validation('A reversal reason is required');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.feePayment.findUnique({
        where: { id: paymentId },
      });
      if (!payment) throw DomainException.notFound('Payment not found');
      if (payment.status === 'reversed') {
        throw DomainException.conflict('Payment is already reversed');
      }

      const invoice = await tx.feeInvoice.findUnique({
        where: { id: payment.invoiceId },
      });
      if (!invoice) throw DomainException.notFound('Invoice not found');

      const updatedPayment = await tx.feePayment.update({
        where: { id: paymentId },
        data: { status: 'reversed', reversalReason: input.reason },
      });

      const paidAmount = invoice.paidAmount - payment.amount;
      const outstandingAmount = invoice.outstandingAmount + payment.amount;
      const status = statusForBalance(
        invoice.netAmount,
        paidAmount,
        invoice.waivedAmount,
        outstandingAmount,
      );

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount, outstandingAmount, status },
      });

      return { payment: updatedPayment, invoice: updatedInvoice };
    });

    await this.ledger.post({
      referenceType: 'fee_payment_reversal',
      referenceId: result.payment.id,
      amount: result.payment.amount,
      costCenter: COST_CENTER,
      description: `Reversal of payment ${result.payment.receiptNumber}: ${input.reason}`,
      debitAccountCode: ACCOUNT_AR_STUDENTS,
      creditAccountCode: cashOrBankAccount(result.payment.method),
      postingDate: new Date(),
    });

    await this.events.emitAsync(EventNames.FEE_PAYMENT_REVERSED, {
      paymentId: result.payment.id,
      invoiceId: result.invoice.id,
      studentId: result.invoice.studentId,
      amount: result.payment.amount,
      reason: input.reason,
      actorId,
    });

    return result.payment;
  }

  /** F-10: requires principal and a reason; reduces outstanding, posts a waiver expense. */
  async waive(
    invoiceId: string,
    input: WaiveInvoiceDto,
    actorId: string,
    actorRoles: string[],
  ) {
    if (!actorRoles.some((r) => WAIVER_ROLES.includes(r))) {
      throw DomainException.forbidden('Only a principal may waive an invoice');
    }
    if (!input.reason || !input.reason.trim()) {
      throw DomainException.validation('A waiver reason is required');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.feeInvoice.findUnique({
        where: { id: invoiceId },
      });
      if (!invoice) throw DomainException.notFound('Invoice not found');
      if (invoice.status === 'cancelled') {
        throw DomainException.conflict('Cannot waive a cancelled invoice');
      }
      if (input.amount > invoice.outstandingAmount) {
        throw DomainException.validation(
          `Waiver amount ${input.amount} exceeds outstanding balance ${invoice.outstandingAmount}`,
        );
      }

      const waiver = await tx.feeWaiver.create({
        data: {
          invoiceId,
          amount: input.amount,
          reason: input.reason,
          requestedBy: actorId,
          approvedBy: actorId,
          approvedAt: new Date(),
          status: 'approved',
        },
      });

      const waivedAmount = invoice.waivedAmount + input.amount;
      const outstandingAmount = invoice.outstandingAmount - input.amount;
      const status = statusForBalance(
        invoice.netAmount,
        invoice.paidAmount,
        waivedAmount,
        outstandingAmount,
      );

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: { waivedAmount, outstandingAmount, status },
      });

      return { waiver, invoice: updatedInvoice };
    });

    await this.ledger.post({
      referenceType: 'fee_waiver',
      referenceId: result.waiver.id,
      amount: result.waiver.amount,
      costCenter: COST_CENTER,
      description: `Fee waiver: ${input.reason}`,
      debitAccountCode: ACCOUNT_WAIVER_EXPENSE,
      creditAccountCode: ACCOUNT_AR_STUDENTS,
      postingDate: new Date(),
    });

    await this.events.emitAsync(EventNames.FEE_INVOICE_WAIVED, {
      invoiceId,
      studentId: result.invoice.studentId,
      amount: result.waiver.amount,
      reason: input.reason,
      actorId,
    });

    return result.waiver;
  }

  async receipt(paymentId: string) {
    const payment = await this.prisma.feePayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw DomainException.notFound('Payment not found');
    return payment;
  }
}
