import { Injectable } from '@nestjs/common';
import { TaxDirection, TaxType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DomainException } from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface CreateTaxDto {
  code: string;
  name: string;
  taxType: TaxType;
  ratePercent: number;
  isInclusive?: boolean;
  payableAccountId: string;
  receivableAccountId?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
}

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(activeOnly = true) {
    return this.prisma.tax.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async findById(id: string) {
    const t = await this.prisma.tax.findUnique({ where: { id } });
    if (!t) throw DomainException.notFound('Tax not found');
    return t;
  }

  async create(dto: CreateTaxDto) {
    return this.prisma.tax.create({
      data: {
        ...dto,
        ratePercent: new Decimal(dto.ratePercent),
        isInclusive: dto.isInclusive ?? false,
      },
    });
  }

  async update(id: string, dto: Partial<CreateTaxDto>) {
    await this.findById(id);
    return this.prisma.tax.update({
      where: { id },
      data: {
        name: dto.name,
        ratePercent: dto.ratePercent != null ? new Decimal(dto.ratePercent) : undefined,
        isInclusive: dto.isInclusive,
        effectiveTo: dto.effectiveTo,
        isActive: (dto as { isActive?: boolean }).isActive,
      },
    });
  }

  /** TX-01: base + tax = gross exactly for inclusive amounts. */
  decomposeInclusive(gross: number, ratePercent: number) {
    const base = Math.round((gross * 100) / (100 + ratePercent));
    const tax = gross - base;
    return { gross, base, tax, ratePercent };
  }

  async effectiveRate(taxId: string, transactionDate: Date) {
    const tax = await this.prisma.tax.findFirst({
      where: {
        id: taxId,
        isActive: true,
        effectiveFrom: { lte: transactionDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: transactionDate } }],
      },
    });
    if (!tax) throw DomainException.notFound('No effective tax rate for date');
    return tax;
  }

  async recordTransaction(input: {
    taxId: string;
    journalId: string;
    taxableAmount: number;
    taxAmount: number;
    direction: TaxDirection;
    partyName?: string;
    transactionDate: Date;
    filingPeriod: string;
  }) {
    return this.prisma.taxTransaction.create({ data: input });
  }

  async liabilitySummary() {
    const rows = await this.prisma.taxTransaction.groupBy({
      by: ['taxId', 'direction'],
      _sum: { taxAmount: true },
    });
    return rows;
  }

  async filingSummary(filingPeriod: string) {
    return this.prisma.taxTransaction.findMany({
      where: { filingPeriod },
      include: { tax: true },
    });
  }
}
