import { GratuityCalculationService } from './gratuity-calculation.service';

describe('GratuityCalculationService', () => {
  const calc = new GratuityCalculationService();

  it('detects eligibility around 5-year threshold', () => {
    expect(
      calc.isEligible({
        yearsOfService: 4.99,
        minServiceYears: 5,
        employmentType: 'permanent',
        applicableEmploymentTypes: ['permanent'],
      }),
    ).toBe(false);
    expect(
      calc.isEligible({
        yearsOfService: 5.0,
        minServiceYears: 5,
        employmentType: 'permanent',
        applicableEmploymentTypes: ['permanent'],
      }),
    ).toBe(true);
    expect(
      calc.isEligible({
        yearsOfService: 5.01,
        minServiceYears: 5,
        employmentType: 'contractual',
        applicableEmploymentTypes: ['permanent'],
      }),
    ).toBe(false);
  });

  it('computes entitlement formula examples', () => {
    expect(
      calc.entitlement({
        salaryBasisAmount: 5000000,
        daysPerYearOfService: 15,
        yearsOfService: 5,
      }),
    ).toBe(Math.round((5000000 / 30) * 15 * 5));

    expect(
      calc.entitlement({
        salaryBasisAmount: 6000000,
        daysPerYearOfService: 22,
        yearsOfService: 10,
        maxYearsCounted: 8,
      }),
    ).toBe(Math.round((6000000 / 30) * 22 * 8));
  });

  it('caps at max_years_counted', () => {
    const uncapped = calc.entitlement({
      salaryBasisAmount: 3000000,
      daysPerYearOfService: 15,
      yearsOfService: 25,
    });
    const capped = calc.entitlement({
      salaryBasisAmount: 3000000,
      daysPerYearOfService: 15,
      yearsOfService: 25,
      maxYearsCounted: 20,
    });
    expect(capped).toBeLessThan(uncapped);
  });

  it('proration monthly vs daily vs none differ', () => {
    const join = new Date('2020-01-15T00:00:00Z');
    const asOf = new Date('2025-06-20T00:00:00Z');
    const monthly = calc.yearsOfService({
      joiningDate: join,
      asOfDate: asOf,
      prorationMethod: 'monthly',
    });
    const daily = calc.yearsOfService({
      joiningDate: join,
      asOfDate: asOf,
      prorationMethod: 'daily',
    });
    const none = calc.yearsOfService({
      joiningDate: join,
      asOfDate: asOf,
      prorationMethod: 'none',
    });
    expect(monthly).not.toBe(daily);
    expect(none).toBe(5);
    expect(monthly).toBeGreaterThan(5);
  });

  it('LWP beyond threshold reduces service years', () => {
    const join = new Date('2020-01-01T00:00:00Z');
    const asOf = new Date('2025-01-01T00:00:00Z');
    const base = calc.yearsOfService({
      joiningDate: join,
      asOfDate: asOf,
      prorationMethod: 'daily',
      lwpDaysExcluded: 0,
      lwpExclusionThresholdDays: 30,
    });
    const reduced = calc.yearsOfService({
      joiningDate: join,
      asOfDate: asOf,
      prorationMethod: 'daily',
      lwpDaysExcluded: 100,
      lwpExclusionThresholdDays: 30,
    });
    expect(reduced).toBeLessThan(base);
    expect(base - reduced).toBeCloseTo(70 / 365, 2);
  });

  it('salary basis basic vs allowances vs gross', () => {
    expect(
      calc.resolveSalaryBasis({
        salaryBasis: 'basic',
        basicAmount: 30000,
        allowanceAmounts: [5000, 2000],
        grossAmount: 45000,
      }),
    ).toBe(30000);
    expect(
      calc.resolveSalaryBasis({
        salaryBasis: 'basic_plus_allowances',
        basicAmount: 30000,
        allowanceAmounts: [5000, 2000],
        grossAmount: 45000,
      }),
    ).toBe(37000);
    expect(
      calc.resolveSalaryBasis({
        salaryBasis: 'gross',
        basicAmount: 30000,
        allowanceAmounts: [5000],
        grossAmount: 45000,
      }),
    ).toBe(45000);
  });

  it('handles leap-year and month-end joining without off-by-one', () => {
    const leapJoin = new Date('2020-02-29T00:00:00Z');
    const asOf = new Date('2024-02-28T00:00:00Z');
    const years = calc.yearsOfService({
      joiningDate: leapJoin,
      asOfDate: asOf,
      prorationMethod: 'monthly',
    });
    expect(years).toBeGreaterThanOrEqual(3.9);
    expect(years).toBeLessThan(4.1);

    const monthEnd = calc.yearsOfService({
      joiningDate: new Date('2021-01-31T00:00:00Z'),
      asOfDate: new Date('2022-01-31T00:00:00Z'),
      prorationMethod: 'monthly',
    });
    expect(monthEnd).toBe(1);
  });
});
