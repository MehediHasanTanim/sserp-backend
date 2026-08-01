import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApPartyType, ApSourceType, InvoiceMatchStatus } from '@prisma/client';
import {
  NumberingService,
  OrganizationService,
} from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import {
  ThreeWayMatchService,
  MatchLineInput,
} from './three-way-match.service';

const INVOICE_INCLUDE = {
  lines: {
    include: {
      purchaseOrderLine: true,
      grnLine: true,
    },
  },
  vendor: true,
  purchaseOrder: true,
};

export interface VendorInvoiceLineInput {
  poLineId?: string;
  grnLineId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxId?: string;
}

@Injectable()
export class VendorInvoiceService {
  private readonly matcher = new ThreeWayMatchService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly org: OrganizationService,
    private readonly ledger: LedgerPort,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { vendorId?: string; status?: string }) {
    return this.prisma.vendorInvoice.findMany({
      where: {
        vendorId: filters?.vendorId,
        status: filters?.status as never,
      },
      include: INVOICE_INCLUDE,
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.vendorInvoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE,
    });
    if (!row) throw DomainException.notFound('Vendor invoice not found');
    return row;
  }

  private lineTotal(qty: number, unitPrice: number) {
    return Math.round(qty * unitPrice);
  }

  async create(input: {
    vendorId: string;
    vendorInvoiceReference?: string;
    poId?: string;
    grnIds?: string[];
    invoiceDate: string;
    dueDate: string;
    taxAmount?: number;
    attachmentId?: string;
    lines: VendorInvoiceLineInput[];
  }) {
    const invoiceNumber = await this.numbering.nextCode('vendor_invoice');
    const subtotal = input.lines.reduce(
      (s, l) => s + this.lineTotal(l.quantity, l.unitPrice),
      0,
    );
    const tax = input.taxAmount ?? 0;
    return this.prisma.vendorInvoice.create({
      data: {
        invoiceNumber,
        vendorInvoiceReference: input.vendorInvoiceReference,
        vendorId: input.vendorId,
        poId: input.poId,
        grnIds: input.grnIds ?? [],
        invoiceDate: new Date(input.invoiceDate),
        dueDate: new Date(input.dueDate),
        subtotalAmount: subtotal,
        taxAmount: tax,
        totalAmount: subtotal + tax,
        status: 'draft',
        lines: {
          create: input.lines.map((l) => ({
            poLineId: l.poLineId,
            grnLineId: l.grnLineId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxId: l.taxId,
            lineTotal: this.lineTotal(l.quantity, l.unitPrice),
          })),
        },
      },
      include: INVOICE_INCLUDE,
    });
  }

  async runMatch(id: string) {
    const invoice = await this.findById(id);
    const org = await this.org.getFull();
    const matchLines: MatchLineInput[] = [];

    for (const line of invoice.lines) {
      const poLine = line.purchaseOrderLine;
      const grnLine = line.grnLine;
      matchLines.push({
        poUnitPrice: poLine?.unitPrice ?? line.unitPrice,
        acceptedQuantity: grnLine
          ? Number(grnLine.acceptedQuantity)
          : poLine
            ? Number(poLine.receivedQuantity)
            : 0,
        invoicedQuantity: Number(line.quantity),
        invoicedUnitPrice: line.unitPrice,
      });
    }

    const result = this.matcher.match(
      matchLines,
      org.invoiceVarianceTolerancePercent,
    );

    const matchStatus = result.matchStatus as InvoiceMatchStatus;
    await this.prisma.vendorInvoice.update({
      where: { id },
      data: {
        matchedAmount: result.matchedAmount,
        varianceAmount: result.varianceAmount,
        matchStatus,
        status:
          invoice.status === 'draft' ? 'pending_approval' : invoice.status,
      },
    });

    return { ...result, invoiceId: id };
  }

  async approve(
    id: string,
    actorId: string,
    input?: { principalOverrideReason?: string },
  ) {
    const invoice = await this.findById(id);
    if (invoice.status === 'approved') {
      throw DomainException.conflict('Invoice is already approved');
    }

    const match = await this.runMatch(id);
    if (match.blocked) {
      const code =
        match.blockReason === 'EXCEEDS_ACCEPTED_QUANTITY'
          ? ErrorCode.EXCEEDS_ACCEPTED_QUANTITY
          : ErrorCode.INVOICE_VARIANCE_EXCEEDED;
      if (!input?.principalOverrideReason) {
        throw DomainException.withCode(
          code,
          422,
          match.blockReason ?? 'Invoice match failed',
        );
      }
    }

    const costCenter = 'admin';

    return this.prisma.$transaction(async (tx) => {
      const posted = await this.ledger.post(
        {
          referenceType: 'vendor_invoice',
          referenceId: id,
          amount: invoice.totalAmount,
          costCenter,
          description: `Vendor invoice ${invoice.invoiceNumber}`,
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: invoice.invoiceDate,
        },
        tx,
      );

      await tx.apLedger.create({
        data: {
          partyType: ApPartyType.vendor,
          partyId: invoice.vendorId,
          sourceType: ApSourceType.vendor_invoice,
          sourceId: id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          grossAmount: invoice.totalAmount,
          settledAmount: 0,
          outstandingAmount: invoice.totalAmount,
          status: 'open',
          costCenter,
        },
      });

      for (const line of invoice.lines) {
        if (line.poLineId) {
          await tx.purchaseOrderLine.update({
            where: { id: line.poLineId },
            data: {
              invoicedQuantity: { increment: Number(line.quantity) },
            },
          });
        }
      }

      const updated = await tx.vendorInvoice.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: actorId,
          approvedAt: new Date(),
          journalId: posted.journalId,
        },
        include: INVOICE_INCLUDE,
      });

      this.events.emit(EventNames.PROCUREMENT_INVOICE_APPROVED, {
        invoiceId: id,
        vendorId: invoice.vendorId,
        amount: invoice.totalAmount,
      });

      return updated;
    });
  }

  async reject(id: string, actorId: string, reason: string) {
    if (!reason?.trim()) {
      throw DomainException.validation('Rejection reason is required');
    }
    const invoice = await this.findById(id);
    if (invoice.status === 'approved') {
      throw DomainException.conflict('Approved invoices cannot be rejected');
    }
    return this.prisma.vendorInvoice.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason: reason,
        approvedBy: actorId,
        approvedAt: new Date(),
      },
      include: INVOICE_INCLUDE,
    });
  }
}
