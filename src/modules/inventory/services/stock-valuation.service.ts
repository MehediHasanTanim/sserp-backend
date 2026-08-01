/**
 * Pure stock valuation helpers (ST-05 / ST-06).
 * No Prisma, clock, or Nest DI — keep Semgrep-clean.
 */

export interface FifoBatch {
  id: string;
  remainingQuantity: number;
  unitCost: number;
  expiryDate?: Date | null;
  receivedDate: Date;
}

export interface FifoConsumeResult {
  allocations: Array<{
    batchId: string;
    quantity: number;
    unitCost: number;
    cost: number;
  }>;
  totalCost: number;
  remainingBatches: FifoBatch[];
}

export interface WeightedAverageState {
  quantityOnHand: number;
  averageCost: number;
  /** Residual paisa to prevent cumulative rounding drift (ST-06). */
  residualPaisa: number;
}

export class StockValuationService {
  /**
   * FIFO: consume oldest non-expired batches first.
   * Quantity and costs are exact; totalCost = sum of allocation costs.
   */
  consumeFifo(
    batches: FifoBatch[],
    quantity: number,
    asOf: Date = new Date(0),
  ): FifoConsumeResult {
    if (quantity <= 0) {
      throw new Error('Issue quantity must be positive');
    }
    const sorted = [...batches]
      .filter((b) => b.remainingQuantity > 0)
      .sort((a, b) => a.receivedDate.getTime() - b.receivedDate.getTime());

    let remaining = quantity;
    const allocations: FifoConsumeResult['allocations'] = [];
    const remainingBatches: FifoBatch[] = [];

    for (const batch of sorted) {
      if (batch.expiryDate && batch.expiryDate < asOf) {
        remainingBatches.push({ ...batch });
        continue;
      }
      if (remaining <= 0) {
        remainingBatches.push({ ...batch });
        continue;
      }
      const take = Math.min(batch.remainingQuantity, remaining);
      const cost = Math.round(take * batch.unitCost);
      allocations.push({
        batchId: batch.id,
        quantity: take,
        unitCost: batch.unitCost,
        cost,
      });
      remaining -= take;
      const left = batch.remainingQuantity - take;
      if (left > 1e-9) {
        remainingBatches.push({ ...batch, remainingQuantity: left });
      }
    }

    if (remaining > 1e-9) {
      const expiredOnly =
        sorted.length > 0 &&
        sorted.every((b) => b.expiryDate && b.expiryDate < asOf);
      if (expiredOnly) {
        throw Object.assign(new Error('All available batches are expired'), {
          code: 'BATCH_EXPIRED',
        });
      }
      throw Object.assign(new Error('Insufficient stock in batches'), {
        code: 'INSUFFICIENT_STOCK',
      });
    }

    // Preserve expired / untouched batches not in sorted consume path
    for (const batch of batches) {
      if (
        !remainingBatches.some((b) => b.id === batch.id) &&
        !allocations.some((a) => a.batchId === batch.id)
      ) {
        remainingBatches.push({ ...batch });
      }
    }

    const totalCost = allocations.reduce((s, a) => s + a.cost, 0);
    return { allocations, totalCost, remainingBatches };
  }

  /**
   * Weighted average on receipt (ST-06).
   * averageCost rounded to nearest paisa; residual tracked on the level.
   */
  applyReceipt(
    state: WeightedAverageState,
    receivedQty: number,
    receivedUnitCost: number,
  ): WeightedAverageState {
    if (receivedQty <= 0) return { ...state };
    const existingValue =
      state.quantityOnHand * state.averageCost + state.residualPaisa;
    const receivedValue = receivedQty * receivedUnitCost;
    const newQty = state.quantityOnHand + receivedQty;
    const exactAvg = (existingValue + receivedValue) / newQty;
    const averageCost = Math.round(exactAvg);
    const residualPaisa = existingValue + receivedValue - averageCost * newQty;
    return {
      quantityOnHand: newQty,
      averageCost,
      residualPaisa,
    };
  }

  applyIssue(
    state: WeightedAverageState,
    issuedQty: number,
  ): { state: WeightedAverageState; totalCost: number } {
    if (issuedQty <= 0) {
      return { state: { ...state }, totalCost: 0 };
    }
    if (issuedQty > state.quantityOnHand + 1e-9) {
      throw Object.assign(new Error('Insufficient stock'), {
        code: 'INSUFFICIENT_STOCK',
      });
    }
    const totalCost = Math.round(issuedQty * state.averageCost);
    const newQty = state.quantityOnHand - issuedQty;
    return {
      state: {
        quantityOnHand: newQty,
        averageCost: newQty <= 0 ? 0 : state.averageCost,
        residualPaisa: newQty <= 0 ? 0 : state.residualPaisa,
      },
      totalCost,
    };
  }

  valuation(state: WeightedAverageState): number {
    return Math.round(
      state.quantityOnHand * state.averageCost + state.residualPaisa,
    );
  }
}
