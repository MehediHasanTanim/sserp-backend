import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';

export type ComponentType = 'earning' | 'deduction' | 'employer_contribution';
export type CalculationType =
  | 'fixed'
  | 'percentage_of_basic'
  | 'percentage_of_gross'
  | 'formula'
  | 'attendance_based';

export interface ComponentSnapshot {
  id?: string;
  code: string;
  name: string;
  componentType: ComponentType;
  calculationType: CalculationType;
  /** Fixed amount (paisa) or percentage value depending on calculationType */
  value: number;
  overrideAmount?: number | null;
  coaAccountCode?: string;
}

export interface AdjustmentSnapshot {
  label: string;
  adjustmentType: 'addition' | 'deduction';
  amount: number;
  sourceType?: string;
}

export interface PayrollCalcInput {
  components: ComponentSnapshot[];
  workingDays: number;
  presentDays: number;
  absentDays: number;
  unpaidLeaveDays: number;
  paidLeaveDays?: number;
  overtimeMinutes?: number;
  overtimeRatePerHour?: number;
  /** Calendar days the employee is on payroll this period (mid-month join/exit). */
  daysInPeriod?: number;
  adjustments?: AdjustmentSnapshot[];
  /** Pre-computed statutory tax amount for the month (paisa). */
  incomeTaxAmount?: number;
  /** Pre-computed PF employee deduction (paisa). */
  pfEmployeeAmount?: number;
  /** Pre-computed PF employer contribution (paisa). */
  pfEmployerAmount?: number;
}

export interface PayrollLineResult {
  salaryComponentId?: string;
  componentName: string;
  componentType: ComponentType;
  amount: number;
  calculationNote?: string;
  coaAccountCode?: string;
}

export interface PayrollCalcResult {
  workingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  lopDays: number;
  overtimeMinutes: number;
  grossAmount: number;
  totalDeductions: number;
  netAmount: number;
  totalEmployerContribution: number;
  lines: PayrollLineResult[];
}

/**
 * Pure payroll calculator — no DB, clock, or config access.
 * Gross = Σ earnings; Net = gross − Σ deductions; employer contributions excluded from net.
 */
export class PayrollCalculationService {
  calculate(input: PayrollCalcInput): PayrollCalcResult {
    const workingDays = input.workingDays;
    if (workingDays <= 0) {
      throw DomainException.validation('workingDays must be positive');
    }

    const lopDays = input.absentDays + input.unpaidLeaveDays;
    const leaveDays = (input.paidLeaveDays ?? 0) + input.unpaidLeaveDays;
    const daysInPeriod = input.daysInPeriod ?? workingDays;
    const attendanceFactor = Math.min(1, daysInPeriod / workingDays);

    const basicComp = input.components.find((c) => c.code === 'BASIC');
    const basicAmount =
      basicComp?.overrideAmount ??
      (basicComp?.calculationType === 'fixed' ? basicComp.value : 0);

    // Pass 1: fixed + percentage_of_basic earnings (pre-gross)
    const pass1: PayrollLineResult[] = [];
    let grossPass1 = 0;

    for (const c of input.components) {
      if (c.componentType !== 'earning') continue;
      if (
        c.calculationType !== 'fixed' &&
        c.calculationType !== 'percentage_of_basic'
      ) {
        continue;
      }
      let amount = this.resolveAmount(c, basicAmount, 0);
      amount = Math.round(amount * attendanceFactor);
      pass1.push({
        salaryComponentId: c.id,
        componentName: c.name,
        componentType: c.componentType,
        amount,
        calculationNote: `${c.calculationType}${attendanceFactor < 1 ? `; prorated ×${attendanceFactor.toFixed(4)}` : ''}`,
        coaAccountCode: c.coaAccountCode,
      });
      grossPass1 += amount;
    }

    // Pass 2: percentage_of_gross + attendance_based + formula earnings
    const earningLines: PayrollLineResult[] = [...pass1];
    let grossAmount = grossPass1;

    for (const c of input.components) {
      if (c.componentType !== 'earning') continue;
      if (
        c.calculationType === 'fixed' ||
        c.calculationType === 'percentage_of_basic'
      ) {
        continue;
      }
      let amount = this.resolveAmount(c, basicAmount, grossPass1);
      if (c.calculationType === 'attendance_based') {
        amount = Math.round((amount * input.presentDays) / workingDays);
      } else {
        amount = Math.round(amount * attendanceFactor);
      }
      earningLines.push({
        salaryComponentId: c.id,
        componentName: c.name,
        componentType: c.componentType,
        amount,
        calculationNote: c.calculationType,
        coaAccountCode: c.coaAccountCode,
      });
      grossAmount += amount;
    }

    if (input.overtimeMinutes && input.overtimeRatePerHour) {
      const otHours = input.overtimeMinutes / 60;
      const otAmount = Math.round(otHours * input.overtimeRatePerHour);
      if (otAmount > 0) {
        earningLines.push({
          componentName: 'Overtime',
          componentType: 'earning',
          amount: otAmount,
          calculationNote: `${input.overtimeMinutes} minutes`,
        });
        grossAmount += otAmount;
      }
    }

    const lines: PayrollLineResult[] = [...earningLines];
    let totalDeductions = 0;
    let totalEmployerContribution = 0;

    // LOP deduction
    if (lopDays > 0 && grossAmount > 0) {
      const perDay = grossAmount / workingDays;
      const lopAmount = Math.floor(lopDays * perDay);
      if (lopAmount > 0) {
        lines.push({
          componentName: 'Loss of Pay',
          componentType: 'deduction',
          amount: lopAmount,
          calculationNote: `${lopDays} LOP days × ${Math.round(perDay)}/day`,
        });
        totalDeductions += lopAmount;
      }
    }

    // Component deductions (non-statutory formula handled via overrides / statutory inputs)
    for (const c of input.components) {
      if (c.componentType === 'deduction') {
        if (c.code === 'TAX' && input.incomeTaxAmount != null) {
          const amount = input.incomeTaxAmount;
          if (amount > 0) {
            lines.push({
              salaryComponentId: c.id,
              componentName: c.name,
              componentType: 'deduction',
              amount,
              calculationNote: 'statutory income tax',
              coaAccountCode: c.coaAccountCode,
            });
            totalDeductions += amount;
          }
          continue;
        }
        if (c.code === 'PF_EE' && input.pfEmployeeAmount != null) {
          const amount = input.pfEmployeeAmount;
          if (amount > 0) {
            lines.push({
              salaryComponentId: c.id,
              componentName: c.name,
              componentType: 'deduction',
              amount,
              calculationNote: 'statutory PF employee',
              coaAccountCode: c.coaAccountCode,
            });
            totalDeductions += amount;
          }
          continue;
        }
        const amount = Math.round(
          this.resolveAmount(c, basicAmount, grossAmount) * attendanceFactor,
        );
        if (amount > 0) {
          lines.push({
            salaryComponentId: c.id,
            componentName: c.name,
            componentType: 'deduction',
            amount,
            calculationNote: c.calculationType,
            coaAccountCode: c.coaAccountCode,
          });
          totalDeductions += amount;
        }
      } else if (c.componentType === 'employer_contribution') {
        const amount =
          c.code === 'PF_ER' && input.pfEmployerAmount != null
            ? input.pfEmployerAmount
            : Math.round(
                this.resolveAmount(c, basicAmount, grossAmount) *
                  attendanceFactor,
              );
        if (amount > 0) {
          lines.push({
            salaryComponentId: c.id,
            componentName: c.name,
            componentType: 'employer_contribution',
            amount,
            calculationNote: c.calculationType,
            coaAccountCode: c.coaAccountCode,
          });
          totalEmployerContribution += amount;
        }
      }
    }

    for (const adj of input.adjustments ?? []) {
      if (adj.adjustmentType === 'addition') {
        lines.push({
          componentName: adj.label,
          componentType: 'earning',
          amount: adj.amount,
          calculationNote: adj.sourceType ?? 'adjustment',
        });
        grossAmount += adj.amount;
      } else {
        lines.push({
          componentName: adj.label,
          componentType: 'deduction',
          amount: adj.amount,
          calculationNote: adj.sourceType ?? 'adjustment',
        });
        totalDeductions += adj.amount;
      }
    }

    const netAmount = grossAmount - totalDeductions;
    if (netAmount < 0) {
      throw DomainException.withCode(
        ErrorCode.NEGATIVE_NET_PAY,
        422,
        'Net pay may not be negative',
        { grossAmount, totalDeductions, netAmount },
      );
    }

    return {
      workingDays,
      presentDays: input.presentDays,
      absentDays: input.absentDays,
      leaveDays,
      lopDays,
      overtimeMinutes: input.overtimeMinutes ?? 0,
      grossAmount,
      totalDeductions,
      netAmount,
      totalEmployerContribution,
      lines,
    };
  }

  private resolveAmount(
    c: ComponentSnapshot,
    basicAmount: number,
    grossAmount: number,
  ): number {
    if (c.overrideAmount != null) return c.overrideAmount;
    switch (c.calculationType) {
      case 'fixed':
      case 'attendance_based':
      case 'formula':
        return c.value;
      case 'percentage_of_basic':
        return Math.round((basicAmount * c.value) / 100);
      case 'percentage_of_gross':
        return Math.round((grossAmount * c.value) / 100);
      default:
        return 0;
    }
  }
}
