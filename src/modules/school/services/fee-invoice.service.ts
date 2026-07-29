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
import { CancelInvoiceDto, GenerateMonthlyInvoicesDto } from '../dto/fee-invoice.dto';

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

  /** F-01/F-02/F-03/F-04/F-08/F-11: idempotent bulk monthly generation. */
  async generateMonthly(input: GenerateMonthlyInvoicesDto, actorId: string) {
    const periodDate = new Date(Date.UTC(input.year, input.month - 1, 1));
    const org = await this.prisma.organizationSettings.findFirst();
    const dueDay = org?.feeDueDayOfMonth ?? DEFAULT_DUE_DAY;
    const dueDate = new Date(Date.UTC(input.year, input.month - 1, dueDay));

    const students = await this.prisma.student.findMany({
      where: { deletedAt: null },
    });

    let generated = 0;
    const skipped: { studentId: string; reason: string }[] = [];

    for (const student of students) {
      if (student.status !== 'active') {
        skipped.push({ studentId: student.id, reason: `not_active:${student.status}` });
        continue;
      }

      const existing = await this.prisma.feeInvoice.findFirst({
        where: {
          studentId: student.id,
          invoiceType: 'monthly',
          periodYear: input.year,
          periodMonth: input.month,
        },
      });
      if (existing) {
        skipped.push({ studentId: student.id, reason: 'already_generated' });
        continue;
      }

      const assignment = await this.feeStructures.currentFeeCategory(
        student.id,
        periodDate,
      );
      if (!assignment) {
        skipped.push({ studentId: student.id, reason: 'no_fee_category' });
        continue;
      }

      const structures = await this.feeStructures.applicableStructures(
        input.academicYearId,
        assignment.feeCategoryId,
        periodDate,
      );
      if (!structures.length) {
        skipped.push({ studentId: student.id, reason: 'no_fee_structure' });
        continue;
      }

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
            academicYearId: input.academicYearId,
            invoiceType: 'monthly',
            periodMonth: input.month,
            periodYear: input.year,
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
    }

    return { generated, skipped, total: students.length };
  }

  async list(filters: { studentId?: string; status?: string }) {
    return this.prisma.feeInvoice.findMany({
      where: {
        studentId: filters.studentId,
        status: filters.status as never,
      },
      include: { lines: true },
      orderBy: { issueDate: 'desc' },
    });
  }

  async get(id: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id },
      include: { lines: true, payments: true, waivers: true },
    });
    if (!invoice) throw DomainException.notFound('Invoice not found');
    return invoice;
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
}
