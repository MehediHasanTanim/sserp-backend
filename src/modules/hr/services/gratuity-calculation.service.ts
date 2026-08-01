/**
 * Pure gratuity calculator — no DB, clock, or config access.
 * entitlement = salary_basis ÷ 30 × days_per_year × min(years, max_years)
 */
export class GratuityCalculationService {
  /**
   * Exact years with fractional months based on proration method.
   * LWP days beyond threshold reduce service (converted to fractional years / 365).
   */
  yearsOfService(input: {
    joiningDate: Date;
    asOfDate: Date;
    prorationMethod: 'monthly' | 'daily' | 'none';
    lwpDaysExcluded?: number;
    lwpExclusionThresholdDays?: number;
  }): number {
    const join = startOfUtcDay(input.joiningDate);
    const asOf = startOfUtcDay(input.asOfDate);
    if (asOf < join) return 0;

    let years: number;
    if (input.prorationMethod === 'none') {
      years = asOf.getUTCFullYear() - join.getUTCFullYear();
      if (
        asOf.getUTCMonth() < join.getUTCMonth() ||
        (asOf.getUTCMonth() === join.getUTCMonth() &&
          asOf.getUTCDate() < join.getUTCDate())
      ) {
        years -= 1;
      }
      years = Math.max(0, years);
    } else if (input.prorationMethod === 'daily') {
      const ms = asOf.getTime() - join.getTime();
      years = ms / (365.25 * 24 * 60 * 60 * 1000);
    } else {
      // monthly
      let months =
        (asOf.getUTCFullYear() - join.getUTCFullYear()) * 12 +
        (asOf.getUTCMonth() - join.getUTCMonth());
      if (asOf.getUTCDate() < join.getUTCDate()) months -= 1;
      years = Math.max(0, months) / 12;
    }

    const threshold = input.lwpExclusionThresholdDays ?? 30;
    const lwp = input.lwpDaysExcluded ?? 0;
    if (lwp > threshold) {
      years -= (lwp - threshold) / 365;
    }
    return Math.max(0, round3(years));
  }

  isEligible(input: {
    yearsOfService: number;
    minServiceYears: number;
    employmentType: string;
    applicableEmploymentTypes: string[];
  }): boolean {
    return (
      input.yearsOfService >= input.minServiceYears &&
      input.applicableEmploymentTypes.includes(input.employmentType)
    );
  }

  entitlement(input: {
    salaryBasisAmount: number;
    daysPerYearOfService: number;
    yearsOfService: number;
    maxYearsCounted?: number | null;
  }): number {
    const years = Math.min(
      input.yearsOfService,
      input.maxYearsCounted ?? input.yearsOfService,
    );
    if (years <= 0 || input.salaryBasisAmount <= 0) return 0;
    return Math.round(
      (input.salaryBasisAmount / 30) * input.daysPerYearOfService * years,
    );
  }

  resolveSalaryBasis(input: {
    salaryBasis: 'basic' | 'basic_plus_allowances' | 'gross';
    basicAmount: number;
    allowanceAmounts: number[];
    grossAmount: number;
  }): number {
    switch (input.salaryBasis) {
      case 'basic':
        return input.basicAmount;
      case 'basic_plus_allowances':
        return (
          input.basicAmount + input.allowanceAmounts.reduce((s, a) => s + a, 0)
        );
      case 'gross':
        return input.grossAmount;
      default:
        return input.basicAmount;
    }
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
