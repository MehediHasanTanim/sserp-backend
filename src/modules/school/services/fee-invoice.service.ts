import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DiscountType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { LedgerPort } from '../../../shared/ports/ledger.port';
import { FeeStructureService } from './fee-structure.service';
import {
  CancelInvoiceDto,
  GenerateMonthlyInvoicesDto,
} from '../dto/fee-invoice.dto';

export interface StructureLine {
  feeHeadId: string;
  amount: number;
  description?: string;
}

export interface DiscountInput {
  discountType: DiscountType;
  value: number;
  feeHeadId?: string | null;
}

export interface ScholarshipInput {
  coverageType: DiscountType;
  value: number;
}

export interface ComputedLine {
  feeHeadId: string;
  description: string;
  amount: number;
  discountAmount: number;
  netAmount: number;
}

export interface ComputedInvoiceAmount {
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  lines: ComputedLine[];
}

const COST_CENTER = 'school';
const ACCOUNT_AR_STUDENTS = '1200';
const ACCOUNT_TUITION_INCOME = '4002';
const DEFAULT_DUE_DAY = 10;

/**
 * Monthly invoice generation and amount computation.
 * Rules F-01 through F-04, F-08, F-11, F-12 — docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class FeeInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
    private readonly ledger: LedgerPort,
    private readonly feeStructures: FeeStructureService,
  ) {}

  /**
   * F-03: base + multiple heads − approved discounts (per-head or blanket)
   * − scholarship coverage, computed to the paisa. Discounts are applied
   * per line first (capped at the line balance), then scholarships are
   * applied against the remaining total and distributed proportionally
   * across lines for reporting.
   */
  computeAmount(
    structureLines: StructureLine[],
    discounts: DiscountInput[],
    scholarships: ScholarshipInput[],
  ): ComputedInvoiceAmount {
    const lines = structureLines.map((line) => ({
      feeHeadId: line.feeHeadId,
      description: line.description ?? 'Fee',
      amount: line.amount,
      discountAmount: 0,
    }));
    const grossAmount = lines.reduce((sum, l) => sum + l.amount, 0);

    for (const discount of discounts) {
      for (const line of lines) {
        if (discount.feeHeadId && discount.feeHeadId !== line.feeHeadId) {
          continue;
        }
        const remaining = line.amount - line.discountAmount;
        if (remaining <= 0) continue;
        const raw =
          discount.discountType === 'percentage'
            ? Math.round((line.amount * discount.value) / 100)
            : discount.value;
        line.discountAmount += Math.min(raw, remaining);
      }
    }

    const discountTotalFromDiscounts = lines.reduce(
      (sum, l) => sum + l.discountAmount,
      0,
    );
    let remainingTotal = grossAmount - discountTotalFromDiscounts;

    let scholarshipTotal = 0;
    for (const scholarship of scholarships) {
      const remainingBudget = remainingTotal - scholarshipTotal;
      if (remainingBudget <= 0) continue;
      const raw =
        scholarship.coverageType === 'percentage'
          ? Math.round((remainingTotal * scholarship.value) / 100)
          : scholarship.value;
      scholarshipTotal += Math.min(raw, remainingBudget);
    }

    if (scholarshipTotal > 0 && remainingTotal > 0) {
      let distributed = 0;
      const eligible = lines.filter((l) => l.amount - l.discountAmount > 0);
      eligible.forEach((line, index) => {
        const lineRemaining = line.amount - line.discountAmount;
        const isLast = index === eligible.length - 1;
        const share = isLast
          ? scholarshipTotal - distributed
          : Math.round((lineRemaining / remainingTotal) * scholarshipTotal);
        line.discountAmount += share;
        distributed += share;
      });
      remainingTotal -= scholarshipTotal;
    }

    const discountAmount = lines.reduce((sum, l) => sum + l.discountAmount, 0);
    const netAmount = grossAmount - discountAmount;

    return {
      grossAmount,
      discountAmount,
      netAmount,
      lines: lines.map((l) => ({
        feeHeadId: l.feeHeadId,
        description: l.description,
        amount: l.amount,
        discountAmount: l.discountAmount,
        netAmount: l.amount - l.discountAmount,
      })),
    };
  }

  private parsePeriod(period: string): { year: number; month: number } {
    const match = period?.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw DomainException.validation('period must be in YYYY-MM format');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      throw DomainException.validation('period month must be 01–12');
    }
    return { year, month };
  }

  private humanSkipReason(code: string): string {
    if (code === 'already_generated') {
      return 'Invoice already generated for period';
    }
    if (code === 'no_fee_category') {
      return 'No fee category assigned';
    }
    if (code === 'no_fee_structure') {
      return 'No applicable fee structure';
    }
    if (code.startsWith('not_active:')) {
      return `Student not active (${code.slice('not_active:'.length)})`;
    }
    return code;
  }

  private async resolveGenerationContext(input: GenerateMonthlyInvoicesDto) {
    let year = input.year;
    let month = input.month;
    if (input.period) {
      const parsed = this.parsePeriod(input.period);
      year = parsed.year;
      month = parsed.month;
    }
    if (year == null || month == null) {
      throw DomainException.validation(
        'Provide period (YYYY-MM) or both year and month',
      );
    }

    let academicYearId = input.academicYearId;
    if (!academicYearId) {
      const current = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
      });
      if (!current) {
        throw DomainException.conflict('No current academic year configured');
      }
      academicYearId = current.id;
    }

    return { academicYearId, year, month };
  }

  /**
   * Evaluates eligibility for each student without creating invoices.
   * Used by preview and by generate for skip-reason reporting.
   */
  private async evaluateStudent(
    student: { id: string; status: string; fullName?: string | null },
    year: number,
    month: number,
    academicYearId: string,
    periodDate: Date,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (student.status !== 'active') {
      return { ok: false, reason: `not_active:${student.status}` };
    }

    const existing = await this.prisma.feeInvoice.findFirst({
      where: {
        studentId: student.id,
        invoiceType: 'monthly',
        periodYear: year,
        periodMonth: month,
      },
    });
    if (existing) {
      return { ok: false, reason: 'already_generated' };
    }

    const assignment = await this.feeStructures.currentFeeCategory(
      student.id,
      periodDate,
    );
    if (!assignment) {
      return { ok: false, reason: 'no_fee_category' };
    }

    const structures = await this.feeStructures.applicableStructures(
      academicYearId,
      assignment.feeCategoryId,
      periodDate,
    );
    if (!structures.length) {
      return { ok: false, reason: 'no_fee_structure' };
    }

    return { ok: true };
  }

  async previewMonthly(period: string) {
    if (!period) {
      throw DomainException.validation('period query parameter is required');
    }
    const { academicYearId, year, month } = await this.resolveGenerationContext({
      period,
    });
    const periodDate = new Date(Date.UTC(year, month - 1, 1));
    const students = await this.prisma.student.findMany({
      where: { deletedAt: null },
      select: { id: true, status: true, fullName: true },
    });

    let willGenerate = 0;
    const skipMap = new Map<string, string[]>();

    for (const student of students) {
      const result = await this.evaluateStudent(
        student,
        year,
        month,
        academicYearId,
        periodDate,
      );
      if (result.ok) {
        willGenerate += 1;
      } else {
        const label = this.humanSkipReason(result.reason);
        const ids = skipMap.get(label) ?? [];
        ids.push(student.id);
        skipMap.set(label, ids);
      }
    }

    const skipReasons = [...skipMap.entries()].map(([reason, studentIds]) => ({
      reason,
      count: studentIds.length,
      studentIds,
    }));

    return {
      willGenerate,
      willSkip: students.length - willGenerate,
      skipReasons,
    };
  }

  /** F-01/F-02/F-03/F-04/F-08/F-11: idempotent bulk monthly generation. */
  async generateMonthly(input: GenerateMonthlyInvoicesDto, actorId: string) {
    const { academicYearId, year, month } =
      await this.resolveGenerationContext(input);
    const periodDate = new Date(Date.UTC(year, month - 1, 1));
    const org = await this.prisma.organizationSettings.findFirst();
    const dueDay = org?.feeDueDayOfMonth ?? DEFAULT_DUE_DAY;
    const dueDate = new Date(Date.UTC(year, month - 1, dueDay));

    const students = await this.prisma.student.findMany({
      where: { deletedAt: null },
    });

    let generated = 0;
    let failed = 0;
    const lines: Array<{
      studentId: string;
      studentName?: string;
      status: 'generated' | 'skipped' | 'failed';
      reason?: string;
      invoiceId?: string;
    }> = [];

    for (const student of students) {
      const eligibility = await this.evaluateStudent(
        student,
        year,
        month,
        academicYearId,
        periodDate,
      );
      if (!eligibility.ok) {
        lines.push({
          studentId: student.id,
          studentName: student.fullName ?? undefined,
          status: 'skipped',
          reason: this.humanSkipReason(eligibility.reason),
        });
        continue;
      }

      try {
        const assignment = await this.feeStructures.currentFeeCategory(
          student.id,
          periodDate,
        );
        const structures = await this.feeStructures.applicableStructures(
          academicYearId,
          assignment!.feeCategoryId,
          periodDate,
        );
        const discounts = await this.feeStructures.approvedDiscountsFor(
          student.id,
          periodDate,
        );
        const scholarships = await this.feeStructures.activeScholarshipsFor(
          student.id,
          periodDate,
        );

        const computed = this.computeAmount(
          structures.map((s) => ({
            feeHeadId: s.feeHeadId,
            amount: s.amount,
            description: s.feeHead.name,
          })),
          discounts.map((d) => ({
            discountType: d.discountType,
            value: d.value,
            feeHeadId: d.feeHeadId,
          })),
          scholarships.map((s) => ({
            coverageType: s.coverageType,
            value: s.value,
          })),
        );

        const invoice = await this.prisma.$transaction(async (tx) => {
          const invoiceNumber = await this.numbering.nextCode('invoice', tx);
          const created = await tx.feeInvoice.create({
            data: {
              invoiceNumber,
              studentId: student.id,
              academicYearId,
              invoiceType: 'monthly',
              periodMonth: month,
              periodYear: year,
              issueDate: periodDate,
              dueDate,
              grossAmount: computed.grossAmount,
              discountAmount: computed.discountAmount,
              netAmount: computed.netAmount,
              outstandingAmount: computed.netAmount,
              status: 'issued',
            },
          });
          for (const line of computed.lines) {
            await tx.feeInvoiceLine.create({
              data: {
                invoiceId: created.id,
                feeHeadId: line.feeHeadId,
                description: line.description,
                amount: line.amount,
                discountAmount: line.discountAmount,
                netAmount: line.netAmount,
              },
            });
          }
          return created;
        });

        await this.ledger.post({
          referenceType: 'fee_invoice',
          referenceId: invoice.id,
          amount: invoice.netAmount,
          costCenter: COST_CENTER,
          description: `Monthly tuition invoice ${invoice.invoiceNumber}`,
          debitAccountCode: ACCOUNT_AR_STUDENTS,
          creditAccountCode: ACCOUNT_TUITION_INCOME,
          postingDate: periodDate,
        });

        await this.events.emitAsync(EventNames.FEE_INVOICE_GENERATED, {
          studentId: student.id,
          invoiceId: invoice.id,
          amount: invoice.netAmount,
          actorId,
        });

        generated += 1;
        lines.push({
          studentId: student.id,
          studentName: student.fullName ?? undefined,
          status: 'generated',
          invoiceId: invoice.id,
        });
      } catch {
        failed += 1;
        lines.push({
          studentId: student.id,
          studentName: student.fullName ?? undefined,
          status: 'failed',
          reason: 'Generation failed',
        });
      }
    }

    const skipped = lines.filter((l) => l.status === 'skipped').length;
    return {
      generated,
      skipped,
      failed,
      total: students.length,
      detail:
        generated === 0
          ? 'All eligible students were skipped or already invoiced.'
          : undefined,
      lines,
    };
  }

  async list(filters: { studentId?: string; status?: string; period?: string }) {
    const periodMatch =
      filters.period?.match(/^(\d{4})-(\d{2})$/) ?? null;
    const periodYear = periodMatch ? Number(periodMatch[1]) : undefined;
    const periodMonth = periodMatch ? Number(periodMatch[2]) : undefined;

    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(periodYear != null && periodMonth != null
          ? { periodYear, periodMonth }
          : {}),
      },
      include: {
        lines: true,
        student: { select: { id: true, fullName: true } },
      },
      orderBy: { issueDate: 'desc' },
    });

    return invoices.map((inv) => {
      let period = '';
      if (inv.periodYear != null && inv.periodMonth != null) {
        // Monthly invoice: render as YYYY-MM
        period = `${inv.periodYear}-${String(inv.periodMonth).padStart(2, '0')}`;
      } else {
        // Activity or one-off invoice: use issue date month
        const d = inv.issueDate;
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const label =
          inv.invoiceType === 'activity' ? 'Activity' : inv.invoiceType;
        period = `${y}-${m} (${label})`;
      }
      return {
        ...inv,
        period,
        studentName: inv.student?.fullName ?? null,
      };
    });
  }

  async get(id: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id },
      include: {
        lines: true,
        payments: true,
        waivers: true,
        student: { select: { id: true, fullName: true } },
      },
    });
    if (!invoice) throw DomainException.notFound('Invoice not found');

    let period = '';
    if (invoice.periodYear != null && invoice.periodMonth != null) {
      period = `${invoice.periodYear}-${String(invoice.periodMonth).padStart(2, '0')}`;
    } else {
      const d = invoice.issueDate;
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const label =
        invoice.invoiceType === 'activity' ? 'Activity' : invoice.invoiceType;
      period = `${y}-${m} (${label})`;
    }

    return {
      ...invoice,
      period,
      studentName: invoice.student?.fullName ?? null,
    };
  }

  /** F-12: cancellation is permitted only when paid_amount = 0. */
  async cancel(id: string, input: CancelInvoiceDto) {
    const invoice = await this.get(id);
    if (invoice.paidAmount > 0) {
      throw DomainException.withCode(
        ErrorCode.INVOICE_HAS_PAYMENTS,
        409,
        'Cannot cancel an invoice that already has payments recorded',
      );
    }
    if (invoice.status === 'cancelled') {
      throw DomainException.conflict('Invoice is already cancelled');
    }
    return this.prisma.feeInvoice.update({
      where: { id },
      data: { status: 'cancelled', cancelledReason: input.reason },
    });
  }

  async feeSummary(studentId: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId },
      include: { payments: true },
      orderBy: { issueDate: 'desc' },
    });
    const outstanding = invoices.reduce(
      (sum, inv) => sum + inv.outstandingAmount,
      0,
    );
    return { studentId, outstanding, invoices };
  }

  /**
   * Overdue invoices with outstanding balance for the defaulters board.
   * Optional agingBucket: `0-30` | `31-60` | `61-90` | `90+`.
   */
  async listDefaulters(agingBucket?: string) {
    const now = new Date();
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        outstandingAmount: { gt: 0 },
        dueDate: { lt: now },
        status: { in: ['issued', 'partially_paid'] },
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            guardians: {
              orderBy: [{ isPrimary: 'desc' }, { emergencyPriority: 'asc' }],
              take: 1,
              select: { phone: true },
            },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const rows = invoices.map((inv) => {
      const ms = now.getTime() - inv.dueDate.getTime();
      const daysOverdue = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
      const bucket =
        daysOverdue <= 30
          ? ('0-30' as const)
          : daysOverdue <= 60
            ? ('31-60' as const)
            : daysOverdue <= 90
              ? ('61-90' as const)
              : ('90+' as const);

      let period = '';
      if (inv.periodYear != null && inv.periodMonth != null) {
        period = `${inv.periodYear}-${String(inv.periodMonth).padStart(2, '0')}`;
      } else {
        const d = inv.issueDate;
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const label =
          inv.invoiceType === 'activity' ? 'Activity' : inv.invoiceType;
        period = `${y}-${m} (${label})`;
      }

      return {
        invoiceId: inv.id,
        studentId: inv.studentId,
        studentName: inv.student?.fullName ?? 'Unknown Student',
        guardianPhone: inv.student?.guardians?.[0]?.phone ?? null,
        period,
        outstandingAmount: inv.outstandingAmount,
        daysOverdue,
        agingBucket: bucket,
      };
    });

    if (
      agingBucket === '0-30' ||
      agingBucket === '31-60' ||
      agingBucket === '61-90' ||
      agingBucket === '90+'
    ) {
      return rows.filter((r) => r.agingBucket === agingBucket);
    }

    return rows;
  }

  /**
   * Recalculate open monthly invoices for a student after a discount is
   * approved (or auto-approved). Updates amounts/lines and posts an AR
   * adjustment when the net amount changes.
   */
  async reapplyDiscountsForStudent(studentId: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        studentId,
        invoiceType: 'monthly',
        status: { in: ['issued', 'partially_paid'] },
      },
      include: { lines: true },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    });

    const adjusted: string[] = [];

    for (const invoice of invoices) {
      if (invoice.periodYear == null || invoice.periodMonth == null) continue;

      const periodDate = new Date(
        Date.UTC(invoice.periodYear, invoice.periodMonth - 1, 1),
      );

      const assignment = await this.feeStructures.currentFeeCategory(
        studentId,
        periodDate,
      );
      if (!assignment) continue;

      const structures = await this.feeStructures.applicableStructures(
        invoice.academicYearId,
        assignment.feeCategoryId,
        periodDate,
      );
      if (!structures.length) continue;

      const discounts = await this.feeStructures.approvedDiscountsFor(
        studentId,
        periodDate,
      );
      const scholarships = await this.feeStructures.activeScholarshipsFor(
        studentId,
        periodDate,
      );

      const computed = this.computeAmount(
        structures.map((s) => ({
          feeHeadId: s.feeHeadId,
          amount: s.amount,
          description: s.feeHead.name,
        })),
        discounts.map((d) => ({
          discountType: d.discountType,
          value: d.value,
          feeHeadId: d.feeHeadId,
        })),
        scholarships.map((s) => ({
          coverageType: s.coverageType,
          value: s.value,
        })),
      );

      const previousNet = invoice.netAmount;
      const netAmount = computed.netAmount;
      const outstandingAmount = Math.max(
        0,
        netAmount - invoice.paidAmount - invoice.waivedAmount,
      );
      const status =
        outstandingAmount <= 0
          ? invoice.waivedAmount >= netAmount && invoice.paidAmount === 0
            ? ('waived' as const)
            : ('paid' as const)
          : invoice.paidAmount > 0 || invoice.waivedAmount > 0
            ? ('partially_paid' as const)
            : ('issued' as const);

      if (
        previousNet === netAmount &&
        invoice.discountAmount === computed.discountAmount &&
        invoice.outstandingAmount === outstandingAmount
      ) {
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.feeInvoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
        for (const line of computed.lines) {
          await tx.feeInvoiceLine.create({
            data: {
              invoiceId: invoice.id,
              feeHeadId: line.feeHeadId,
              description: line.description,
              amount: line.amount,
              discountAmount: line.discountAmount,
              netAmount: line.netAmount,
            },
          });
        }
        await tx.feeInvoice.update({
          where: { id: invoice.id },
          data: {
            grossAmount: computed.grossAmount,
            discountAmount: computed.discountAmount,
            netAmount,
            outstandingAmount,
            status,
          },
        });
      });

      const delta = previousNet - netAmount;
      if (delta !== 0) {
        // Reduce AR when discount increases (delta > 0); increase AR otherwise.
        await this.ledger.post({
          referenceType: 'fee_invoice_discount_adjustment',
          referenceId: invoice.id,
          amount: Math.abs(delta),
          costCenter: COST_CENTER,
          description: `Discount adjustment for invoice ${invoice.invoiceNumber}`,
          debitAccountCode: delta > 0 ? ACCOUNT_TUITION_INCOME : ACCOUNT_AR_STUDENTS,
          creditAccountCode: delta > 0 ? ACCOUNT_AR_STUDENTS : ACCOUNT_TUITION_INCOME,
          postingDate: new Date(),
        });
      }

      adjusted.push(invoice.id);
    }

    return { studentId, adjustedInvoiceIds: adjusted };
  }
}
