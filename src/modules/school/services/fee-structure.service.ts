import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import {
  CreateDiscountDto,
  CreateFeeCategoryDto,
  CreateFeeDiscountRequestDto,
  CreateFeeHeadDto,
  CreateFeeStructureDto,
  CreateScholarshipDto,
  SetStudentFeeCategoryDto,
  UpdateFeeCategoryDto,
  UpdateFeeHeadDto,
  UpdateFeeStructureDto,
} from '../dto/fee-structure.dto';

const PRINCIPAL_ROLES = ['principal', 'super_admin'];

/**
 * Fee categories, heads, structures, student fee-category assignment,
 * discounts, and scholarships.
 * Rule F-04 — docs/plan/backend/03-phase2-school-advanced.md §6 (fees).
 */
@Injectable()
export class FeeStructureService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Categories ----

  async listCategories() {
    return this.prisma.feeCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(input: CreateFeeCategoryDto) {
    return this.prisma.feeCategory.create({
      data: { ...input, isActive: input.isActive ?? true },
    });
  }

  async updateCategory(id: string, input: UpdateFeeCategoryDto) {
    const existing = await this.prisma.feeCategory.findUnique({
      where: { id },
    });
    if (!existing) throw DomainException.notFound('Fee category not found');
    return this.prisma.feeCategory.update({ where: { id }, data: input });
  }

  // ---- Heads ----

  async listHeads() {
    return this.prisma.feeHead.findMany({ orderBy: { code: 'asc' } });
  }

  async createHead(input: CreateFeeHeadDto) {
    return this.prisma.feeHead.create({
      data: {
        code: input.code,
        name: input.name,
        headType: input.headType,
        isRecurring: input.isRecurring ?? true,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateHead(id: string, input: UpdateFeeHeadDto) {
    const existing = await this.prisma.feeHead.findUnique({ where: { id } });
    if (!existing) throw DomainException.notFound('Fee head not found');
    return this.prisma.feeHead.update({ where: { id }, data: input });
  }

  // ---- Structures ----

  async listStructures(academicYearId?: string, feeCategoryId?: string) {
    return this.prisma.feeStructure.findMany({
      where: { academicYearId, feeCategoryId },
      include: { feeHead: true, feeCategory: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async createStructure(input: CreateFeeStructureDto) {
    return this.prisma.feeStructure.create({
      data: {
        academicYearId: input.academicYearId,
        feeCategoryId: input.feeCategoryId,
        feeHeadId: input.feeHeadId,
        amount: input.amount,
        frequency: input.frequency,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo
          ? new Date(input.effectiveTo)
          : undefined,
      },
    });
  }

  async updateStructure(id: string, input: UpdateFeeStructureDto) {
    const existing = await this.prisma.feeStructure.findUnique({
      where: { id },
    });
    if (!existing) throw DomainException.notFound('Fee structure not found');
    return this.prisma.feeStructure.update({
      where: { id },
      data: {
        amount: input.amount,
        effectiveTo: input.effectiveTo
          ? new Date(input.effectiveTo)
          : undefined,
      },
    });
  }

  /** Applicable monthly fee structure lines for a student's category on a given date. */
  async applicableStructures(
    academicYearId: string,
    feeCategoryId: string,
    onDate: Date,
  ) {
    const structures = await this.prisma.feeStructure.findMany({
      where: {
        academicYearId,
        feeCategoryId,
        frequency: 'monthly',
        effectiveFrom: { lte: onDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
      },
      include: { feeHead: true },
    });
    return structures;
  }

  // ---- Student fee category assignment ----

  async currentFeeCategory(studentId: string, onDate: Date) {
    return this.prisma.studentFeeAssignment.findFirst({
      where: {
        studentId,
        effectiveFrom: { lte: onDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { feeCategory: true },
    });
  }

  /** Current assignment for staff UI; null when none is set. */
  async getStudentFeeCategory(studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');

    const assignment = await this.currentFeeCategory(studentId, new Date());
    if (!assignment) return null;

    return {
      id: assignment.id,
      studentId: assignment.studentId,
      feeCategoryId: assignment.feeCategoryId,
      feeCategoryName: assignment.feeCategory.name,
      effectiveFrom: assignment.effectiveFrom,
      effectiveTo: assignment.effectiveTo,
    };
  }

  async setStudentFeeCategory(
    studentId: string,
    input: SetStudentFeeCategoryDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');

    const category = await this.prisma.feeCategory.findUnique({
      where: { id: input.feeCategoryId },
    });
    if (!category || !category.isActive) {
      throw DomainException.notFound('Fee category not found');
    }

    const effectiveFrom = new Date(input.effectiveFrom);
    const created = await this.prisma.$transaction(async (tx) => {
      const previousDay = new Date(effectiveFrom);
      previousDay.setUTCDate(previousDay.getUTCDate() - 1);
      await tx.studentFeeAssignment.updateMany({
        where: { studentId, effectiveTo: null },
        data: { effectiveTo: previousDay },
      });
      return tx.studentFeeAssignment.create({
        data: {
          studentId,
          feeCategoryId: input.feeCategoryId,
          effectiveFrom,
        },
        include: { feeCategory: true },
      });
    });

    return {
      id: created.id,
      studentId: created.studentId,
      feeCategoryId: created.feeCategoryId,
      feeCategoryName: created.feeCategory.name,
      effectiveFrom: created.effectiveFrom,
      effectiveTo: created.effectiveTo,
    };
  }

  // ---- Discounts ----

  private toFeeDiscountView(
    discount: {
      id: string;
      studentId: string;
      discountType: string;
      value: number;
      reason: string | null;
      status: string;
      student?: { fullName: string } | null;
    },
  ) {
    const percentage =
      discount.discountType === 'percentage' ? discount.value : null;
    const fixedAmount =
      discount.discountType === 'fixed' ? discount.value : null;
    return {
      id: discount.id,
      studentId: discount.studentId,
      studentName: discount.student?.fullName,
      percentage,
      fixedAmount,
      reason: discount.reason ?? '',
      status: discount.status as 'pending' | 'approved' | 'rejected',
      financialImpact: fixedAmount,
    };
  }

  async listFeeDiscounts(status?: string) {
    const discounts = await this.prisma.studentDiscount.findMany({
      where: status
        ? { status: status as 'pending' | 'approved' | 'rejected' }
        : undefined,
      include: { student: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return discounts.map((d) => this.toFeeDiscountView(d));
  }

  async listDiscounts(studentId: string) {
    return this.prisma.studentDiscount.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** F-04: percentage discounts at or below the org threshold auto-approve. */
  async createDiscount(studentId: string, input: CreateDiscountDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');

    const org = await this.prisma.organizationSettings.findFirst();
    const threshold = org?.discountApprovalThresholdPercent ?? 10;
    const autoApprove =
      input.discountType === 'percentage' && input.value <= threshold;

    return this.prisma.studentDiscount.create({
      data: {
        studentId,
        discountType: input.discountType,
        value: input.value,
        feeHeadId: input.feeHeadId,
        reason: input.reason,
        status: autoApprove ? 'approved' : 'pending',
        approvedAt: autoApprove ? new Date() : undefined,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo
          ? new Date(input.effectiveTo)
          : undefined,
      },
    });
  }

  async createFeeDiscountRequest(input: CreateFeeDiscountRequestDto) {
    const hasPercentage =
      input.percentage != null && !Number.isNaN(Number(input.percentage));
    const hasFixed =
      input.fixedAmount != null && !Number.isNaN(Number(input.fixedAmount));

    if (hasPercentage === hasFixed) {
      throw DomainException.validation(
        'Provide exactly one of percentage or fixedAmount',
      );
    }

    const discountType = hasPercentage ? 'percentage' : 'fixed';
    const value = hasPercentage
      ? Math.round(Number(input.percentage))
      : Math.round(Number(input.fixedAmount));

    if (discountType === 'percentage' && (value < 0 || value > 100)) {
      throw DomainException.validation('percentage must be between 0 and 100');
    }
    if (discountType === 'fixed' && value <= 0) {
      throw DomainException.validation('fixedAmount must be greater than zero');
    }

    const created = await this.createDiscount(input.studentId, {
      discountType,
      value,
      reason: input.reason,
      // Apply from the start of the current month so it covers this period's invoice.
      effectiveFrom: new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      )
        .toISOString()
        .slice(0, 10),
    });

    const withStudent = await this.prisma.studentDiscount.findUnique({
      where: { id: created.id },
      include: { student: { select: { fullName: true } } },
    });
    return this.toFeeDiscountView(withStudent!);
  }

  async approveDiscount(id: string, actorId: string, actorRoles: string[]) {
    if (!actorRoles.some((r) => PRINCIPAL_ROLES.includes(r))) {
      throw DomainException.forbidden(
        'Only a principal may approve a discount',
      );
    }
    const discount = await this.prisma.studentDiscount.findUnique({
      where: { id },
    });
    if (!discount) throw DomainException.notFound('Discount not found');
    return this.prisma.studentDiscount.update({
      where: { id },
      data: { status: 'approved', approvedBy: actorId, approvedAt: new Date() },
    });
  }

  async approveFeeDiscount(id: string, actorId: string, actorRoles: string[]) {
    const updated = await this.approveDiscount(id, actorId, actorRoles);
    const withStudent = await this.prisma.studentDiscount.findUnique({
      where: { id: updated.id },
      include: { student: { select: { fullName: true } } },
    });
    return this.toFeeDiscountView(withStudent!);
  }

  async approvedDiscountsFor(studentId: string, onDate: Date) {
    // onDate is typically the billing period start (1st). A discount approved
    // mid-month should still apply to that month's invoice.
    const periodEnd = new Date(
      Date.UTC(onDate.getUTCFullYear(), onDate.getUTCMonth() + 1, 0),
    );
    return this.prisma.studentDiscount.findMany({
      where: {
        studentId,
        status: 'approved',
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
      },
    });
  }

  // ---- Scholarships ----

  async listScholarships(studentId: string) {
    return this.prisma.scholarship.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createScholarship(studentId: string, input: CreateScholarshipDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');

    return this.prisma.scholarship.create({
      data: {
        studentId,
        name: input.name,
        sponsor: input.sponsor,
        coverageType: input.coverageType,
        value: input.value,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        notes: input.notes,
        status: 'approved',
      },
    });
  }

  async activeScholarshipsFor(studentId: string, onDate: Date) {
    return this.prisma.scholarship.findMany({
      where: {
        studentId,
        status: 'approved',
        startDate: { lte: onDate },
        OR: [{ endDate: null }, { endDate: { gte: onDate } }],
      },
    });
  }
}
