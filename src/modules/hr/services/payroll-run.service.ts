import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { AccountsService } from '../../accounts/services/accounts.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { HrCalendarService } from './hr-calendar.service';
import {
  PayrollCalculationService,
  ComponentSnapshot,
  AdjustmentSnapshot,
} from './payroll-calculation.service';
import { StatutoryDeductionService } from './salary-structure.service';
import { BankTransferFileService } from './bank-transfer-file.service';

function costCenterForDepartment(dept: string): string {
  if (dept === 'school') return 'school';
  if (dept === 'therapy') return 'therapy';
  return 'admin';
}

@Injectable()
export class PayrollRunService {
  private readonly logger = new Logger(PayrollRunService.name);
  private readonly calculator = new PayrollCalculationService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerPort,
    private readonly calendar: HrCalendarService,
    private readonly statutory: StatutoryDeductionService,
    private readonly bankFiles: BankTransferFileService,
    @InjectQueue('payroll') private readonly payrollQueue: Queue,
    @Optional() @InjectQueue('pdf') private readonly pdfQueue?: Queue,
  ) {}

  listRuns(filters?: { year?: number; month?: number; status?: string }) {
    return this.prisma.payrollRun.findMany({
      where: {
        periodYear: filters?.year,
        periodMonth: filters?.month,
        status: filters?.status as never,
      },
      orderBy: [
        { periodYear: 'desc' },
        { periodMonth: 'desc' },
        { runNumber: 'desc' },
      ],
      include: { payrollGroup: true },
    });
  }

  async getRun(id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        payrollGroup: true,
        slips: { include: { lines: true, employee: { include: { department: true } } } },
      },
    });
    if (!run) throw DomainException.notFound('Payroll run not found');
    return run;
  }

  async createRun(
    input: {
      payrollGroupId: string;
      periodMonth: number;
      periodYear: number;
      notes?: string;
      /** When false, leaves run in `draft` for synchronous `performCalculation` (tests). */
      enqueue?: boolean;
    },
    actorId: string,
  ) {
    const group = await this.prisma.payrollGroup.findUnique({
      where: { id: input.payrollGroupId },
    });
    if (!group) throw DomainException.notFound('Payroll group not found');

    const allRuns = await this.prisma.payrollRun.findMany({
      where: {
        payrollGroupId: input.payrollGroupId,
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
      },
      orderBy: { runNumber: 'desc' },
    });
    const existing = allRuns.filter((r) => r.status !== 'cancelled');
    if (existing.some((r) => r.status === 'locked' || r.status === 'paid')) {
      // supplementary run allowed as next run number
    } else if (
      existing.some((r) =>
        ['draft', 'calculating', 'calculated', 'approved'].includes(r.status),
      )
    ) {
      throw DomainException.withCode(
        ErrorCode.PAYROLL_RUN_EXISTS,
        409,
        'An open payroll run already exists for this period',
      );
    }
    const runNumber = (allRuns[0]?.runNumber ?? 0) + 1;

    const run = await this.prisma.payrollRun.create({
      data: {
        payrollGroupId: input.payrollGroupId,
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
        runNumber,
        status: 'draft',
        notes: input.notes,
      },
    });

    await this.events.emitAsync(EventNames.PAYROLL_RUN_CREATED, {
      payrollRunId: run.id,
      actorId,
    });

    if (input.enqueue === false) {
      return run;
    }

    await this.payrollQueue.add('calculate', { payrollRunId: run.id });
    await this.prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'calculating' },
    });
    return this.getRun(run.id);
  }

  async recalculate(runId: string) {
    const run = await this.requireMutable(runId);
    if (!['draft', 'calculated', 'calculating'].includes(run.status)) {
      throw DomainException.conflict(
        'Run cannot be recalculated in current status',
      );
    }
    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'calculating' },
    });
    await this.payrollQueue.add('calculate', { payrollRunId: runId });
    return this.getRun(runId);
  }

  /** Idempotent calculation — replaces slips wholesale. */
  async performCalculation(runId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { payrollGroup: true },
    });
    if (!run) throw DomainException.notFound('Payroll run not found');
    if (['locked', 'paid', 'cancelled'].includes(run.status)) {
      throw DomainException.withCode(
        ErrorCode.PAYROLL_LOCKED,
        409,
        'Payroll run is immutable',
      );
    }

    const periodStart = new Date(
      Date.UTC(run.periodYear, run.periodMonth - 1, 1),
    );
    const periodEnd = new Date(Date.UTC(run.periodYear, run.periodMonth, 0));
    const org = await this.prisma.organizationSettings.findFirst();
    const defaultWorkingDays = org?.payrollDefaultWorkingDays ?? 22;

    let workingDays = defaultWorkingDays;
    try {
      workingDays = await this.calendar.countWorkingDays(
        periodStart,
        periodEnd,
      );
      if (workingDays <= 0) workingDays = defaultWorkingDays;
    } catch {
      workingDays = defaultWorkingDays;
    }

    const structures = await this.prisma.salaryStructure.findMany({
      where: {
        payrollGroupId: run.payrollGroupId,
        status: 'active',
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
      },
      include: {
        employee: true,
        lines: { include: { salaryComponent: true } },
      },
    });

    // One structure per employee (defensive if overlapping actives exist)
    const seenEmployees = new Set<string>();
    const uniqueStructures = structures.filter((s) => {
      if (seenEmployees.has(s.employeeId)) return false;
      seenEmployees.add(s.employeeId);
      return true;
    });

    const taxSetting = await this.statutory.resolveActive(
      'income_tax',
      periodEnd,
    );
    const pfSetting = await this.statutory.resolveActive(
      'provident_fund',
      periodEnd,
    );
    const taxSlabs =
      (taxSetting?.slabs as { upTo: number | null; ratePercent: number }[]) ??
      [];

    const results: Array<{
      employeeId: string;
      calc: ReturnType<PayrollCalculationService['calculate']>;
    }> = [];

    for (const structure of uniqueStructures) {
      const emp = structure.employee;
      if (['resigned', 'terminated', 'retired'].includes(emp.status)) {
        const exit = await this.prisma.employeeExit.findUnique({
          where: { employeeId: emp.id },
        });
        if (exit && exit.lastWorkingDay < periodStart) continue;
      }

      const attendance = await this.prisma.hrAttendance.findMany({
        where: {
          employeeId: emp.id,
          attendanceDate: { gte: periodStart, lte: periodEnd },
        },
      });
      const presentDays = attendance.filter((a) =>
        ['present', 'late', 'half_day'].includes(a.status),
      ).length;
      const absentDays = attendance.filter((a) => a.status === 'absent').length;
      const leaveDays = attendance.filter((a) => a.status === 'leave').length;
      const overtimeMinutes = attendance.reduce(
        (s, a) => s + a.overtimeMinutes,
        0,
      );

      // Approximate unpaid leave as leave days on unpaid types — simplified: treat all leave as paid unless absent
      const unpaidLeaveDays = 0;
      const paidLeaveDays = leaveDays;

      let daysInPeriod = workingDays;
      if (emp.joiningDate > periodStart) {
        const joinDay = emp.joiningDate.getUTCDate();
        daysInPeriod = Math.max(1, periodEnd.getUTCDate() - joinDay + 1);
      }
      const exit = await this.prisma.employeeExit.findUnique({
        where: { employeeId: emp.id },
      });
      if (
        exit &&
        exit.lastWorkingDay >= periodStart &&
        exit.lastWorkingDay < periodEnd
      ) {
        daysInPeriod = Math.min(daysInPeriod, exit.lastWorkingDay.getUTCDate());
      }

      const components: ComponentSnapshot[] = structure.lines.map((l) => ({
        id: l.salaryComponentId,
        code: l.salaryComponent.code,
        name: l.salaryComponent.name,
        componentType: l.salaryComponent.componentType,
        calculationType: l.salaryComponent.calculationType,
        value: Number(l.overrideValue ?? l.salaryComponent.value),
        overrideAmount:
          l.salaryComponent.calculationType === 'fixed' ? l.amount : null,
        coaAccountCode: l.salaryComponent.coaAccountCode,
      }));

      const basicLine = structure.lines.find(
        (l) => l.salaryComponent.code === 'BASIC',
      );
      const basicAmount = basicLine?.amount ?? emp.basicSalary;

      const pfEmployee =
        pfSetting != null
          ? this.statutory.computePf(
              basicAmount,
              Number(pfSetting.employeeRatePercent ?? 0),
              pfSetting.ceilingAmount,
            )
          : 0;
      const pfEmployer =
        pfSetting != null
          ? this.statutory.computePf(
              basicAmount,
              Number(pfSetting.employerRatePercent ?? 0),
              pfSetting.ceilingAmount,
            )
          : 0;
      const annualTaxable = basicAmount * 12;
      const incomeTax =
        taxSlabs.length > 0
          ? this.statutory.computeIncomeTaxMonthly(annualTaxable, taxSlabs)
          : 0;

      // PR-12: pull due loan installments into pending payroll_adjustments
      const dueRepayments = await this.prisma.loanRepayment.findMany({
        where: {
          dueMonth: run.periodMonth,
          dueYear: run.periodYear,
          status: { in: ['scheduled', 'overdue'] },
          loan: {
            employeeId: emp.id,
            status: { in: ['disbursed', 'repaying'] },
          },
        },
      });
      for (const repayment of dueRepayments) {
        const existingAdj = await this.prisma.payrollAdjustment.findFirst({
          where: {
            sourceType: 'loan_repayment',
            sourceId: repayment.id,
            status: { in: ['pending', 'applied'] },
          },
        });
        if (!existingAdj) {
          await this.prisma.payrollAdjustment.create({
            data: {
              employeeId: emp.id,
              periodMonth: run.periodMonth,
              periodYear: run.periodYear,
              adjustmentType: 'deduction',
              label: `Loan installment #${repayment.installmentNumber}`,
              amount: repayment.scheduledAmount,
              sourceType: 'loan_repayment',
              sourceId: repayment.id,
              status: 'pending',
            },
          });
        }
      }

      const adjustmentsDb = await this.prisma.payrollAdjustment.findMany({
        where: {
          employeeId: emp.id,
          periodMonth: run.periodMonth,
          periodYear: run.periodYear,
          status: 'pending',
        },
      });
      const bonuses = await this.prisma.bonus.findMany({
        where: {
          employeeId: emp.id,
          applicableMonth: run.periodMonth,
          applicableYear: run.periodYear,
          status: 'approved',
        },
      });

      const adjustments: AdjustmentSnapshot[] = [
        ...adjustmentsDb.map((a) => ({
          label: a.label,
          adjustmentType: a.adjustmentType,
          amount: a.amount,
          sourceType: a.sourceType,
        })),
        ...bonuses.map((b) => ({
          label: `Bonus: ${b.bonusType}`,
          adjustmentType: 'addition' as const,
          amount: b.amount,
          sourceType: 'manual',
        })),
      ];

      const calc = this.calculator.calculate({
        components,
        workingDays,
        presentDays,
        absentDays,
        unpaidLeaveDays,
        paidLeaveDays,
        overtimeMinutes,
        daysInPeriod,
        adjustments,
        incomeTaxAmount: incomeTax,
        pfEmployeeAmount: pfEmployee,
        pfEmployerAmount: pfEmployer,
      });

      results.push({ employeeId: emp.id, calc });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.loanRepayment.updateMany({
        where: { payrollSlip: { payrollRunId: runId } },
        data: { payrollSlipId: null },
      });
      await tx.payrollSlipLine.deleteMany({
        where: { payrollSlip: { payrollRunId: runId } },
      });
      await tx.payrollSlip.deleteMany({ where: { payrollRunId: runId } });

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      let totalEmployer = 0;

      for (const row of results) {
        const slipNumber = await this.numbering.nextCode('payroll_slip', tx);
        const slip = await tx.payrollSlip.create({
          data: {
            payrollRunId: runId,
            employeeId: row.employeeId,
            slipNumber,
            workingDays: row.calc.workingDays,
            presentDays: row.calc.presentDays,
            absentDays: row.calc.absentDays,
            leaveDays: row.calc.leaveDays,
            lopDays: row.calc.lopDays,
            overtimeMinutes: row.calc.overtimeMinutes,
            grossAmount: row.calc.grossAmount,
            totalDeductions: row.calc.totalDeductions,
            netAmount: row.calc.netAmount,
            lines: {
              create: row.calc.lines.map((l) => ({
                salaryComponentId: l.salaryComponentId,
                componentName: l.componentName,
                componentType: l.componentType,
                amount: l.amount,
                calculationNote: l.calculationNote,
              })),
            },
          },
        });
        totalGross += row.calc.grossAmount;
        totalDeductions += row.calc.totalDeductions;
        totalNet += row.calc.netAmount;
        totalEmployer += row.calc.totalEmployerContribution;

        await tx.payrollAdjustment.updateMany({
          where: {
            employeeId: row.employeeId,
            periodMonth: run.periodMonth,
            periodYear: run.periodYear,
            status: 'pending',
          },
          data: { status: 'applied', appliedPayrollRunId: runId },
        });
        await tx.bonus.updateMany({
          where: {
            employeeId: row.employeeId,
            applicableMonth: run.periodMonth,
            applicableYear: run.periodYear,
            status: 'approved',
          },
          data: { status: 'paid', payrollRunId: runId },
        });

        const loanAdjustments = await tx.payrollAdjustment.findMany({
          where: {
            employeeId: row.employeeId,
            periodMonth: run.periodMonth,
            periodYear: run.periodYear,
            sourceType: 'loan_repayment',
            appliedPayrollRunId: runId,
            sourceId: { not: null },
          },
        });
        for (const adj of loanAdjustments) {
          if (!adj.sourceId) continue;
          const repayment = await tx.loanRepayment.findUnique({
            where: { id: adj.sourceId },
          });
          if (!repayment || repayment.status === 'deducted') continue;
          await tx.loanRepayment.update({
            where: { id: repayment.id },
            data: {
              status: 'deducted',
              paidAmount: adj.amount,
              payrollSlipId: slip.id,
              deductedAt: new Date(),
            },
          });
          const loan = await tx.employeeLoan.findUnique({
            where: { id: repayment.loanId },
          });
          if (loan) {
            const outstanding = Math.max(
              0,
              loan.outstandingAmount - adj.amount,
            );
            await tx.employeeLoan.update({
              where: { id: loan.id },
              data: {
                outstandingAmount: outstanding,
                status: outstanding === 0 ? 'closed' : 'repaying',
              },
            });
          }
        }
      }

      await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'calculated',
          calculatedAt: new Date(),
          employeeCount: results.length,
          totalGross,
          totalDeductions,
          totalNet,
          totalEmployerContribution: totalEmployer,
        },
      });
    });

    await this.events.emitAsync(EventNames.PAYROLL_RUN_CALCULATED, {
      payrollRunId: runId,
    });
    return this.getRun(runId);
  }

  async approve(runId: string, actorId: string) {
    const run = await this.requireMutable(runId);
    if (run.status !== 'calculated') {
      throw DomainException.conflict('Only calculated runs can be approved');
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'approved', approvedBy: actorId, approvedAt: new Date() },
    });
    await this.events.emitAsync(EventNames.PAYROLL_RUN_APPROVED, {
      payrollRunId: runId,
      actorId,
    });
    return updated;
  }

  async lock(runId: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        slips: {
          include: {
            lines: true,
            employee: { include: { department: true } },
          },
        },
      },
    });
    if (!run) throw DomainException.notFound('Payroll run not found');
    if (run.status === 'locked' || run.status === 'paid') {
      throw DomainException.withCode(
        ErrorCode.PAYROLL_LOCKED,
        409,
        'Already locked',
      );
    }
    if (run.status !== 'approved') {
      throw DomainException.withCode(
        ErrorCode.RUN_NOT_APPROVED,
        409,
        'Run must be approved before lock',
      );
    }

    const entryDate = new Date(Date.UTC(run.periodYear, run.periodMonth, 0));

    // Aggregate expense by coa code + cost center; credits for net/tax/pf/loan
    const expenseBuckets = new Map<string, number>();
    let totalNet = 0;
    let totalTax = 0;
    let totalPf = 0;
    let totalEmployerPf = 0;
    let totalLoanRecovery = 0;
    let totalLop = 0;

    for (const slip of run.slips) {
      const cc = costCenterForDepartment(slip.employee.department.code);
      totalNet += slip.netAmount;
      for (const line of slip.lines) {
        if (line.componentType === 'earning') {
          const comp = line.salaryComponentId
            ? await this.prisma.salaryComponent.findUnique({
                where: { id: line.salaryComponentId },
              })
            : null;
          const code = comp?.coaAccountCode ?? '5010';
          const key = `${code}|${cc}`;
          expenseBuckets.set(key, (expenseBuckets.get(key) ?? 0) + line.amount);
        } else if (line.componentType === 'deduction') {
          if (line.componentName === 'Loss of Pay') {
            totalLop += line.amount;
            continue;
          }
          if (
            line.componentName.startsWith('Loan installment') ||
            line.calculationNote === 'loan_repayment'
          ) {
            totalLoanRecovery += line.amount;
            continue;
          }
          const comp = line.salaryComponentId
            ? await this.prisma.salaryComponent.findUnique({
                where: { id: line.salaryComponentId },
              })
            : null;
          if (comp?.code === 'TAX') totalTax += line.amount;
          else if (comp?.code === 'PF_EE') totalPf += line.amount;
          else if (!comp) {
            // Other ad-hoc deductions (advances etc.) reduce net; credit receivable clearing
            totalLoanRecovery += line.amount;
          }
        } else if (line.componentType === 'employer_contribution') {
          totalEmployerPf += line.amount;
          const comp = line.salaryComponentId
            ? await this.prisma.salaryComponent.findUnique({
                where: { id: line.salaryComponentId },
              })
            : null;
          const code = comp?.coaAccountCode ?? '5010';
          const cc2 = costCenterForDepartment(slip.employee.department.code);
          const key = `${code}|${cc2}`;
          expenseBuckets.set(key, (expenseBuckets.get(key) ?? 0) + line.amount);
        }
      }
    }

    // LOP reduces salary expense so DR = net + statutory + loan recovery (+ employer)
    if (totalLop > 0) {
      const firstKey = [...expenseBuckets.keys()][0] ?? '5010|admin';
      expenseBuckets.set(
        firstKey,
        Math.max(0, (expenseBuckets.get(firstKey) ?? 0) - totalLop),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const accountByCode = async (code: string) => {
        const a = await tx.chartOfAccount.findUnique({
          where: { accountCode: code },
        });
        if (!a) {
          throw DomainException.withCode(
            ErrorCode.INVALID_ACCOUNT,
            422,
            `Account ${code} not found`,
          );
        }
        return a;
      };

      const lines: {
        accountId: string;
        debitAmount: number;
        creditAmount: number;
        costCenter?: string;
        narration?: string;
      }[] = [];

      for (const [key, amount] of expenseBuckets) {
        if (amount <= 0) continue;
        const [code, cc] = key.split('|');
        const acct = await accountByCode(code);
        lines.push({
          accountId: acct.id,
          debitAmount: amount,
          creditAmount: 0,
          costCenter: cc,
          narration: 'Salary expense',
        });
      }

      if (totalNet > 0) {
        const netAcct = await accountByCode('2110');
        lines.push({
          accountId: netAcct.id,
          debitAmount: 0,
          creditAmount: totalNet,
          costCenter: 'admin',
          narration: 'Net salary payable',
        });
      }
      if (totalTax > 0) {
        const taxAcct = await accountByCode('2120');
        lines.push({
          accountId: taxAcct.id,
          debitAmount: 0,
          creditAmount: totalTax,
          costCenter: 'admin',
          narration: 'Income tax payable',
        });
      }
      const pfCredit = totalPf + totalEmployerPf;
      if (pfCredit > 0) {
        const pfAcct = await accountByCode('2130');
        lines.push({
          accountId: pfAcct.id,
          debitAmount: 0,
          creditAmount: pfCredit,
          costCenter: 'admin',
          narration: 'PF payable',
        });
      }
      if (totalLoanRecovery > 0) {
        const loanAcct = await accountByCode('1310');
        lines.push({
          accountId: loanAcct.id,
          debitAmount: 0,
          creditAmount: totalLoanRecovery,
          costCenter: 'admin',
          narration: 'Loan / advance recovery',
        });
      }

      const journal = await this.accounts.createPostedJournal(
        {
          entryDate,
          entryType: 'system',
          description: `Payroll ${run.periodYear}-${String(run.periodMonth).padStart(2, '0')} run #${run.runNumber}`,
          lines,
          referenceType: 'payroll_run',
          referenceId: runId,
          idempotencyReference: `payroll_run:${runId}:lock`,
          postedBy: actorId,
        },
        tx,
      );

      await tx.apLedger.create({
        data: {
          partyType: 'employee',
          partyId: run.payrollGroupId,
          sourceType: 'payroll',
          sourceId: runId,
          invoiceNumber: `PAY-${run.periodYear}${String(run.periodMonth).padStart(2, '0')}-${run.runNumber}`,
          invoiceDate: entryDate,
          dueDate: entryDate,
          grossAmount: totalNet,
          outstandingAmount: totalNet,
          costCenter: 'admin',
        },
      });

      await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'locked',
          lockedAt: new Date(),
          lockedBy: actorId,
          journalId: journal.id,
        },
      });

      await tx.encashmentRequest.updateMany({
        where: {
          status: 'approved',
          payrollAdjustmentId: { not: null },
          payrollRunId: null,
        },
        data: {
          payrollRunId: runId,
          status: 'processed',
          processedAt: new Date(),
        },
      });
    });

    await this.events.emitAsync(EventNames.PAYROLL_RUN_COMPLETED, {
      payrollRunId: runId,
      actorId,
    });
    await this.events.emitAsync(EventNames.PAYSLIP_PUBLISHED, {
      payrollRunId: runId,
    });

    if (this.pdfQueue) {
      for (const slip of run.slips) {
        await this.pdfQueue.add(
          'render-payslip',
          { slipId: slip.id },
          { jobId: `payslip-${slip.id}`, removeOnComplete: true },
        );
      }
    }

    return this.getRun(runId);
  }

  async cancel(runId: string) {
    await this.requireMutable(runId);
    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'cancelled' },
    });
  }

  async markPaid(
    runId: string,
    actorId: string,
    method: 'bank_transfer' | 'cash' = 'bank_transfer',
  ) {
    const run = await this.getRun(runId);
    if (run.status !== 'locked') {
      throw DomainException.withCode(
        ErrorCode.PAYROLL_NOT_LOCKED,
        409,
        'Run must be locked before mark-paid',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.post(
        {
          referenceType: 'payroll_paid',
          referenceId: runId,
          amount: run.totalNet,
          costCenter: 'admin',
          description: `Payroll disbursement ${run.periodYear}-${run.periodMonth}`,
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: new Date(),
          payload: { variant: method },
        },
        tx,
      );
      await tx.payrollSlip.updateMany({
        where: { payrollRunId: runId, paymentStatus: 'pending' },
        data: { paymentStatus: 'paid', paidAt: new Date() },
      });
      await tx.payrollRun.update({
        where: { id: runId },
        data: { status: 'paid' },
      });
    });
    await this.events.emitAsync(EventNames.PAYROLL_RUN_PAID, {
      payrollRunId: runId,
      actorId,
    });
    return this.getRun(runId);
  }

  async bankFile(runId: string) {
    const run = await this.getRun(runId);
    if (!['locked', 'paid'].includes(run.status)) {
      throw DomainException.withCode(
        ErrorCode.PAYROLL_NOT_LOCKED,
        409,
        'Bank file requires a locked run',
      );
    }
    const content = await this.bankFiles.generate(runId);
    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        bankFileChecksum: content.checksum,
        bankFileObjectKey: content.objectKey,
      },
    });
    return content;
  }

  private async requireMutable(runId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw DomainException.notFound('Payroll run not found');
    if (['locked', 'paid'].includes(run.status)) {
      throw DomainException.withCode(
        ErrorCode.PAYROLL_LOCKED,
        409,
        'Payroll run is immutable',
      );
    }
    return run;
  }
}
