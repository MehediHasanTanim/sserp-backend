import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { GratuityCalculationService } from './gratuity-calculation.service';

function costCenterForDepartment(dept: string): string {
  if (dept === 'school') return 'school';
  if (dept === 'therapy') return 'therapy';
  return 'admin';
}

@Injectable()
export class GratuitySettlementService {
  private readonly calculator = new GratuityCalculationService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerPort,
    private readonly events: EventEmitter2,
  ) {}

  async settle(employeeId: string, actorId: string) {
    const existing = await this.prisma.gratuityPayment.findUnique({
      where: { employeeId },
    });
    if (existing) {
      throw DomainException.withCode(
        ErrorCode.ALREADY_SETTLED,
        409,
        'Gratuity already settled for this employee',
      );
    }

    const exit = await this.prisma.employeeExit.findUnique({
      where: { employeeId },
    });
    if (!exit) {
      throw DomainException.withCode(
        ErrorCode.EXIT_RECORD_MISSING,
        422,
        'Employee exit record is required for settlement',
      );
    }

    const policy = await this.prisma.gratuityPolicy.findFirst({
      where: { isActive: true },
    });
    if (!policy) {
      throw DomainException.unprocessable('No active gratuity policy');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        department: { select: { code: true } },
        salaryStructures: {
          where: { status: 'active' },
          include: { lines: { include: { salaryComponent: true } } },
          take: 1,
        },
      },
    });
    if (!employee) throw DomainException.notFound('Employee not found');

    const asOf = exit.lastWorkingDay;
    const org = await this.prisma.organizationSettings.findFirst();
    const years = this.calculator.yearsOfService({
      joiningDate: employee.joiningDate,
      asOfDate: asOf,
      prorationMethod: policy.prorationMethod,
      lwpExclusionThresholdDays: org?.gratuityLwpExclusionThresholdDays ?? 30,
    });

    const structure = employee.salaryStructures[0];
    const basic =
      structure?.lines.find((l) => l.salaryComponent.code === 'BASIC')
        ?.amount ?? 0;
    const allowances =
      structure?.lines
        .filter(
          (l) =>
            l.salaryComponent.affectsGratuity &&
            l.salaryComponent.code !== 'BASIC' &&
            l.salaryComponent.componentType === 'earning',
        )
        .map((l) => l.amount) ?? [];
    const salaryBasisAmount = this.calculator.resolveSalaryBasis({
      salaryBasis: policy.salaryBasis,
      basicAmount: basic,
      allowanceAmounts: allowances,
      grossAmount: structure?.grossAmount ?? 0,
    });

    const eligible = this.calculator.isEligible({
      yearsOfService: years,
      minServiceYears: Number(policy.minServiceYears),
      employmentType: employee.employmentType,
      applicableEmploymentTypes: policy.applicableEmploymentTypes,
    });
    let grossAmount = eligible
      ? this.calculator.entitlement({
          salaryBasisAmount,
          daysPerYearOfService: Number(policy.daysPerYearOfService),
          yearsOfService: years,
          maxYearsCounted:
            policy.maxYearsCounted != null
              ? Number(policy.maxYearsCounted)
              : null,
        })
      : 0;

    let forfeitedAmount = 0;
    let forfeitureReason: string | null = null;
    if (
      policy.forfeitureOnTermination &&
      policy.forfeitureReasons.includes(exit.exitType)
    ) {
      forfeitedAmount = grossAmount;
      forfeitureReason = exit.exitType;
      grossAmount = 0;
    }

    const loans = await this.prisma.employeeLoan.findMany({
      where: {
        employeeId,
        status: { in: ['disbursed', 'repaying'] },
        outstandingAmount: { gt: 0 },
      },
    });
    const deductionsAmount = loans.reduce((s, l) => s + l.outstandingAmount, 0);
    const deductionDetail = loans.map((l) => ({
      loanId: l.id,
      outstanding: l.outstandingAmount,
    }));

    const priorAgg = await this.prisma.gratuityProvision.aggregate({
      where: { employeeId },
      _sum: { provisionAmount: true },
    });
    const cumulativeProvisionAtExit = priorAgg._sum.provisionAmount ?? 0;
    const afterForfeiture = Math.max(0, grossAmount);
    const netPayable = Math.max(0, afterForfeiture - deductionsAmount);
    const costCenter = costCenterForDepartment(employee.department.code);

    const payment = await this.prisma.$transaction(async (tx) => {
      const row = await tx.gratuityPayment.create({
        data: {
          employeeId,
          policyId: policy.id,
          salaryBasisAmount,
          grossAmount: eligible
            ? this.calculator.entitlement({
                salaryBasisAmount,
                daysPerYearOfService: Number(policy.daysPerYearOfService),
                yearsOfService: years,
                maxYearsCounted:
                  policy.maxYearsCounted != null
                    ? Number(policy.maxYearsCounted)
                    : null,
              })
            : 0,
          forfeitedAmount,
          forfeitureReason,
          deductionsAmount,
          deductionDetail,
          cumulativeProvisionAtExit,
          netPayable,
          approvedBy: actorId,
        },
      });

      let lastBalance =
        (
          await tx.gratuityLedger.findFirst({
            where: { employeeId },
            orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
          })
        )?.runningBalance ?? 0;

      if (forfeitedAmount > 0) {
        lastBalance -= forfeitedAmount;
        await tx.gratuityLedger.create({
          data: {
            employeeId,
            entryDate: asOf,
            entryType: 'forfeiture',
            amount: -forfeitedAmount,
            runningBalance: lastBalance,
            referenceType: 'gratuity_payment',
            referenceId: row.id,
            narration: `Forfeiture: ${forfeitureReason}`,
          },
        });
      }

      if (deductionsAmount > 0) {
        lastBalance -= deductionsAmount;
        await tx.gratuityLedger.create({
          data: {
            employeeId,
            entryDate: asOf,
            entryType: 'payment',
            amount: -deductionsAmount,
            runningBalance: lastBalance,
            referenceType: 'loan_recovery',
            referenceId: row.id,
            narration: 'Outstanding loan recovery from gratuity',
          },
        });
        for (const loan of loans) {
          await tx.employeeLoan.update({
            where: { id: loan.id },
            data: { outstandingAmount: 0, status: 'closed' },
          });
        }
      }

      if (netPayable > 0) {
        lastBalance -= netPayable;
        await tx.gratuityLedger.create({
          data: {
            employeeId,
            entryDate: asOf,
            entryType: 'payment',
            amount: -netPayable,
            runningBalance: lastBalance,
            referenceType: 'gratuity_settlement',
            referenceId: row.id,
            narration: 'Settlement to payable',
          },
        });
      }

      const settlementPost = await this.ledger.post(
        {
          referenceType: 'gratuity_settlement',
          referenceId: row.id,
          amount: Math.max(
            cumulativeProvisionAtExit,
            netPayable + deductionsAmount + forfeitedAmount,
          ),
          costCenter,
          description: `Gratuity settlement ${employee.employeeCode}`,
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: asOf,
          payload: {
            employeeId,
            provisioned: cumulativeProvisionAtExit,
            netPayable,
            forfeitedAmount,
            deductionsAmount,
          },
        },
        tx,
      );

      return tx.gratuityPayment.update({
        where: { id: row.id },
        data: { journalId: settlementPost.journalId },
      });
    });

    await this.events.emitAsync(EventNames.GRATUITY_SETTLED, {
      employeeId,
      paymentId: payment.id,
      netPayable,
      actorId,
    });
    return payment;
  }

  async pay(
    paymentId: string,
    actorId: string,
    method: 'cash' | 'bank_transfer' = 'bank_transfer',
  ) {
    const payment = await this.prisma.gratuityPayment.findUnique({
      where: { id: paymentId },
      include: { employee: true },
    });
    if (!payment) throw DomainException.notFound('Gratuity payment not found');
    if (payment.paidAt) {
      throw DomainException.conflict('Payment already disbursed');
    }
    if (payment.netPayable <= 0) {
      throw DomainException.validation('Nothing to pay');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const posted = await this.ledger.post(
        {
          referenceType: 'gratuity_payment',
          referenceId: payment.id,
          amount: payment.netPayable,
          costCenter: 'admin',
          description: `Gratuity payment ${payment.employee.employeeCode}`,
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: new Date(),
          payload: { variant: method, employeeId: payment.employeeId },
        },
        tx,
      );
      return tx.gratuityPayment.update({
        where: { id: paymentId },
        data: {
          paidAt: new Date(),
          journalId: posted.journalId ?? payment.journalId,
        },
      });
    });

    await this.events.emitAsync(EventNames.GRATUITY_PAID, {
      paymentId,
      employeeId: payment.employeeId,
      actorId,
    });
    return updated;
  }

  getPayment(paymentId: string) {
    return this.prisma.gratuityPayment.findUnique({
      where: { id: paymentId },
      include: { employee: true, policy: true },
    });
  }

  /** Stub settlement letter — PDF generation is out of band. */
  async settlementLetter(paymentId: string) {
    const payment = await this.getPayment(paymentId);
    if (!payment) throw DomainException.notFound('Gratuity payment not found');
    return {
      paymentId,
      status: payment.settlementLetterAttachmentId ? 'ready' : 'pending',
      documentAttachmentId: payment.settlementLetterAttachmentId,
    };
  }
}
