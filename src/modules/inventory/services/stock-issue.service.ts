import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { StockMovementService } from './stock-movement.service';

@Injectable()
export class StockIssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly movements: StockMovementService,
    private readonly events: EventEmitter2,
  ) {}

  list() {
    return this.prisma.stockIssueRequest.findMany({
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    requestedBy: string;
    department: string;
    toLocationId: string;
    purpose?: string;
    lines: Array<{ itemId: string; requestedQuantity: number }>;
  }) {
    const requestNumber = await this.numbering.nextCode('stock_issue');
    return this.prisma.stockIssueRequest.create({
      data: {
        requestNumber,
        requestedBy: data.requestedBy,
        department: data.department as never,
        toLocationId: data.toLocationId,
        purpose: data.purpose,
        status: 'pending',
        lines: {
          create: data.lines.map((l) => ({
            itemId: l.itemId,
            requestedQuantity: l.requestedQuantity,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async approve(id: string, actorId: string) {
    const req = await this.prisma.stockIssueRequest.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!req) throw DomainException.notFound('Issue request not found');
    if (req.status !== 'pending') {
      throw DomainException.conflict('Request is not pending');
    }
    return this.prisma.$transaction(async (tx) => {
      for (const line of req.lines) {
        await tx.stockIssueRequestLine.update({
          where: { id: line.id },
          data: { approvedQuantity: line.requestedQuantity },
        });
      }
      return tx.stockIssueRequest.update({
        where: { id },
        data: { status: 'approved', approvedBy: actorId },
        include: { lines: true },
      });
    });
  }

  async issue(id: string, fromLocationId: string, actorId: string) {
    const req = await this.prisma.stockIssueRequest.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!req) throw DomainException.notFound('Issue request not found');
    if (req.status !== 'approved' && req.status !== 'partially_issued') {
      throw DomainException.conflict('Request must be approved');
    }
    return this.prisma.$transaction(async (tx) => {
      for (const line of req.lines) {
        const qty = Number(line.approvedQuantity ?? line.requestedQuantity);
        const remaining = qty - Number(line.issuedQuantity);
        if (remaining <= 0) continue;
        const level = await tx.stockLevel.findUnique({
          where: {
            itemId_locationId: {
              itemId: line.itemId,
              locationId: fromLocationId,
            },
          },
        });
        await this.movements.issue(
          {
            itemId: line.itemId,
            locationId: fromLocationId,
            movementType: 'issue',
            quantity: remaining,
            unitCost: level?.averageCost ?? 0,
            referenceType: 'issue_request',
            referenceId: req.id,
            createdBy: actorId,
            costCenter: 'admin',
          },
          tx,
        );
        await tx.stockIssueRequestLine.update({
          where: { id: line.id },
          data: { issuedQuantity: qty },
        });
      }
      return tx.stockIssueRequest.update({
        where: { id },
        data: {
          status: 'issued',
          issuedBy: actorId,
          issuedAt: new Date(),
        },
        include: { lines: true },
      });
    });
  }
}

@Injectable()
export class StockAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly movements: StockMovementService,
    private readonly events: EventEmitter2,
  ) {}

  list() {
    return this.prisma.stockAdjustment.findMany({
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    locationId: string;
    adjustmentDate: string;
    reason: string;
    adjustmentType: 'increase' | 'decrease';
    auditId?: string;
    lines: Array<{
      itemId: string;
      systemQuantity: number;
      adjustedQuantity: number;
      unitCost: number;
      remarks?: string;
    }>;
  }) {
    const adjustmentNumber = await this.numbering.nextCode('stock_adjustment');
    return this.prisma.stockAdjustment.create({
      data: {
        adjustmentNumber,
        locationId: data.locationId,
        adjustmentDate: new Date(data.adjustmentDate),
        reason: data.reason,
        adjustmentType: data.adjustmentType,
        status: 'draft',
        auditId: data.auditId,
        lines: {
          create: data.lines.map((l) => ({
            itemId: l.itemId,
            systemQuantity: l.systemQuantity,
            adjustedQuantity: l.adjustedQuantity,
            differenceQuantity: l.adjustedQuantity - l.systemQuantity,
            unitCost: l.unitCost,
            remarks: l.remarks,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async approve(id: string, actorId: string) {
    const adj = await this.prisma.stockAdjustment.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!adj) throw DomainException.notFound('Adjustment not found');
    if (adj.status === 'approved') {
      throw DomainException.conflict('Already approved');
    }
    return this.prisma.$transaction(async (tx) => {
      for (const line of adj.lines) {
        const diff = Number(line.differenceQuantity);
        if (diff === 0) continue;
        const movementInput = {
          itemId: line.itemId,
          locationId: adj.locationId,
          quantity: Math.abs(diff),
          unitCost: line.unitCost,
          referenceType: 'adjustment' as const,
          referenceId: adj.id,
          createdBy: actorId,
        };
        if (diff > 0) {
          await this.movements.adjustIncrease(movementInput, tx);
        } else {
          await this.movements.adjustDecrease(movementInput, tx);
        }
      }
      const updated = await tx.stockAdjustment.update({
        where: { id },
        data: { status: 'approved', approvedBy: actorId },
        include: { lines: true },
      });
      await this.events.emitAsync(EventNames.INVENTORY_ADJUSTMENT_APPROVED, {
        adjustmentId: id,
        actorId,
      });
      return updated;
    });
  }
}
