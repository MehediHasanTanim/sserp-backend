import { DepreciationService } from './depreciation.service';

describe('DepreciationService', () => {
  const svc = new DepreciationService();

  it('straight-line over 36 months reaches salvage with no residual', () => {
    const purchaseCost = 360000;
    const salvage = 0;
    const months = 36;
    let nbv = purchaseCost;
    let accum = 0;
    for (let m = 1; m <= months; m++) {
      const r = svc.computeMonthly({
        purchaseCost,
        salvageValue: salvage,
        usefulLifeMonths: months,
        depreciationMethod: 'straight_line',
        accumulatedDepreciation: accum,
        netBookValue: nbv,
      });
      accum += r.depreciationAmount;
      nbv = r.closingNbv;
    }
    expect(nbv).toBe(salvage);
    expect(accum).toBe(purchaseCost - salvage);
  });

  it('reducing balance never crosses below salvage', () => {
    let nbv = 100000;
    const salvage = 10000;
    for (let i = 0; i < 50; i++) {
      const r = svc.computeMonthly({
        purchaseCost: 100000,
        salvageValue: salvage,
        usefulLifeMonths: 60,
        depreciationMethod: 'reducing_balance',
        depreciationRatePercent: 20,
        accumulatedDepreciation: 100000 - nbv,
        netBookValue: nbv,
      });
      nbv = r.closingNbv;
      expect(nbv).toBeGreaterThanOrEqual(salvage);
    }
    expect(nbv).toBe(salvage);
  });

  it('skips depreciation after disposal', () => {
    const r = svc.computeMonthly({
      purchaseCost: 100000,
      salvageValue: 0,
      usefulLifeMonths: 12,
      depreciationMethod: 'straight_line',
      accumulatedDepreciation: 0,
      netBookValue: 100000,
      disposed: true,
    });
    expect(r.skipped).toBe(true);
    expect(r.depreciationAmount).toBe(0);
  });
});
