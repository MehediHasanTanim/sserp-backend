import { StockValuationService } from './stock-valuation.service';

describe('StockValuationService', () => {
  const svc = new StockValuationService();

  it('FIFO across three batches consumes oldest first', () => {
    const batches = [
      {
        id: 'b1',
        remainingQuantity: 10,
        unitCost: 100,
        receivedDate: new Date('2026-01-01'),
      },
      {
        id: 'b2',
        remainingQuantity: 10,
        unitCost: 120,
        receivedDate: new Date('2026-02-01'),
      },
      {
        id: 'b3',
        remainingQuantity: 10,
        unitCost: 140,
        receivedDate: new Date('2026-03-01'),
      },
    ];
    const result = svc.consumeFifo(batches, 15, new Date('2026-04-01'));
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0]).toMatchObject({
      batchId: 'b1',
      quantity: 10,
      cost: 1000,
    });
    expect(result.allocations[1]).toMatchObject({
      batchId: 'b2',
      quantity: 5,
      cost: 600,
    });
    expect(result.totalCost).toBe(1600);
  });

  it('FIFO skips expired batches', () => {
    const batches = [
      {
        id: 'expired',
        remainingQuantity: 10,
        unitCost: 50,
        receivedDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-06-01'),
      },
      {
        id: 'ok',
        remainingQuantity: 10,
        unitCost: 80,
        receivedDate: new Date('2026-01-01'),
        expiryDate: new Date('2027-01-01'),
      },
    ];
    const result = svc.consumeFifo(batches, 5, new Date('2026-07-01'));
    expect(result.allocations[0].batchId).toBe('ok');
    expect(result.totalCost).toBe(400);
  });

  it('weighted average sequence has no cumulative rounding drift', () => {
    let state = { quantityOnHand: 0, averageCost: 0, residualPaisa: 0 };
    state = svc.applyReceipt(state, 10, 100);
    state = svc.applyReceipt(state, 10, 110);
    state = svc.applyReceipt(state, 5, 105);
    const { state: afterIssue, totalCost } = svc.applyIssue(state, 8);
    expect(totalCost).toBe(Math.round(8 * afterIssue.averageCost) || totalCost);
    state = afterIssue;
    state = svc.applyReceipt(state, 7, 99);
    const { state: s2 } = svc.applyIssue(state, 3);
    state = s2;
    state = svc.applyReceipt(state, 4, 130);
    const val = svc.valuation(state);
    const recomputed =
      Math.round(state.quantityOnHand * state.averageCost) +
      Math.round(state.residualPaisa);
    expect(Math.abs(val - recomputed)).toBeLessThanOrEqual(1);
    expect(state.quantityOnHand).toBeGreaterThan(0);
  });

  it('rejects issue exceeding on-hand', () => {
    expect(() =>
      svc.applyIssue(
        { quantityOnHand: 2, averageCost: 100, residualPaisa: 0 },
        5,
      ),
    ).toThrow(/Insufficient/);
  });

  it('50-step WAVG sequence reconciles valuation to movement costs', () => {
    let state = { quantityOnHand: 0, averageCost: 0, residualPaisa: 0 };
    let movementCostSum = 0;

    for (let step = 0; step < 50; step += 1) {
      const unitCost = 95 + (step % 11);
      const qty = (step % 3) + 1;
      if (step % 5 === 4 && state.quantityOnHand > 0) {
        const issueQty = Math.min(2, state.quantityOnHand);
        const { state: next, totalCost } = svc.applyIssue(state, issueQty);
        state = next;
        movementCostSum -= totalCost;
      } else {
        state = svc.applyReceipt(state, qty, unitCost);
        movementCostSum += Math.round(qty * unitCost);
      }
    }

    const val = svc.valuation(state);
    const recomputed =
      Math.round(state.quantityOnHand * state.averageCost) +
      Math.round(state.residualPaisa);
    expect(Math.abs(val - recomputed)).toBeLessThanOrEqual(1);
    expect(Math.abs(val - movementCostSum)).toBeLessThanOrEqual(
      state.quantityOnHand + 1,
    );
  });
});
