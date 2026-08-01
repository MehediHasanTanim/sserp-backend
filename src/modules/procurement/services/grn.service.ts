import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GrnStatus } from '@prisma/client';
import {
  NumberingService,
  OrganizationService,
} from '../../admin/services/organization.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { AssetService } from '../../inventory/services/asset.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

const GRN_INCLUDE = {
  lines: { include: { item: true, purchaseOrderLine: true } },
  purchaseOrder: { include: { lines: true } },
  vendor: true,
  receivedAtLocation: true,
};

export interface GrnLineInput {
  poLineId: string;
  receivedQuantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
  serialNumbers?: string[];
}

export interface QualityCheckLineInput {
  grnLineId: string;
  acceptedQuantity: number;
  rejectedQuantity: number;
  rejectionReason?: string;
}

@Injectable()
export class GrnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly org: OrganizationService,
    private readonly stockMovement: StockMovementService,
    private readonly assets: AssetService,
    private readonly ledger: LedgerPort,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { status?: GrnStatus; poId?: string }) {
    return this.prisma.goodsReceiptNote.findMany({
      where: { status: filters?.status, poId: filters?.poId },
      include: GRN_INCLUDE,
      orderBy: { receiptDate: 'desc' },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.goodsReceiptNote.findUnique({
      where: { id },
      include: GRN_INCLUDE,
    });
    if (!row) throw DomainException.notFound('GRN not found');
    return row;
  }

  async create(
    input: {
      poId: string;
      receiptDate: string;
      deliveryNoteReference?: string;
      receivedAtLocationId: string;
      remarks?: string;
      attachmentId?: string;
      lines: GrnLineInput[];
    },
    receivedBy: string,
  ) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: input.poId },
      include: { lines: true, vendor: true },
    });
    if (!po) throw DomainException.notFound('Purchase order not found');
    if (!['approved', 'sent', 'partially_received'].includes(po.status)) {
      throw DomainException.withCode(
        ErrorCode.PO_NOT_RECEIVABLE,
        422,
        'PO is not receivable',
      );
    }
    if (po.status === 'fully_received') {
      throw DomainException.withCode(
        ErrorCode.PO_NOT_RECEIVABLE,
        422,
        'PO is fully received',
      );
    }

    const org = await this.org.getFull();
    const tolerancePct = org.grnOverDeliveryTolerancePercent / 100;
    const grnNumber = await this.numbering.nextCode('grn');

    for (const line of input.lines) {
      const poLine = po.lines.find((l) => l.id === line.poLineId);
      if (!poLine) {
        throw DomainException.notFound(`PO line ${line.poLineId} not found`);
      }
      const ordered = Number(poLine.quantity);
      const alreadyReceived = Number(poLine.receivedQuantity);
      const maxAllowed = ordered * (1 + tolerancePct);
      if (alreadyReceived + line.receivedQuantity > maxAllowed + 1e-9) {
        throw DomainException.withCode(
          ErrorCode.EXCEEDS_ORDERED_QUANTITY,
          422,
          'Received quantity exceeds ordered quantity plus tolerance',
        );
      }
    }

    return this.prisma.goodsReceiptNote.create({
      data: {
        grnNumber,
        poId: input.poId,
        vendorId: po.vendorId,
        receiptDate: new Date(input.receiptDate),
        deliveryNoteReference: input.deliveryNoteReference,
        receivedAtLocationId: input.receivedAtLocationId,
        receivedBy,
        remarks: input.remarks,
        attachmentId: input.attachmentId,
        status: 'draft',
        isPartial: true,
        lines: {
          create: input.lines.map((l) => {
            const poLine = po.lines.find((pl) => pl.id === l.poLineId)!;
            return {
              poLineId: l.poLineId,
              itemId: poLine.itemId,
              orderedQuantity: poLine.quantity,
              receivedQuantity: l.receivedQuantity,
              unitCost: l.unitCost,
              batchNumber: l.batchNumber,
              expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined,
              serialNumbers: l.serialNumbers ?? [],
            };
          }),
        },
      },
      include: GRN_INCLUDE,
    });
  }

  async updateDraft(
    id: string,
    input: {
      deliveryNoteReference?: string;
      remarks?: string;
      attachmentId?: string;
      lines?: GrnLineInput[];
    },
  ) {
    const grn = await this.findById(id);
    if (grn.status !== 'draft') {
      throw DomainException.conflict('Only draft GRNs may be edited');
    }

    if (input.lines) {
      await this.prisma.grnLine.deleteMany({ where: { grnId: id } });
      const po = grn.purchaseOrder;
      await this.prisma.grnLine.createMany({
        data: input.lines.map((l) => {
          const poLine = po.lines.find((pl) => pl.id === l.poLineId)!;
          return {
            grnId: id,
            poLineId: l.poLineId,
            itemId: poLine.itemId,
            orderedQuantity: poLine.quantity,
            receivedQuantity: l.receivedQuantity,
            unitCost: l.unitCost,
            batchNumber: l.batchNumber,
            expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined,
            serialNumbers: l.serialNumbers ?? [],
          };
        }),
      });
    }

    return this.prisma.goodsReceiptNote.update({
      where: { id },
      data: {
        deliveryNoteReference: input.deliveryNoteReference,
        remarks: input.remarks,
        attachmentId: input.attachmentId,
      },
      include: GRN_INCLUDE,
    });
  }

  async qualityCheck(
    id: string,
    actorId: string,
    lines: QualityCheckLineInput[],
  ) {
    const grn = await this.findById(id);
    if (!['draft', 'quality_check'].includes(grn.status)) {
      throw DomainException.conflict('GRN is not eligible for quality check');
    }

    for (const line of lines) {
      const grnLine = grn.lines.find((l) => l.id === line.grnLineId);
      if (!grnLine) {
        throw DomainException.notFound(`GRN line ${line.grnLineId} not found`);
      }
      const received = Number(grnLine.receivedQuantity);
      if (
        Math.abs(line.acceptedQuantity + line.rejectedQuantity - received) >
        1e-9
      ) {
        throw DomainException.validation(
          'accepted_quantity + rejected_quantity must equal received_quantity',
        );
      }
      if (line.rejectedQuantity > 0 && !line.rejectionReason?.trim()) {
        throw DomainException.validation(
          'Rejection reason is required when quantity is rejected',
        );
      }

      const item = grnLine.item;
      if (item.tracksExpiry && !grnLine.expiryDate) {
        throw DomainException.withCode(
          ErrorCode.EXPIRY_REQUIRED,
          422,
          'Expiry date is required for this item',
        );
      }
      if (item.tracksSerial) {
        const expected = Math.round(line.acceptedQuantity);
        const serials = grnLine.serialNumbers ?? [];
        if (serials.length !== expected) {
          throw DomainException.withCode(
            ErrorCode.SERIAL_COUNT_MISMATCH,
            422,
            'One serial number is required per accepted unit',
          );
        }
      }

      await this.prisma.grnLine.update({
        where: { id: line.grnLineId },
        data: {
          acceptedQuantity: line.acceptedQuantity,
          rejectedQuantity: line.rejectedQuantity,
          rejectionReason: line.rejectionReason,
        },
      });
    }

    const refreshed = await this.findById(id);
    const totalAccepted = refreshed.lines.reduce(
      (s, l) => s + Number(l.acceptedQuantity),
      0,
    );
    const totalRejected = refreshed.lines.reduce(
      (s, l) => s + Number(l.rejectedQuantity),
      0,
    );
    let status: GrnStatus = 'quality_check';
    if (totalAccepted > 0 && totalRejected > 0) status = 'partially_accepted';
    else if (totalAccepted > 0) status = 'accepted';
    else if (totalRejected > 0) status = 'rejected';

    return this.prisma.goodsReceiptNote.update({
      where: { id },
      data: {
        status,
        qualityCheckedBy: actorId,
      },
      include: GRN_INCLUDE,
    });
  }

  async post(id: string, actorId: string) {
    const grn = await this.findById(id);
    if (grn.status === 'posted') {
      throw DomainException.withCode(
        ErrorCode.GRN_ALREADY_POSTED,
        409,
        'GRN is already posted',
      );
    }
    if (
      !['quality_check', 'accepted', 'partially_accepted'].includes(grn.status)
    ) {
      throw DomainException.conflict(
        'GRN must pass quality check before posting',
      );
    }

    const po = grn.purchaseOrder;
    const costCenter = 'admin';

    return this.prisma.$transaction(async (tx) => {
      let consumableTotal = 0;
      let assetTotal = 0;

      for (const line of grn.lines) {
        const accepted = Number(line.acceptedQuantity);
        if (accepted <= 0) continue;

        const item = await tx.item.findUniqueOrThrow({
          where: { id: line.itemId },
          include: { category: true },
        });

        if (item.itemNature === 'asset') {
          const unitCost = line.unitCost;
          assetTotal += Math.round(accepted * unitCost);
          if (item.tracksSerial && line.serialNumbers.length) {
            for (const serial of line.serialNumbers) {
              await this.assets.createFromGrn(
                {
                  itemId: line.itemId,
                  name: `${item.name} (${serial})`,
                  serialNumber: serial,
                  purchaseDate: grn.receiptDate.toISOString().slice(0, 10),
                  purchaseCost: unitCost,
                  supplierVendorId: grn.vendorId,
                  grnId: id,
                  locationId: grn.receivedAtLocationId,
                },
                tx,
              );
            }
          } else {
            await this.assets.createFromGrn(
              {
                itemId: line.itemId,
                name: item.name,
                purchaseDate: grn.receiptDate.toISOString().slice(0, 10),
                purchaseCost: Math.round(accepted * unitCost),
                supplierVendorId: grn.vendorId,
                grnId: id,
                locationId: grn.receivedAtLocationId,
              },
              tx,
            );
          }
        } else {
          const movement = await this.stockMovement.receipt(
            {
              itemId: line.itemId,
              locationId: grn.receivedAtLocationId,
              movementType: 'receipt',
              quantity: accepted,
              unitCost: line.unitCost,
              batchNumber: line.batchNumber ?? undefined,
              expiryDate: line.expiryDate?.toISOString().slice(0, 10),
              referenceType: 'grn',
              referenceId: id,
              movementDate: grn.receiptDate.toISOString().slice(0, 10),
              createdBy: actorId,
              costCenter,
            },
            tx,
          );
          consumableTotal += movement.totalCost;
          await tx.grnLine.update({
            where: { id: line.id },
            data: { stockMovementId: movement.id },
          });
        }

        await tx.purchaseOrderLine.update({
          where: { id: line.poLineId },
          data: {
            receivedQuantity: { increment: accepted },
            rejectedQuantity: { increment: Number(line.rejectedQuantity) },
          },
        });
      }

      const poLines = await tx.purchaseOrderLine.findMany({
        where: { poId: po.id },
      });
      const allReceived = poLines.every(
        (l) => Number(l.receivedQuantity) >= Number(l.quantity) - 1e-9,
      );
      const anyReceived = poLines.some((l) => Number(l.receivedQuantity) > 0);
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: allReceived
            ? 'fully_received'
            : anyReceived
              ? 'partially_received'
              : po.status,
        },
      });

      let journalId: string | undefined;
      if (consumableTotal > 0) {
        const posted = await this.ledger.post(
          {
            referenceType: 'grn_posted',
            referenceId: id,
            amount: consumableTotal,
            costCenter,
            description: `GRN ${grn.grnNumber} consumable receipt`,
            debitAccountCode: '',
            creditAccountCode: '',
            postingDate: grn.receiptDate,
            payload: { variant: 'consumable' },
          },
          tx,
        );
        journalId = posted.journalId;
      }
      if (assetTotal > 0) {
        const posted = await this.ledger.post(
          {
            referenceType: 'grn_posted',
            referenceId: id,
            amount: assetTotal,
            costCenter,
            description: `GRN ${grn.grnNumber} asset receipt`,
            debitAccountCode: '',
            creditAccountCode: '',
            postingDate: grn.receiptDate,
            payload: { variant: 'asset' },
          },
          tx,
        );
        journalId = posted.journalId ?? journalId;
      }

      const updated = await tx.goodsReceiptNote.update({
        where: { id },
        data: {
          status: 'posted',
          postedAt: new Date(),
          journalId,
        },
        include: GRN_INCLUDE,
      });

      this.events.emit(EventNames.INVENTORY_GRN_RECEIVED, {
        grnId: id,
        grnNumber: grn.grnNumber,
        poId: po.id,
        vendorId: grn.vendorId,
      });

      return updated;
    });
  }
}
