import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentMethod, VendorAdvanceStatus } from '@prisma/client';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { VendorService } from './vendor.service';

export interface PaymentAllocationInput {
  vendorInvoiceId: string;
  allocatedAmount: number;
}

@Injectable()
export class VendorPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly ledger: LedgerPort,
    private readonly vendors: VendorService,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { vendorId?: string; status?: string }) {
    return this.prisma.vendorPayment.findMany({
      where: {
        vendorId: filters?.vendorId,
        status: filters?.status as never,
      },
      include: { allocations: { include: { vendorInvoice: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.vendorPayment.findUnique({
      where: { id },
      include: { allocations: { include: { vendorInvoice: true } } },
    });
    if (!row) throw DomainException.notFound('Vendor payment not found');
    return row;
  }

  async createScheduled(
    input: {
      vendorId: string;
      amount: number;
      method: PaymentMethod;
      scheduledDate: string;
      reference?: string;
      bankAccountId?: string;
    },
    actorId: string,
    actorRoles: string[],
    blacklistOverrideReason?: string,
  ) {
    const vendor = await this.vendors.findById(input.vendorId);
    if (vendor.status === 'blacklisted') {
      const isPrincipal =
        actorRoles.includes('principal') || actorRoles.includes('super_admin');
      if (!isPrincipal || !blacklistOverrideReason?.trim()) {
        throw DomainException.withCode(
          ErrorCode.VENDOR_BLACKLISTED,
          422,
          'Payment to blacklisted vendor requires principal override with reason',
        );
      }
    }

    const paymentNumber = await this.numbering.nextCode('vendor_payment');
    return this.prisma.vendorPayment.create({
      data: {
        paymentNumber,
        vendorId: input.vendorId,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        bankAccountId: input.bankAccountId,
        scheduledDate: new Date(input.scheduledDate),
        status: 'scheduled',
        paidBy: actorId,
      },
    });
  }

  async pay(
    id: string,
    actorId: string,
    allocations: PaymentAllocationInput[],
    actorRoles: string[],
    blacklistOverrideReason?: string,
  ) {
    const payment = await this.findById(id);
    if (payment.status === 'paid') {
      throw DomainException.conflict('Payment is already paid');
    }

    const vendor = await this.vendors.findById(payment.vendorId);
    if (vendor.status === 'blacklisted') {
      const isPrincipal =
        actorRoles.includes('principal') || actorRoles.includes('super_admin');
      if (!isPrincipal || !blacklistOverrideReason?.trim()) {
        throw DomainException.withCode(
          ErrorCode.VENDOR_BLACKLISTED,
          422,
          'Payment to blacklisted vendor requires principal override with reason',
        );
      }
    }

    const allocSum = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
    if (allocSum !== payment.amount) {
      throw DomainException.withCode(
        ErrorCode.ALLOCATION_MISMATCH,
        422,
        'Sum of allocations must equal payment amount',
      );
    }

    for (const alloc of allocations) {
      const invoice = await this.prisma.vendorInvoice.findUnique({
        where: { id: alloc.vendorInvoiceId },
      });
      if (!invoice) {
        throw DomainException.notFound('Invoice not found for allocation');
      }
      const open =
        invoice.totalAmount -
        (
          await this.prisma.vendorPaymentAllocation.aggregate({
            where: { vendorInvoiceId: invoice.id },
            _sum: { allocatedAmount: true },
          })
        )._sum.allocatedAmount!;
      if (alloc.allocatedAmount > open) {
        throw DomainException.unprocessable(
          'Allocation exceeds invoice outstanding amount',
        );
      }
    }

    const variant = payment.method === 'cash' ? 'cash' : 'bank_transfer';

    return this.prisma.$transaction(async (tx) => {
      const posted = await this.ledger.post(
        {
          referenceType: 'vendor_payment',
          referenceId: id,
          amount: payment.amount,
          costCenter: 'admin',
          description: `Vendor payment ${payment.paymentNumber}`,
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: new Date(),
          payload: { variant, paymentMethod: variant },
        },
        tx,
      );

      await tx.vendorPaymentAllocation.createMany({
        data: allocations.map((a) => ({
          vendorPaymentId: id,
          vendorInvoiceId: a.vendorInvoiceId,
          allocatedAmount: a.allocatedAmount,
        })),
      });

      for (const alloc of allocations) {
        const ap = await tx.apLedger.findFirst({
          where: {
            sourceType: 'vendor_invoice',
            sourceId: alloc.vendorInvoiceId,
          },
        });
        if (ap) {
          const newSettled = ap.settledAmount + alloc.allocatedAmount;
          const outstanding = ap.grossAmount - newSettled;
          await tx.apLedger.update({
            where: { id: ap.id },
            data: {
              settledAmount: newSettled,
              outstandingAmount: outstanding,
              status:
                outstanding <= 0
                  ? 'settled'
                  : newSettled > 0
                    ? 'partially_settled'
                    : 'open',
            },
          });
        }

        const inv = await tx.vendorInvoice.findUniqueOrThrow({
          where: { id: alloc.vendorInvoiceId },
        });
        const paidTotal =
          (
            await tx.vendorPaymentAllocation.aggregate({
              where: { vendorInvoiceId: inv.id },
              _sum: { allocatedAmount: true },
            })
          )._sum.allocatedAmount ?? 0;
        await tx.vendorInvoice.update({
          where: { id: inv.id },
          data: {
            status: paidTotal >= inv.totalAmount ? 'paid' : 'partially_paid',
          },
        });
      }

      const updated = await tx.vendorPayment.update({
        where: { id },
        data: {
          status: 'paid',
          paymentDate: new Date(),
          journalId: posted.journalId,
          paidBy: actorId,
        },
        include: { allocations: true },
      });

      this.events.emit(EventNames.PROCUREMENT_PAYMENT_MADE, {
        paymentId: id,
        vendorId: payment.vendorId,
        amount: payment.amount,
      });

      return updated;
    });
  }

  async paymentHistory(vendorId: string) {
    await this.vendors.findById(vendorId);
    return this.prisma.vendorPayment.findMany({
      where: { vendorId },
      include: { allocations: { include: { vendorInvoice: true } } },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async createAdvance(input: {
    vendorId: string;
    poId?: string;
    amount: number;
    advanceDate: string;
  }) {
    await this.vendors.findById(input.vendorId);
    return this.prisma.$transaction(async (tx) => {
      const advance = await tx.vendorAdvance.create({
        data: {
          vendorId: input.vendorId,
          poId: input.poId,
          amount: input.amount,
          advanceDate: new Date(input.advanceDate),
          status: 'open',
        },
      });
      const posted = await this.ledger.post(
        {
          referenceType: 'vendor_advance',
          referenceId: advance.id,
          amount: input.amount,
          costCenter: 'admin',
          description: 'Vendor advance',
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: new Date(input.advanceDate),
        },
        tx,
      );
      return tx.vendorAdvance.update({
        where: { id: advance.id },
        data: { journalId: posted.journalId },
      });
    });
  }

  listAdvances(vendorId?: string) {
    return this.prisma.vendorAdvance.findMany({
      where: vendorId ? { vendorId } : undefined,
      orderBy: { advanceDate: 'desc' },
    });
  }

  async adjustAdvance(advanceId: string, invoiceId: string, amount: number) {
    const advance = await this.prisma.vendorAdvance.findUnique({
      where: { id: advanceId },
    });
    if (!advance) throw DomainException.notFound('Advance not found');

    const invoice = await this.prisma.vendorInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw DomainException.notFound('Invoice not found');
    if (invoice.vendorId !== advance.vendorId) {
      throw DomainException.validation(
        'Advance and invoice must belong to the same vendor',
      );
    }

    const remaining = advance.amount - advance.adjustedAmount;
    if (amount > remaining) {
      throw DomainException.withCode(
        ErrorCode.EXCEEDS_ADVANCE,
        422,
        'Adjustment exceeds remaining advance balance',
      );
    }

    const newAdjusted = advance.adjustedAmount + amount;
    let status: VendorAdvanceStatus = 'partially_adjusted';
    if (newAdjusted >= advance.amount) status = 'fully_adjusted';

    return this.prisma.vendorAdvance.update({
      where: { id: advanceId },
      data: {
        adjustedAmount: newAdjusted,
        status,
      },
    });
  }
}
