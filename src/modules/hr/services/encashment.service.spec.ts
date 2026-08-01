import { computeEligibleEncashmentDays } from './encashment.service';

describe('EncashmentService eligibility formula', () => {
  /**
   * Six combinations (EN-02):
   * 1. Cap binds (available−retain > max−already)
   * 2. Cap remainder after partial encashment
   * 3. Balance−retain binds under wide cap
   * 4. At retain floor → 0
   * 5. Already at annual cap → 0
   * 6. Cap binds with larger balance
   */
  const cases = [
    {
      availableBalance: 10,
      minBalanceToRetain: 2,
      maxEncashableDaysPerYear: 6,
      alreadyEncashedThisYear: 0,
      expected: 6,
    },
    {
      availableBalance: 10,
      minBalanceToRetain: 2,
      maxEncashableDaysPerYear: 6,
      alreadyEncashedThisYear: 4,
      expected: 2,
    },
    {
      availableBalance: 3,
      minBalanceToRetain: 2,
      maxEncashableDaysPerYear: 6,
      alreadyEncashedThisYear: 0,
      expected: 1,
    },
    {
      availableBalance: 2,
      minBalanceToRetain: 2,
      maxEncashableDaysPerYear: 6,
      alreadyEncashedThisYear: 0,
      expected: 0,
    },
    {
      availableBalance: 10,
      minBalanceToRetain: 0,
      maxEncashableDaysPerYear: 5,
      alreadyEncashedThisYear: 5,
      expected: 0,
    },
    {
      availableBalance: 20,
      minBalanceToRetain: 5,
      maxEncashableDaysPerYear: 10,
      alreadyEncashedThisYear: 0,
      expected: 10,
    },
  ];

  it.each(cases)('combo %# → $expected', (c) => {
    expect(computeEligibleEncashmentDays(c)).toBe(c.expected);
  });
});
