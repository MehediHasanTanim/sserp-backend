import { Injectable, Logger } from '@nestjs/common';
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
export class GratuityProvisionService {
  private readonly logger = new Logger(GratuityProvisionService.name);
  private readonly calculator = new GratuityCalculationService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerPort,
    private readonly events: EventEmitter2,
  ) {}

  list(filters?: { year?: number; month?: number }) {
    return this.prisma.gratuityProvision.findMany({
      where: {
        provisionYear: filters?.year,
        provisionMonth: filters?.month,
      },
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true } },
      },
      orderBy: [
        { provisionYear: 'desc' },
        { provisionMonth: 'desc' },
        { employeeId: 'asc' },
      ],
    });
  }

  getEmployeeView(employeeId: string) {
    return this.getEmployeeSummary(employeeId);
  }

  async getEmployeeSummary(employeeId: string) {
    const [entitlement, provisions, ledger, payment] = await Promise.all([
      this.prisma.gratuityEntitlement.findUnique({ where: { employeeId } }),
      this.prisma.gratuityProvision.findMany({
        where: { employeeId },
        orderBy: [{ provisionYear: 'asc' }, { provisionMonth: 'asc' }],
      }),
      this.prisma.gratuityLedger.findMany({
        where: { employeeId },
        orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.gratuityPayment.findUnique({ where: { employeeId } }),
    ]);
    return { entitlement, provisions, ledger, payment };
  }

  /**
   * Monthly provision for all eligible employees (GR-06/07/08).
   * Idempotent per (employee, year, month).
   */
  async runMonthly(year: number, month: number) {
    const policy = await this.prisma.gratuityPolicy.findFirst({
      where: { isActive: true },
    });
    if (!policy) {
      throw DomainException.unprocessable('No active gratuity policy');
    }

    const asOf = new Date(Date.UTC(year, month, 0)); // last day of month
    const org = await this.prisma.organizationSettings.findFirst();
    const lwpThreshold = org?.gratuityLwpExclusionThresholdDays ?? 30;

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: { in: ['active', 'on_probation', 'on_notice'] },
        employmentType: { in: policy.applicableEmploymentTypes as never[] },
      },
      include: {
        department: { select: { code: true } },
        salaryStructures: {
          where: { status: 'active' },
          include: {
            lines: { include: { salaryComponent: true } },
          },
          take: 1,
        },
      },
    });

    const results: Array<{
      employeeId: string;
      provisionAmount: number;
      skipped?: boolean;
    }> = [];

    for (const employee of employees) {
      const existing = await this.prisma.gratuityProvision.findUnique({
        where: {
          employeeId_provisionYear_provisionMonth: {
            employeeId: employee.id,
            provisionYear: year,
            provisionMonth: month,
          },
        },
      });
      if (existing) {
        results.push({
          employeeId: employee.id,
          provisionAmount: existing.provisionAmount,
          skipped: true,
        });
        continue;
      }

      const years = this.calculator.yearsOfService({
        joiningDate: employee.joiningDate,
        asOfDate: asOf,
        prorationMethod: policy.prorationMethod,
        lwpExclusionThresholdDays: lwpThreshold,
      });
      const eligible = this.calculator.isEligible({
        yearsOfService: years,
        minServiceYears: Number(policy.minServiceYears),
        employmentType: employee.employmentType,
        applicableEmploymentTypes: policy.applicableEmploymentTypes,
      });
      if (!eligible) continue;

      const structure = employee.salaryStructures[0];
      if (!structure) {
        this.logger.warn(
          `No active structure for ${employee.employeeCode}; skip provision`,
        );
        continue;
      }

      const basic =
        structure.lines.find((l) => l.salaryComponent.code === 'BASIC')
          ?.amount ?? 0;
      const allowances = structure.lines
        .filter(
          (l) =>
            l.salaryComponent.affectsGratuity &&
            l.salaryComponent.code !== 'BASIC' &&
            l.salaryComponent.componentType === 'earning',
        )
        .map((l) => l.amount);
      const salaryBasisAmount = this.calculator.resolveSalaryBasis({
        salaryBasis: policy.salaryBasis,
        basicAmount: basic,
        allowanceAmounts: allowances,
        grossAmount: structure.grossAmount,
      });
      const entitlementAmount = this.calculator.entitlement({
        salaryBasisAmount,
        daysPerYearOfService: Number(policy.daysPerYearOfService),
        yearsOfService: years,
        maxYearsCounted:
          policy.maxYearsCounted != null
            ? Number(policy.maxYearsCounted)
            : null,
      });

      const priorAgg = await this.prisma.gratuityProvision.aggregate({
        where: { employeeId: employee.id },
        _sum: { provisionAmount: true },
      });
      const priorTotal = priorAgg._sum.provisionAmount ?? 0;
      const delta = entitlementAmount - priorTotal;
      const cumulativeTotal = priorTotal + delta;

      const costCenter = costCenterForDepartment(employee.department.code);
      const provision = await this.prisma.$transaction(async (tx) => {
        const row = await tx.gratuityProvision.create({
          data: {
            employeeId: employee.id,
            policyId: policy.id,
            provisionYear: year,
            provisionMonth: month,
            salaryBasisAmount,
            yearsOfServiceAtMonth: years,
            entitlementAtMonth: entitlementAmount,
            provisionAmount: delta,
            cumulativeTotal,
            computedAt: new Date(),
          },
        });

        const lastLedger = await tx.gratuityLedger.findFirst({
          where: { employeeId: employee.id },
          orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        });
        const runningBalance = (lastLedger?.runningBalance ?? 0) + delta;
        await tx.gratuityLedger.create({
          data: {
            employeeId: employee.id,
            entryDate: asOf,
            entryType: 'provision',
            amount: delta,
            runningBalance,
            referenceType: 'gratuity_provision',
            referenceId: row.id,
            narration: `Provision ${year}-${String(month).padStart(2, '0')}`,
          },
        });

        await tx.gratuityEntitlement.upsert({
          where: { employeeId: employee.id },
          create: {
            employeeId: employee.id,
            policyId: policy.id,
            asOfDate: asOf,
            yearsOfService: years,
            eligible: true,
            salaryBasisAmount,
            entitlementAmount,
            computedAt: new Date(),
          },
          update: {
            policyId: policy.id,
            asOfDate: asOf,
            yearsOfService: years,
            eligible: true,
            salaryBasisAmount,
            entitlementAmount,
            computedAt: new Date(),
          },
        });

        if (delta !== 0) {
          const posted = await this.ledger.post(
            {
              referenceType: 'gratuity_provision',
              referenceId: row.id,
              amount: Math.abs(delta),
              costCenter,
              description: `Gratuity provision ${employee.employeeCode} ${year}-${month}`,
              debitAccountCode: '',
              creditAccountCode: '',
              postingDate: asOf,
              payload:
                delta < 0
                  ? { reverse: true, employeeId: employee.id }
                  : { employeeId: employee.id },
            },
            tx,
          );
          if (posted.journalId) {
            await tx.gratuityProvision.update({
              where: { id: row.id },
              data: { journalId: posted.journalId },
            });
          }
        }

        return row;
      });

      results.push({
        employeeId: employee.id,
        provisionAmount: provision.provisionAmount,
      });
    }

    await this.events.emitAsync(EventNames.GRATUITY_PROVISION_MONTHLY, {
      year,
      month,
      count: results.filter((r) => !r.skipped).length,
    });
    return { year, month, results };
  }

  async recalculateEntitlement(employeeId: string) {
    const policy = await this.prisma.gratuityPolicy.findFirst({
      where: { isActive: true },
    });
    if (!policy)
      throw DomainException.unprocessable('No active gratuity policy');

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        salaryStructures: {
          where: { status: 'active' },
          include: { lines: { include: { salaryComponent: true } } },
          take: 1,
        },
      },
    });
    if (!employee) throw DomainException.notFound('Employee not found');

    const asOf = new Date();
    const org = await this.prisma.organizationSettings.findFirst();
    const years = this.calculator.yearsOfService({
      joiningDate: employee.joiningDate,
      asOfDate: asOf,
      prorationMethod: policy.prorationMethod,
      lwpExclusionThresholdDays: org?.gratuityLwpExclusionThresholdDays ?? 30,
    });
    const eligible = this.calculator.isEligible({
      yearsOfService: years,
      minServiceYears: Number(policy.minServiceYears),
      employmentType: employee.employmentType,
      applicableEmploymentTypes: policy.applicableEmploymentTypes,
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
    const entitlementAmount = eligible
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

    return this.prisma.gratuityEntitlement.upsert({
      where: { employeeId },
      create: {
        employeeId,
        policyId: policy.id,
        asOfDate: asOf,
        yearsOfService: years,
        eligible,
        salaryBasisAmount,
        entitlementAmount,
        computedAt: new Date(),
      },
      update: {
        policyId: policy.id,
        asOfDate: asOf,
        yearsOfService: years,
        eligible,
        salaryBasisAmount,
        entitlementAmount,
        computedAt: new Date(),
      },
    });
  }

  async adjust(
    employeeId: string,
    amountOrInput: number | { amount: number; reason: string },
    reasonOrActorId?: string,
    actorId?: string,
  ) {
    const amount =
      typeof amountOrInput === 'number' ? amountOrInput : amountOrInput.amount;
    const reason =
      typeof amountOrInput === 'number'
        ? (reasonOrActorId ?? '')
        : amountOrInput.reason;
    const actor =
      typeof amountOrInput === 'number'
        ? (actorId ?? '')
        : (reasonOrActorId ?? '');
    if (!reason?.trim()) {
      throw DomainException.withCode(
        ErrorCode.FORBIDDEN,
        403,
        'Adjustment requires a reason and principal approval path',
      );
    }
    const last = await this.prisma.gratuityLedger.findFirst({
      where: { employeeId },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
    const runningBalance = (last?.runningBalance ?? 0) + amount;
    return this.prisma.gratuityLedger.create({
      data: {
        employeeId,
        entryDate: new Date(),
        entryType: 'adjustment',
        amount,
        runningBalance,
        referenceType: 'manual_adjustment',
        narration: `${reason} (by ${actor})`,
      },
    });
  }

  async liabilityAsOf(asOf?: Date) {
    const date = asOf ?? new Date();
    const latest = await this.prisma.gratuityProvision.groupBy({
      by: ['employeeId'],
      _max: { cumulativeTotal: true },
      where: {
        OR: [
          { provisionYear: { lt: date.getUTCFullYear() } },
          {
            provisionYear: date.getUTCFullYear(),
            provisionMonth: { lte: date.getUTCMonth() + 1 },
          },
        ],
      },
    });
    const total = latest.reduce((s, r) => s + (r._max.cumulativeTotal ?? 0), 0);
    return { asOf: date, employeeCount: latest.length, totalLiability: total };
  }
}
