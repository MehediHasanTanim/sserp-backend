import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, SalaryStructureStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';

export interface CreateComponentInput {
  code: string;
  name: string;
  componentType: 'earning' | 'deduction' | 'employer_contribution';
  calculationType:
    | 'fixed'
    | 'percentage_of_basic'
    | 'percentage_of_gross'
    | 'formula'
    | 'attendance_based';
  value?: number;
  formulaExpression?: string;
  isTaxable?: boolean;
  isStatutory?: boolean;
  affectsGratuity?: boolean;
  coaAccountCode: string;
  sequence?: number;
}

export interface StructureLineInput {
  salaryComponentId: string;
  amount: number;
  overrideValue?: number;
}

@Injectable()
export class SalaryStructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  listComponents() {
    return this.prisma.salaryComponent.findMany({
      where: { isActive: true },
      orderBy: { sequence: 'asc' },
    });
  }

  createComponent(input: CreateComponentInput) {
    return this.prisma.salaryComponent.create({
      data: {
        code: input.code,
        name: input.name,
        componentType: input.componentType,
        calculationType: input.calculationType,
        value: input.value ?? 0,
        formulaExpression: input.formulaExpression,
        isTaxable: input.isTaxable ?? true,
        isStatutory: input.isStatutory ?? false,
        affectsGratuity: input.affectsGratuity ?? false,
        coaAccountCode: input.coaAccountCode,
        sequence: input.sequence ?? 0,
      },
    });
  }

  async updateComponent(id: string, input: Partial<CreateComponentInput>) {
    await this.requireComponent(id);
    return this.prisma.salaryComponent.update({
      where: { id },
      data: {
        name: input.name,
        value: input.value,
        formulaExpression: input.formulaExpression,
        isTaxable: input.isTaxable,
        isStatutory: input.isStatutory,
        affectsGratuity: input.affectsGratuity,
        coaAccountCode: input.coaAccountCode,
        sequence: input.sequence,
        isActive: undefined,
      },
    });
  }

  listPayrollGroups() {
    return this.prisma.payrollGroup.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  createPayrollGroup(input: {
    name: string;
    employmentTypes: string[];
    payDayOfMonth: number;
  }) {
    return this.prisma.payrollGroup.create({
      data: {
        name: input.name,
        employmentTypes: input.employmentTypes,
        payDayOfMonth: input.payDayOfMonth,
        payFrequency: 'monthly',
      },
    });
  }

  async getActiveStructure(employeeId: string) {
    return this.prisma.salaryStructure.findFirst({
      where: { employeeId, status: 'active' },
      include: {
        lines: { include: { salaryComponent: true } },
        payrollGroup: true,
      },
    });
  }

  async createStructure(
    employeeId: string,
    input: {
      payrollGroupId: string;
      effectiveFrom: string;
      lines: StructureLineInput[];
      revisionReason?: string;
    },
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!employee) throw DomainException.notFound('Employee not found');

    const effectiveFrom = new Date(input.effectiveFrom);
    const grossAmount = input.lines.reduce((s, l) => s + l.amount, 0);

    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.salaryStructure.findFirst({
        where: { employeeId, status: 'active' },
      });
      if (prior) {
        const dayBefore = new Date(effectiveFrom);
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
        await tx.salaryStructure.update({
          where: { id: prior.id },
          data: {
            status: 'superseded',
            effectiveTo: dayBefore,
          },
        });
      }

      return tx.salaryStructure.create({
        data: {
          employeeId,
          payrollGroupId: input.payrollGroupId,
          effectiveFrom,
          grossAmount,
          status: 'draft',
          revisionReason: input.revisionReason,
          lines: {
            create: input.lines.map((l) => ({
              salaryComponentId: l.salaryComponentId,
              amount: l.amount,
              overrideValue: l.overrideValue,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  async approve(structureId: string, actorId: string) {
    const structure = await this.prisma.salaryStructure.findUnique({
      where: { id: structureId },
      include: { lines: { include: { salaryComponent: true } } },
    });
    if (!structure)
      throw DomainException.notFound('Salary structure not found');
    if (structure.status !== 'draft') {
      throw DomainException.conflict('Only draft structures can be approved');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Ensure only one active
      await tx.salaryStructure.updateMany({
        where: {
          employeeId: structure.employeeId,
          status: 'active',
          id: { not: structureId },
        },
        data: {
          status: 'superseded',
          effectiveTo: new Date(
            structure.effectiveFrom.getTime() - 24 * 60 * 60 * 1000,
          ),
        },
      });
      return tx.salaryStructure.update({
        where: { id: structureId },
        data: {
          status: 'active' satisfies SalaryStructureStatus,
          approvedBy: actorId,
          approvedAt: new Date(),
        },
        include: { lines: { include: { salaryComponent: true } } },
      });
    });

    await this.events.emitAsync(EventNames.SALARY_STRUCTURE_APPROVED, {
      salaryStructureId: updated.id,
      employeeId: updated.employeeId,
      actorId,
    });
    return updated;
  }

  private async requireComponent(id: string) {
    const c = await this.prisma.salaryComponent.findUnique({ where: { id } });
    if (!c) throw DomainException.notFound('Salary component not found');
    return c;
  }
}

/** Slab entry: annual taxable upTo (paisa, null = infinity) and rate percent. */
export interface TaxSlab {
  upTo: number | null;
  ratePercent: number;
}

@Injectable()
export class StatutoryDeductionService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.statutoryDeductionSetting.findMany({
      orderBy: [{ deductionType: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  create(data: Prisma.StatutoryDeductionSettingCreateInput) {
    return this.prisma.statutoryDeductionSetting.create({ data });
  }

  async update(id: string, data: Prisma.StatutoryDeductionSettingUpdateInput) {
    return this.prisma.statutoryDeductionSetting.update({
      where: { id },
      data,
    });
  }

  /**
   * Annual projection method: tax on annual taxable, then ÷ 12 for monthly withholding.
   * Slabs are applied progressively on the annual amount.
   */
  computeIncomeTaxMonthly(annualTaxable: number, slabs: TaxSlab[]): number {
    const annualTax = this.computeIncomeTaxAnnual(annualTaxable, slabs);
    return Math.round(annualTax / 12);
  }

  computeIncomeTaxAnnual(annualTaxable: number, slabs: TaxSlab[]): number {
    let remaining = Math.max(0, annualTaxable);
    let prevCap = 0;
    let tax = 0;
    for (const slab of slabs) {
      const cap = slab.upTo ?? Number.POSITIVE_INFINITY;
      const band = Math.min(remaining, cap - prevCap);
      if (band <= 0) break;
      tax += (band * slab.ratePercent) / 100;
      remaining -= band;
      prevCap = cap;
      if (remaining <= 0) break;
    }
    return Math.round(tax);
  }

  computePf(
    basicAmount: number,
    ratePercent: number,
    ceiling?: number | null,
  ): number {
    const base = ceiling != null ? Math.min(basicAmount, ceiling) : basicAmount;
    return Math.round((base * ratePercent) / 100);
  }

  async resolveActive(
    deductionType: 'income_tax' | 'provident_fund' | 'other',
    asOf: Date,
  ) {
    return this.prisma.statutoryDeductionSetting.findFirst({
      where: {
        deductionType,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }
}
