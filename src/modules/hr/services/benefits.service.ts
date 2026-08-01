import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { LedgerPort } from '../../../shared/ports/ledger.port';

@Injectable()
export class BenefitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerPort,
    private readonly events: EventEmitter2,
  ) {}

  // ---- Benefit plans -------------------------------------------------

  listPlans() {
    return this.prisma.benefitPlan.findMany({ orderBy: { name: 'asc' } });
  }

  createPlan(data: Prisma.BenefitPlanCreateInput) {
    return this.prisma.benefitPlan.create({ data });
  }

  async updatePlan(id: string, data: Prisma.BenefitPlanUpdateInput) {
    return this.prisma.benefitPlan.update({ where: { id }, data });
  }

  // ---- Enrollments ---------------------------------------------------

  listEnrollments(employeeId: string) {
    return this.prisma.benefitEnrollment.findMany({
      where: { employeeId },
      include: { benefitPlan: true },
      orderBy: { enrolledFrom: 'desc' },
    });
  }

  async enroll(
    employeeId: string,
    benefitPlanIdOrInput:
      | string
      | {
          benefitPlanId: string;
          enrolledFrom: string;
          dependents?: unknown;
        },
    enrolledFrom?: string,
  ) {
    const input =
      typeof benefitPlanIdOrInput === 'string'
        ? {
            benefitPlanId: benefitPlanIdOrInput,
            enrolledFrom: enrolledFrom!,
          }
        : benefitPlanIdOrInput;
    const plan = await this.prisma.benefitPlan.findUnique({
      where: { id: input.benefitPlanId },
    });
    if (!plan || !plan.isActive) {
      throw DomainException.notFound('Benefit plan not found');
    }
    return this.prisma.benefitEnrollment.create({
      data: {
        employeeId,
        benefitPlanId: input.benefitPlanId,
        enrolledFrom: new Date(input.enrolledFrom),
        dependents: input.dependents as Prisma.InputJsonValue | undefined,
        status: 'active',
      },
    });
  }

  // ---- Loans ---------------------------------------------------------

  listLoans(
    filtersOrEmployeeId?: { employeeId?: string; status?: string } | string,
  ) {
    const filters =
      typeof filtersOrEmployeeId === 'string'
        ? { employeeId: filtersOrEmployeeId }
        : filtersOrEmployeeId;
    return this.prisma.employeeLoan.findMany({
      where: {
        employeeId: filters?.employeeId,
        status: filters?.status as never,
      },
      include: { repayments: { orderBy: { installmentNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Loans (create) ------------------------------------------------

  requestLoan(input: {
    employeeId: string;
    loanType: 'loan' | 'salary_advance';
    principalAmount: number;
    interestRatePercent?: number;
    installmentCount: number;
    installmentAmount: number;
    purpose?: string;
  }) {
    return this.createLoan(input);
  }

  async createLoan(input: {
    employeeId: string;
    loanType: 'loan' | 'salary_advance';
    principalAmount: number;
    interestRatePercent?: number;
    installmentCount: number;
    installmentAmount: number;
    purpose?: string;
  }) {
    if (
      input.installmentAmount * input.installmentCount <
      input.principalAmount
    ) {
      throw DomainException.validation(
        'installment_amount × installment_count must cover principal',
      );
    }
    return this.prisma.employeeLoan.create({
      data: {
        employeeId: input.employeeId,
        loanType: input.loanType,
        principalAmount: input.principalAmount,
        interestRatePercent: input.interestRatePercent ?? 0,
        installmentCount: input.installmentCount,
        installmentAmount: input.installmentAmount,
        outstandingAmount: input.principalAmount,
        purpose: input.purpose,
        status: 'requested',
      },
    });
  }

  async approveLoan(id: string, actorId: string) {
    const loan = await this.prisma.employeeLoan.findUnique({ where: { id } });
    if (!loan) throw DomainException.notFound('Loan not found');
    if (loan.status !== 'requested') {
      throw DomainException.conflict('Only requested loans can be approved');
    }
    return this.prisma.employeeLoan.update({
      where: { id },
      data: { status: 'approved', approvedBy: actorId },
    });
  }

  async disburseLoan(id: string, actorId: string) {
    const now = new Date();
    return this.disburse(
      id,
      {
        disbursedDate: now.toISOString().slice(0, 10),
        firstDeductionMonth:
          now.getUTCMonth() + 2 > 12 ? 1 : now.getUTCMonth() + 2,
        firstDeductionYear:
          now.getUTCMonth() + 2 > 12
            ? now.getUTCFullYear() + 1
            : now.getUTCFullYear(),
      },
      actorId,
    );
  }

  async disburse(
    id: string,
    input: {
      disbursedDate: string;
      firstDeductionMonth: number;
      firstDeductionYear: number;
    },
    actorId: string,
  ) {
    const loan = await this.prisma.employeeLoan.findUnique({ where: { id } });
    if (!loan) throw DomainException.notFound('Loan not found');
    if (loan.status !== 'approved') {
      throw DomainException.conflict(
        'Loan must be approved before disbursement',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const repayments: Prisma.LoanRepaymentCreateManyInput[] = [];
      let month = input.firstDeductionMonth;
      let year = input.firstDeductionYear;
      for (let i = 1; i <= loan.installmentCount; i++) {
        repayments.push({
          loanId: loan.id,
          installmentNumber: i,
          dueMonth: month,
          dueYear: year,
          scheduledAmount: loan.installmentAmount,
          status: 'scheduled',
        });
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      await tx.loanRepayment.createMany({ data: repayments });

      await this.ledger.post(
        {
          referenceType: 'loan_disbursement',
          referenceId: loan.id,
          amount: loan.principalAmount,
          costCenter: 'admin',
          description: `Loan disbursement ${loan.id}`,
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: new Date(input.disbursedDate),
          payload: { employeeId: loan.employeeId, actorId },
        },
        tx,
      );

      return tx.employeeLoan.update({
        where: { id },
        data: {
          status: 'disbursed',
          disbursedDate: new Date(input.disbursedDate),
          firstDeductionMonth: input.firstDeductionMonth,
          firstDeductionYear: input.firstDeductionYear,
          outstandingAmount: loan.principalAmount,
        },
        include: { repayments: { orderBy: { installmentNumber: 'asc' } } },
      });
    });

    await this.events.emitAsync(EventNames.LOAN_DISBURSED, {
      loanId: id,
      employeeId: loan.employeeId,
      actorId,
    });
    return updated;
  }

  getLoanSchedule(id: string) {
    return this.prisma.loanRepayment.findMany({
      where: { loanId: id },
      orderBy: { installmentNumber: 'asc' },
    });
  }

  async waiveRepayment(repaymentId: string, reason: string) {
    if (!reason?.trim()) {
      throw DomainException.validation('Waiver reason is mandatory');
    }
    const repayment = await this.prisma.loanRepayment.findUnique({
      where: { id: repaymentId },
      include: { loan: true },
    });
    if (!repayment) throw DomainException.notFound('Repayment not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.loanRepayment.update({
        where: { id: repaymentId },
        data: { status: 'waived' },
      });
      await tx.employeeLoan.update({
        where: { id: repayment.loanId },
        data: {
          outstandingAmount: {
            decrement: repayment.scheduledAmount - repayment.paidAmount,
          },
        },
      });
      return updated;
    });
  }

  /** Gratuity + encashment eligibility + outstanding loans (BN-03). */
  async endOfServiceSummary(employeeId: string) {
    const [entitlement, loans, encashEligible, payment] = await Promise.all([
      this.prisma.gratuityEntitlement.findUnique({ where: { employeeId } }),
      this.prisma.employeeLoan.findMany({
        where: {
          employeeId,
          status: { in: ['disbursed', 'repaying'] },
          outstandingAmount: { gt: 0 },
        },
      }),
      this.prisma.leaveType.findMany({
        where: { isActive: true, isEncashable: true },
      }),
      this.prisma.gratuityPayment.findUnique({ where: { employeeId } }),
    ]);
    const outstandingLoans = loans.reduce((s, l) => s + l.outstandingAmount, 0);
    return {
      employeeId,
      gratuityEntitlement: entitlement?.entitlementAmount ?? 0,
      gratuityEligible: entitlement?.eligible ?? false,
      outstandingLoans,
      loans,
      encashableLeaveTypes: encashEligible.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
      })),
      settlement: payment,
      estimatedNet: (entitlement?.entitlementAmount ?? 0) - outstandingLoans,
    };
  }
}
