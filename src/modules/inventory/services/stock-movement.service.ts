import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { StockValuationService, FifoBatch } from './stock-valuation.service';

export interface MovementInput {
  itemId: string;
  locationId: string;
  counterLocationId?: string;
  movementType?: StockMovementType;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
  serialNumber?: string;
  referenceType:
    | 'grn'
    | 'issue_request'
    | 'transfer'
    | 'adjustment'
    | 'audit'
    | 'disposal'
    | 'opening';
  referenceId?: string;
  movementDate?: string;
  remarks?: string;
  createdBy: string;
  costCenter?: string;
}

@Injectable()
export class StockMovementService {
  private readonly valuation = new StockValuationService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly ledger: LedgerPort,
    private readonly events: EventEmitter2,
  ) {}

  listForItem(itemId: string) {
    return this.prisma.stockMovement.findMany({
      where: { itemId },
      orderBy: { movementDate: 'desc' },
      take: 200,
    });
  }

  async receipt(input: MovementInput, tx?: TxClient) {
    return this.record(input, 'receipt', 1, tx);
  }

  async issue(input: MovementInput, tx?: TxClient) {
    return this.record(input, 'issue', -1, tx);
  }

  async adjustIncrease(input: MovementInput, tx?: TxClient) {
    return this.record(
      { ...input, movementType: 'adjustment_increase' },
      'adjustment_increase',
      1,
      tx,
    );
  }

  async adjustDecrease(input: MovementInput, tx?: TxClient) {
    return this.record(
      { ...input, movementType: 'adjustment_decrease' },
      'adjustment_decrease',
      -1,
      tx,
    );
  }

  async transfer(
    itemId: string,
    fromLocationId: string,
    toLocationId: string,
    quantity: number,
    actorId: string,
    remarks?: string,
  ) {
    return this.prisma.$transaction(async (inner) => {
      const level = await this.lockLevel(inner, itemId, fromLocationId);
      const avg = level?.averageCost ?? 0;
      await this.record(
        {
          itemId,
          locationId: fromLocationId,
          counterLocationId: toLocationId,
          movementType: 'transfer_out',
          quantity,
          unitCost: avg,
          referenceType: 'transfer',
          createdBy: actorId,
          remarks,
        },
        'transfer_out',
        -1,
        inner,
      );
      return this.record(
        {
          itemId,
          locationId: toLocationId,
          counterLocationId: fromLocationId,
          movementType: 'transfer_in',
          quantity,
          unitCost: avg,
          referenceType: 'transfer',
          createdBy: actorId,
          remarks,
        },
        'transfer_in',
        1,
        inner,
      );
    });
  }

  private async record(
    input: MovementInput,
    type: StockMovementType,
    sign: 1 | -1,
    outerTx?: TxClient,
  ) {
    const run = async (tx: TxClient) => {
      const item = await tx.item.findFirst({
        where: { id: input.itemId, deletedAt: null },
        include: { unitOfMeasure: true },
      });
      if (!item) throw DomainException.notFound('Item not found');

      const qty = input.quantity;
      if (qty <= 0) {
        throw DomainException.validation('Quantity must be positive');
      }
      if (!item.unitOfMeasure.allowsFraction && !Number.isInteger(qty)) {
        throw DomainException.withCode(
          ErrorCode.VALIDATION_ERROR,
          400,
          'Fractional quantity not allowed for this unit',
        );
      }

      const level = await this.lockLevel(tx, input.itemId, input.locationId);
      const onHand = Number(level?.quantityOnHand ?? 0);
      const minLevel = Number(item.minimumStockLevel);
      const unitCost = input.unitCost;
      let totalCost = Math.round(qty * unitCost);
      let averageCost = level?.averageCost ?? unitCost;

      if (sign < 0) {
        if (onHand + 1e-9 < qty) {
          throw DomainException.withCode(
            ErrorCode.INSUFFICIENT_STOCK,
            422,
            'Insufficient stock on hand',
            { onHand, requested: qty },
          );
        }
        if (item.valuationMethod === 'fifo') {
          const batches = await tx.stockBatch.findMany({
            where: {
              itemId: input.itemId,
              locationId: input.locationId,
              remainingQuantity: { gt: 0 },
            },
          });
          const fifo = this.valuation.consumeFifo(
            batches.map((b): FifoBatch => ({
              id: b.id,
              remainingQuantity: Number(b.remainingQuantity),
              unitCost: b.unitCost,
              expiryDate: b.expiryDate,
              receivedDate: b.receivedDate,
            })),
            qty,
            input.movementDate ? new Date(input.movementDate) : new Date(),
          );
          totalCost = fifo.totalCost;
          for (const alloc of fifo.allocations) {
            await tx.stockBatch.update({
              where: { id: alloc.batchId },
              data: {
                remainingQuantity: {
                  decrement: alloc.quantity,
                },
              },
            });
          }
        } else {
          const issued = this.valuation.applyIssue(
            {
              quantityOnHand: onHand,
              averageCost: level?.averageCost ?? 0,
              residualPaisa: 0,
            },
            qty,
          );
          totalCost = issued.totalCost;
          averageCost = issued.state.averageCost;
        }
      } else if (
        type === 'receipt' ||
        type === 'opening' ||
        type === 'return'
      ) {
        if (item.valuationMethod === 'weighted_average') {
          const next = this.valuation.applyReceipt(
            {
              quantityOnHand: onHand,
              averageCost: level?.averageCost ?? 0,
              residualPaisa: 0,
            },
            qty,
            unitCost,
          );
          averageCost = next.averageCost;
        } else {
          averageCost = unitCost;
        }
        if (
          input.batchNumber ||
          item.tracksExpiry ||
          item.valuationMethod === 'fifo'
        ) {
          await tx.stockBatch.create({
            data: {
              itemId: input.itemId,
              locationId: input.locationId,
              batchNumber: input.batchNumber ?? `B-${Date.now()}`,
              expiryDate: input.expiryDate
                ? new Date(input.expiryDate)
                : undefined,
              receivedQuantity: qty,
              remainingQuantity: qty,
              unitCost,
              receivedDate: input.movementDate
                ? new Date(input.movementDate)
                : new Date(),
              grnId:
                input.referenceType === 'grn' ? input.referenceId : undefined,
            },
          });
        }
      }

      const newOnHand = onHand + sign * qty;
      await tx.stockLevel.upsert({
        where: {
          itemId_locationId: {
            itemId: input.itemId,
            locationId: input.locationId,
          },
        },
        create: {
          itemId: input.itemId,
          locationId: input.locationId,
          quantityOnHand: newOnHand,
          averageCost,
          lastMovementAt: new Date(),
        },
        update: {
          quantityOnHand: newOnHand,
          averageCost,
          lastMovementAt: new Date(),
        },
      });

      const movementNumber = await this.numbering.nextCode(
        'stock_movement',
        tx,
      );
      const movement = await tx.stockMovement.create({
        data: {
          movementNumber,
          itemId: input.itemId,
          locationId: input.locationId,
          counterLocationId: input.counterLocationId,
          movementType: type,
          quantity: qty,
          unitCost,
          totalCost,
          batchNumber: input.batchNumber,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          serialNumber: input.serialNumber,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          movementDate: input.movementDate
            ? new Date(input.movementDate)
            : new Date(),
          remarks: input.remarks,
          createdBy: input.createdBy,
        },
      });

      if (
        (type === 'issue' || type === 'adjustment_decrease') &&
        totalCost > 0
      ) {
        const refType = type === 'issue' ? 'stock_issue' : 'stock_adjustment';
        const variant = type === 'adjustment_decrease' ? 'decrease' : undefined;
        const posted = await this.ledger.post(
          {
            referenceType: refType,
            referenceId: movement.id,
            amount: totalCost,
            costCenter: input.costCenter ?? 'admin',
            description: `Stock ${type} ${movementNumber}`,
            debitAccountCode: '',
            creditAccountCode: '',
            postingDate: movement.movementDate,
            payload: variant ? { variant } : undefined,
          },
          tx,
        );
        await tx.stockMovement.update({
          where: { id: movement.id },
          data: { journalId: posted.journalId },
        });
      }
      if (type === 'adjustment_increase' && totalCost > 0) {
        const posted = await this.ledger.post(
          {
            referenceType: 'stock_adjustment',
            referenceId: movement.id,
            amount: totalCost,
            costCenter: 'admin',
            description: `Stock adjustment increase ${movementNumber}`,
            debitAccountCode: '',
            creditAccountCode: '',
            postingDate: movement.movementDate,
            payload: { variant: 'increase' },
          },
          tx,
        );
        await tx.stockMovement.update({
          where: { id: movement.id },
          data: { journalId: posted.journalId },
        });
      }

      if (onHand >= minLevel && newOnHand < minLevel) {
        await this.events.emitAsync(EventNames.INVENTORY_STOCK_LOW, {
          itemId: input.itemId,
          locationId: input.locationId,
          quantityOnHand: newOnHand,
          minimumStockLevel: minLevel,
        });
      }

      return movement;
    };

    if (outerTx) return run(outerTx);
    return this.prisma.$transaction((tx) => run(tx));
  }

  private async lockLevel(tx: TxClient, itemId: string, locationId: string) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        quantity_on_hand: Prisma.Decimal;
        average_cost: number;
      }>
    >`
      SELECT id, quantity_on_hand, average_cost
      FROM stock_levels
      WHERE item_id = ${itemId}::uuid AND location_id = ${locationId}::uuid
      FOR UPDATE
    `;
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      quantityOnHand: rows[0].quantity_on_hand,
      averageCost: rows[0].average_cost,
    };
  }
}
