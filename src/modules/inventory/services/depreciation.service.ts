/**
 * Pure depreciation math (AS-03 / AS-04).
 * Mid-month purchase starts depreciation the following month (documented).
 */

export type DepreciationMethod = 'straight_line' | 'reducing_balance';

export interface DepreciationInput {
  purchaseCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  depreciationRatePercent?: number | null;
  accumulatedDepreciation: number;
  netBookValue: number;
  disposed?: boolean;
}

export interface DepreciationResult {
  depreciationAmount: number;
  openingNbv: number;
  closingNbv: number;
  skipped: boolean;
  reason?: string;
}

export class DepreciationService {
  computeMonthly(input: DepreciationInput): DepreciationResult {
    if (input.disposed) {
      return {
        depreciationAmount: 0,
        openingNbv: input.netBookValue,
        closingNbv: input.netBookValue,
        skipped: true,
        reason: 'disposed',
      };
    }
    const openingNbv = input.netBookValue;
    if (openingNbv <= input.salvageValue) {
      return {
        depreciationAmount: 0,
        openingNbv,
        closingNbv: openingNbv,
        skipped: true,
        reason: 'at_salvage',
      };
    }

    let amount = 0;
    if (input.depreciationMethod === 'straight_line') {
      const depreciable = input.purchaseCost - input.salvageValue;
      if (input.usefulLifeMonths <= 0 || depreciable <= 0) {
        return {
          depreciationAmount: 0,
          openingNbv,
          closingNbv: openingNbv,
          skipped: true,
          reason: 'no_depreciable_base',
        };
      }
      amount = Math.round(depreciable / input.usefulLifeMonths);
    } else {
      const rate = Number(input.depreciationRatePercent ?? 0) / 100;
      amount = Math.round(openingNbv * rate);
    }

    const maxAllowed = openingNbv - input.salvageValue;
    if (amount > maxAllowed) amount = maxAllowed;
    if (amount < 0) amount = 0;

    return {
      depreciationAmount: amount,
      openingNbv,
      closingNbv: openingNbv - amount,
      skipped: amount === 0,
    };
  }

  /**
   * Straight-line schedule length helper for tests: month N reaches salvage.
   */
  straightLineMonthlyAmount(
    purchaseCost: number,
    salvageValue: number,
    usefulLifeMonths: number,
  ): number {
    return Math.round((purchaseCost - salvageValue) / usefulLifeMonths);
  }
}
