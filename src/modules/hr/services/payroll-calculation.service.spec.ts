import { PayrollCalculationService } from './payroll-calculation.service';
import { StatutoryDeductionService, TaxSlab } from './salary-structure.service';

describe('PayrollCalculationService', () => {
  const calc = new PayrollCalculationService();

  const basic = (amount: number) => ({
    code: 'BASIC',
    name: 'Basic Salary',
    componentType: 'earning' as const,
    calculationType: 'fixed' as const,
    value: amount,
  });

  it('computes fixed-only structure', () => {
    const result = calc.calculate({
      components: [basic(5000000)],
      workingDays: 22,
      presentDays: 22,
      absentDays: 0,
      unpaidLeaveDays: 0,
    });
    expect(result.grossAmount).toBe(5000000);
    expect(result.netAmount).toBe(5000000);
    expect(result.lopDays).toBe(0);
  });

  it('resolves percentage_of_basic against live basic', () => {
    const result = calc.calculate({
      components: [
        basic(1000000),
        {
          code: 'HRA',
          name: 'HRA',
          componentType: 'earning',
          calculationType: 'percentage_of_basic',
          value: 40,
        },
      ],
      workingDays: 22,
      presentDays: 22,
      absentDays: 0,
      unpaidLeaveDays: 0,
    });
    expect(result.grossAmount).toBe(1400000);
  });

  it('resolves percentage_of_gross after pass-1 gross', () => {
    const result = calc.calculate({
      components: [
        basic(1000000),
        {
          code: 'BONUS_PCT',
          name: 'Bonus %',
          componentType: 'earning',
          calculationType: 'percentage_of_gross',
          value: 10,
        },
      ],
      workingDays: 22,
      presentDays: 22,
      absentDays: 0,
      unpaidLeaveDays: 0,
    });
    expect(result.grossAmount).toBe(1100000);
  });

  it('applies LOP for 22 wd, 20 present, 1 unpaid leave, 1 absent', () => {
    const result = calc.calculate({
      components: [basic(2200000)],
      workingDays: 22,
      presentDays: 20,
      absentDays: 1,
      unpaidLeaveDays: 1,
    });
    expect(result.lopDays).toBe(2);
    const lop = result.lines.find((l) => l.componentName === 'Loss of Pay');
    expect(lop?.amount).toBe(Math.floor(2 * (2200000 / 22)));
    expect(result.netAmount).toBe(2200000 - Math.floor(2 * (2200000 / 22)));
  });

  it('produces no LOP on full attendance', () => {
    const result = calc.calculate({
      components: [basic(1000000)],
      workingDays: 22,
      presentDays: 22,
      absentDays: 0,
      unpaidLeaveDays: 0,
    });
    expect(
      result.lines.find((l) => l.componentName === 'Loss of Pay'),
    ).toBeUndefined();
  });

  it('prorates mid-month joiner via daysInPeriod', () => {
    const result = calc.calculate({
      components: [basic(2200000)],
      workingDays: 22,
      presentDays: 11,
      absentDays: 0,
      unpaidLeaveDays: 0,
      daysInPeriod: 11,
    });
    expect(result.grossAmount).toBe(1100000);
  });

  it('prorates mid-month exit via daysInPeriod', () => {
    const result = calc.calculate({
      components: [basic(2200000)],
      workingDays: 22,
      presentDays: 15,
      absentDays: 0,
      unpaidLeaveDays: 0,
      daysInPeriod: 15,
    });
    expect(result.grossAmount).toBe(Math.round(2200000 * (15 / 22)));
  });

  it('adds overtime at configured rate', () => {
    const result = calc.calculate({
      components: [basic(1000000)],
      workingDays: 22,
      presentDays: 22,
      absentDays: 0,
      unpaidLeaveDays: 0,
      overtimeMinutes: 120,
      overtimeRatePerHour: 50000,
    });
    expect(
      result.lines.find((l) => l.componentName === 'Overtime')?.amount,
    ).toBe(100000);
    expect(result.grossAmount).toBe(1100000);
  });

  it('rejects negative net pay', () => {
    expect(() =>
      calc.calculate({
        components: [basic(100000)],
        workingDays: 22,
        presentDays: 22,
        absentDays: 0,
        unpaidLeaveDays: 0,
        adjustments: [
          {
            label: 'Advance recovery',
            adjustmentType: 'deduction',
            amount: 200000,
          },
        ],
      }),
    ).toThrow(/negative/i);
  });

  it('includes encashment/bonus/loan adjustments as named lines', () => {
    const result = calc.calculate({
      components: [basic(1000000)],
      workingDays: 22,
      presentDays: 22,
      absentDays: 0,
      unpaidLeaveDays: 0,
      adjustments: [
        {
          label: 'Leave Encashment',
          adjustmentType: 'addition',
          amount: 50000,
          sourceType: 'encashment',
        },
        {
          label: 'Festival Bonus',
          adjustmentType: 'addition',
          amount: 100000,
          sourceType: 'manual',
        },
        {
          label: 'Loan Installment',
          adjustmentType: 'deduction',
          amount: 25000,
          sourceType: 'loan_repayment',
        },
      ],
    });
    expect(result.lines.map((l) => l.componentName)).toEqual(
      expect.arrayContaining([
        'Leave Encashment',
        'Festival Bonus',
        'Loan Installment',
      ]),
    );
    expect(result.grossAmount).toBe(1150000);
    expect(result.totalDeductions).toBe(25000);
    expect(result.netAmount).toBe(1125000);
  });

  it('percentage components sum exactly with no residual paisa', () => {
    const result = calc.calculate({
      components: [
        basic(1000000),
        {
          code: 'HRA',
          name: 'HRA',
          componentType: 'earning',
          calculationType: 'percentage_of_basic',
          value: 33.3333,
        },
      ],
      workingDays: 22,
      presentDays: 22,
      absentDays: 0,
      unpaidLeaveDays: 0,
    });
    const earnings = result.lines
      .filter((l) => l.componentType === 'earning')
      .reduce((s, l) => s + l.amount, 0);
    expect(earnings).toBe(result.grossAmount);
  });
});

describe('StatutoryDeductionService pure math', () => {
  const statutory = new StatutoryDeductionService({} as never);
  const slabs: TaxSlab[] = [
    { upTo: 35000000, ratePercent: 0 },
    { upTo: 45000000, ratePercent: 5 },
    { upTo: 75000000, ratePercent: 10 },
    { upTo: null, ratePercent: 20 },
  ];

  it('taxes exactly at slab edge and one paisa above', () => {
    const atEdge = statutory.computeIncomeTaxAnnual(35000000, slabs);
    const above = statutory.computeIncomeTaxAnnual(35000001, slabs);
    expect(atEdge).toBe(0);
    expect(above).toBe(Math.round(1 * 0.05));
  });

  it('applies PF at ceiling and below', () => {
    expect(statutory.computePf(4000000, 10, 5000000)).toBe(400000);
    expect(statutory.computePf(6000000, 10, 5000000)).toBe(500000);
  });

  it('monthly tax is annual / 12', () => {
    const annual = statutory.computeIncomeTaxAnnual(50000000, slabs);
    expect(statutory.computeIncomeTaxMonthly(50000000, slabs)).toBe(
      Math.round(annual / 12),
    );
  });
});
