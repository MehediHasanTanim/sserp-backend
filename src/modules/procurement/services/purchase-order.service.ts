import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import {
  NumberingService,
  OrganizationService,
} from '../../admin/services/organization.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { VendorService } from './vendor.service';

const PO_INCLUDE = {
  lines: {
    include: {
      item: true,
      purchaseRequestLine: { include: { purchaseRequest: true } },
    },
  },
  vendor: true,
  amendments: { orderBy: { amendedAt: 'desc' as const } },
};

export interface PoLineFromPrInput {
  prLineId: string;
  quantity: number;
  unitPrice: number;
  taxId?: string;
}

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly org: OrganizationService,
    private readonly vendors: VendorService,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { status?: PurchaseOrderStatus; vendorId?: string }) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        status: filters?.status,
        vendorId: filters?.vendorId,
      },
      include: PO_INCLUDE,
      orderBy: { poDate: 'desc' },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: PO_INCLUDE,
    });
    if (!row) throw DomainException.notFound('Purchase order not found');
    return row;
  }

  private lineTotal(qty: number, unitPrice: number) {
    return Math.round(qty * unitPrice);
  }

  async createFromPrLines(
    input: {
      vendorId: string;
      poDate: string;
      expectedDeliveryDate?: string;
      deliveryAddress?: string;
      paymentTerms?: string;
      discountAmount?: number;
      taxAmount?: number;
      lines: PoLineFromPrInput[];
    },
    createdBy: string,
  ) {
    const vendor = await this.vendors.findById(input.vendorId);
    this.vendors.assertAvailable(vendor);

    const org = await this.org.getFull();
    const poNumber = await this.numbering.nextCode('purchase_order');

    return this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      const poLines: Array<{
        prLineId: string;
        itemId: string;
        itemDescription: string;
        quantity: number;
        unitOfMeasureId: string | null;
        unitPrice: number;
        taxId?: string;
        lineTotal: number;
      }> = [];

      for (const line of input.lines) {
        const prLine = await tx.purchaseRequestLine.findUnique({
          where: { id: line.prLineId },
          include: { purchaseRequest: true, item: true },
        });
        if (!prLine) {
          throw DomainException.notFound(`PR line ${line.prLineId} not found`);
        }
        if (prLine.purchaseRequest.status !== 'approved') {
          throw DomainException.withCode(
            ErrorCode.PR_NOT_APPROVED,
            422,
            'Purchase request must be approved',
          );
        }
        if (!prLine.itemId) {
          throw DomainException.withCode(
            ErrorCode.ITEM_REQUIRED,
            422,
            'PR line requires an item before PO issuance',
          );
        }

        const issued = Number(prLine.poIssuedQuantity);
        const requested = Number(prLine.quantity);
        const remaining = requested - issued;
        if (remaining <= 0) {
          throw DomainException.withCode(
            ErrorCode.NO_REMAINING_QUANTITY,
            422,
            'No remaining quantity on PR line',
          );
        }
        if (line.quantity > remaining + 1e-9) {
          throw DomainException.withCode(
            ErrorCode.EXCEEDS_REQUESTED_QUANTITY,
            422,
            'PO quantity exceeds remaining PR quantity',
          );
        }

        const lineTotal = this.lineTotal(line.quantity, line.unitPrice);
        subtotal += lineTotal;
        poLines.push({
          prLineId: line.prLineId,
          itemId: prLine.itemId,
          itemDescription: prLine.itemDescription,
          quantity: line.quantity,
          unitOfMeasureId: prLine.unitOfMeasureId,
          unitPrice: line.unitPrice,
          taxId: line.taxId,
          lineTotal,
        });

        await tx.purchaseRequestLine.update({
          where: { id: line.prLineId },
          data: { poIssuedQuantity: { increment: line.quantity } },
        });

        const updatedIssued = issued + line.quantity;
        const prStatus =
          updatedIssued >= requested - 1e-9
            ? 'po_issued'
            : 'partially_po_issued';
        await tx.purchaseRequest.update({
          where: { id: prLine.prId },
          data: { status: prStatus },
        });
      }

      const discount = input.discountAmount ?? 0;
      const tax = input.taxAmount ?? 0;
      const total = subtotal + tax - discount;
      const needsApproval = total >= org.poApprovalThreshold;

      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          vendorId: input.vendorId,
          poDate: new Date(input.poDate),
          expectedDeliveryDate: input.expectedDeliveryDate
            ? new Date(input.expectedDeliveryDate)
            : undefined,
          deliveryAddress: input.deliveryAddress,
          paymentTerms: input.paymentTerms,
          subtotalAmount: subtotal,
          taxAmount: tax,
          discountAmount: discount,
          totalAmount: total,
          status: needsApproval ? 'pending_approval' : 'approved',
          approvedBy: needsApproval ? undefined : createdBy,
          approvedAt: needsApproval ? undefined : new Date(),
          createdBy,
          lines: { create: poLines },
        },
        include: PO_INCLUDE,
      });

      this.events.emit(EventNames.PROCUREMENT_PO_CREATED, {
        poId: po.id,
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        totalAmount: po.totalAmount,
      });
      if (!needsApproval) {
        this.events.emit(EventNames.PROCUREMENT_PO_APPROVED, {
          poId: po.id,
          poNumber: po.poNumber,
        });
      }
      return po;
    });
  }

  async updateDraft(
    id: string,
    input: {
      expectedDeliveryDate?: string;
      deliveryAddress?: string;
      paymentTerms?: string;
    },
  ) {
    const po = await this.findById(id);
    if (po.status !== 'draft') {
      throw DomainException.conflict('Only draft POs may be edited');
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        expectedDeliveryDate: input.expectedDeliveryDate
          ? new Date(input.expectedDeliveryDate)
          : undefined,
        deliveryAddress: input.deliveryAddress,
        paymentTerms: input.paymentTerms,
      },
      include: PO_INCLUDE,
    });
  }

  async approve(id: string, actorId: string, actorRoles: string[]) {
    const po = await this.findById(id);
    if (po.status !== 'pending_approval') {
      throw DomainException.withCode(
        ErrorCode.PO_APPROVAL_REQUIRED,
        409,
        'PO is not pending approval',
      );
    }
    const isPrincipal =
      actorRoles.includes('principal') || actorRoles.includes('super_admin');
    if (!isPrincipal) {
      throw DomainException.forbidden('Principal approval required');
    }

    const org = await this.org.getFull();
    if (po.totalAmount < org.poApprovalThreshold) {
      throw DomainException.conflict('PO is below approval threshold');
    }

    // PO-08: no commitment journal on approval (ADR 0004)
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: actorId,
        approvedAt: new Date(),
      },
      include: PO_INCLUDE,
    });
    this.events.emit(EventNames.PROCUREMENT_PO_APPROVED, {
      poId: id,
      poNumber: po.poNumber,
    });
    return updated;
  }

  async send(id: string) {
    const po = await this.findById(id);
    if (po.status !== 'approved') {
      throw DomainException.withCode(
        ErrorCode.PO_NOT_APPROVED,
        409,
        'PO must be approved before sending',
      );
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
      include: PO_INCLUDE,
    });
    this.events.emit(EventNames.PROCUREMENT_PO_SENT, {
      poId: id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
    });
    return updated;
  }

  async amend(
    id: string,
    actorId: string,
    input: {
      reason: string;
      totalAmount?: number;
      lines?: PoLineFromPrInput[];
    },
  ) {
    const po = await this.findById(id);
    const hasReceipt = po.lines.some((l) => Number(l.receivedQuantity) > 0);
    if (hasReceipt) {
      throw DomainException.withCode(
        ErrorCode.PO_PARTIALLY_RECEIVED,
        409,
        'Cannot amend PO after goods have been received',
      );
    }
    if (!input.reason?.trim()) {
      throw DomainException.validation('Amendment reason is required');
    }

    const org = await this.org.getFull();
    const newTotal = input.totalAmount ?? po.totalAmount;
    const needsReapproval = newTotal >= org.poApprovalThreshold;

    return this.prisma.$transaction(async (tx) => {
      await tx.poAmendment.create({
        data: {
          poId: id,
          fromVersion: po.version,
          toVersion: po.version + 1,
          changes: {
            totalAmount: newTotal,
            lines: input.lines ?? null,
          } as Prisma.InputJsonValue,
          reason: input.reason,
          amendedBy: actorId,
          amendedAt: new Date(),
        },
      });

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          version: { increment: 1 },
          totalAmount: newTotal,
          status: needsReapproval ? 'pending_approval' : po.status,
          approvedBy: needsReapproval ? null : po.approvedBy,
          approvedAt: needsReapproval ? null : po.approvedAt,
        },
        include: PO_INCLUDE,
      });
    });
  }

  async cancel(id: string, reason: string) {
    if (!reason?.trim()) {
      throw DomainException.validation('Cancellation reason is required');
    }
    const po = await this.findById(id);
    const hasReceipt = po.lines.some((l) => Number(l.receivedQuantity) > 0);
    if (hasReceipt) {
      throw DomainException.withCode(
        ErrorCode.PO_PARTIALLY_RECEIVED,
        409,
        'Cannot cancel PO after goods have been received',
      );
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancellationReason: reason,
      },
      include: PO_INCLUDE,
    });
    this.events.emit(EventNames.PROCUREMENT_PO_CANCELLED, {
      poId: id,
      poNumber: po.poNumber,
      reason,
    });
    return updated;
  }

  async tracking(id: string) {
    const po = await this.findById(id);
    return {
      poId: po.id,
      poNumber: po.poNumber,
      status: po.status,
      lines: po.lines.map((l) => ({
        id: l.id,
        itemDescription: l.itemDescription,
        ordered: Number(l.quantity),
        received: Number(l.receivedQuantity),
        rejected: Number(l.rejectedQuantity),
        invoiced: Number(l.invoicedQuantity),
        remaining: Number(l.quantity) - Number(l.receivedQuantity),
      })),
    };
  }

  document(id: string) {
    return this.findById(id).then((po) => ({
      poId: po.id,
      poNumber: po.poNumber,
      attachmentId: po.documentAttachmentId,
    }));
  }
}
