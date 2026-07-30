import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';

const PCT_TOLERANCE = 0.0001;

@Injectable()
export class ShareholderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list() {
    return this.prisma.shareholder.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string) {
    const s = await this.prisma.shareholder.findUnique({ where: { id } });
    if (!s) throw DomainException.notFound('Shareholder not found');
    return s;
  }

  async activePercentageSum(excludeId?: string): Promise<number> {
    const rows = await this.prisma.shareholder.findMany({
      where: {
        status: 'active',
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { sharePercentage: true },
    });
    return rows.reduce((s, r) => s + Number(r.sharePercentage), 0);
  }

  async assertTotal100(extraPct = 0, excludeId?: string) {
    const sum = (await this.activePercentageSum(excludeId)) + extraPct;
    if (Math.abs(sum - 100) > PCT_TOLERANCE) {
      throw DomainException.withCode(
        ErrorCode.SHARE_PERCENTAGE_INVALID,
        422,
        `Active share percentages must sum to 100 (got ${sum.toFixed(4)})`,
        { sum },
      );
    }
  }

  async create(data: {
    name: string;
    shareholderType: 'individual' | 'corporate';
    sharePercentage: number;
    sharesCount?: number;
    contactPhone?: string;
    contactEmail?: string;
    address?: string;
    taxIdentifier?: string;
    bankDetails?: Record<string, unknown>;
    joinedDate: Date;
  }) {
    await this.assertTotal100(data.sharePercentage);
    return this.prisma.shareholder.create({
      data: {
        ...data,
        bankDetails: data.bankDetails as Prisma.InputJsonValue,
        sharePercentage: data.sharePercentage,
      },
    });
  }

  async update(id: string, data: { sharePercentage?: number; name?: string }) {
    const current = await this.findById(id);
    if (data.sharePercentage != null && current.status === 'active') {
      await this.assertTotal100(data.sharePercentage, id);
    }
    return this.prisma.shareholder.update({ where: { id }, data });
  }

  async transfer(input: {
    fromShareholderId: string;
    toShareholderId?: string;
    toName?: string;
    percentageTransferred: number;
    transferDate: Date;
    considerationAmount?: number;
    approvedBy: string;
    newShareholder?: {
      shareholderType: 'individual' | 'corporate';
      contactPhone?: string;
      contactEmail?: string;
    };
  }) {
    const from = await this.findById(input.fromShareholderId);
    if (Number(from.sharePercentage) < input.percentageTransferred) {
      throw DomainException.withCode(
        ErrorCode.INSUFFICIENT_SHARES,
        422,
        'Transfer exceeds holding',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let toId = input.toShareholderId;
      if (!toId) {
        if (!input.toName) throw DomainException.validation('toName required for new entrant');
        const created = await tx.shareholder.create({
          data: {
            name: input.toName,
            shareholderType: input.newShareholder?.shareholderType ?? 'individual',
            sharePercentage: input.percentageTransferred,
            joinedDate: input.transferDate,
            contactPhone: input.newShareholder?.contactPhone,
            contactEmail: input.newShareholder?.contactEmail,
            status: 'active',
          },
        });
        toId = created.id;
      } else {
        const to = await tx.shareholder.findUnique({ where: { id: toId } });
        if (!to) throw DomainException.notFound('Recipient not found');
        await tx.shareholder.update({
          where: { id: toId },
          data: {
            sharePercentage: Number(to.sharePercentage) + input.percentageTransferred,
          },
        });
      }

      await tx.shareholder.update({
        where: { id: from.id },
        data: {
          sharePercentage: Number(from.sharePercentage) - input.percentageTransferred,
        },
      });

      const active = await tx.shareholder.findMany({
        where: { status: 'active' },
        select: { sharePercentage: true },
      });
      const sum = active.reduce((s, r) => s + Number(r.sharePercentage), 0);
      if (Math.abs(sum - 100) > PCT_TOLERANCE) {
        throw DomainException.withCode(
          ErrorCode.SHARE_PERCENTAGE_INVALID,
          422,
          `Transfer would leave total at ${sum}`,
        );
      }

      return tx.shareTransfer.create({
        data: {
          fromShareholderId: from.id,
          toShareholderId: toId,
          toName: input.toName,
          percentageTransferred: input.percentageTransferred,
          transferDate: input.transferDate,
          considerationAmount: input.considerationAmount,
          approvedBy: input.approvedBy,
        },
      });
    });
  }
}

@Injectable()
export class ReserveService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.reserveFund.findMany({ where: { isActive: true } });
  }

  create(data: { name: string; coaAccountId: string; description?: string }) {
    return this.prisma.reserveFund.create({ data });
  }
}

@Injectable()
export class ProfitAppropriationService {
  private readonly logger = new Logger(ProfitAppropriationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(data: {
    fiscalYear: string;
    netProfitAmount: number;
    taxProvisionAmount: number;
    reserveAllocations: Array<{ reserveFundId: string; amount: number }>;
    createdBy: string;
  }) {
    const reserveSum = data.reserveAllocations.reduce((s, r) => s + r.amount, 0);
    const afterTax = data.netProfitAmount - data.taxProvisionAmount;
    if (reserveSum > afterTax) {
      throw DomainException.withCode(
        ErrorCode.ALLOCATION_EXCEEDS_PROFIT,
        422,
        'Reserve allocations exceed net profit after tax',
      );
    }
    const distributable = afterTax - reserveSum;
    return this.prisma.profitAppropriation.create({
      data: {
        fiscalYear: data.fiscalYear,
        netProfitAmount: data.netProfitAmount,
        taxProvisionAmount: data.taxProvisionAmount,
        reserveAllocations: data.reserveAllocations as unknown as Prisma.InputJsonValue,
        distributableAmount: distributable,
        retainedAmount: 0,
        createdBy: data.createdBy,
        status: 'draft',
      },
    });
  }

  async approve(id: string, approvedBy: string) {
    const appr = await this.prisma.profitAppropriation.findUnique({ where: { id } });
    if (!appr) throw DomainException.notFound('Appropriation not found');
    if (appr.status !== 'draft') throw DomainException.conflict('Not draft');

    const updated = await this.prisma.profitAppropriation.update({
      where: { id },
      data: { status: 'approved', approvedBy },
    });
    this.events.emit(EventNames.APPROPRIATION_APPROVED, { appropriationId: id });
    return updated;
  }

  /**
   * FI-06: generate one disbursement per active shareholder.
   * Rounding remainder allocated to largest shareholder.
   */
  async disburse(id: string) {
    const appr = await this.prisma.profitAppropriation.findUnique({ where: { id } });
    if (!appr) throw DomainException.notFound('Appropriation not found');
    if (appr.status !== 'approved') {
      throw DomainException.conflict('Appropriation must be approved');
    }

    const period = await this.prisma.fiscalPeriod.findFirst({
      where: {
        academicOrFiscalYear: appr.fiscalYear,
        status: { in: ['closed', 'locked'] },
      },
    });
    if (!period) {
      throw DomainException.withCode(
        ErrorCode.PERIOD_NOT_CLOSED,
        409,
        'Fiscal year must be closed before disbursement',
      );
    }

    const shareholders = await this.prisma.shareholder.findMany({
      where: { status: 'active' },
      orderBy: { sharePercentage: 'desc' },
    });

    const distributable = appr.distributableAmount;
    const rows = shareholders.map((s) => {
      const gross = Math.floor(
        (distributable * Number(s.sharePercentage)) / 100,
      );
      return { shareholder: s, gross };
    });
    const allocated = rows.reduce((s, r) => s + r.gross, 0);
    const remainder = distributable - allocated;
    if (rows.length) rows[0].gross += remainder;

    const org = await this.prisma.organizationSettings.findFirst();
    const taxPct = org?.dividendWithholdingTaxPercent ?? 10;

    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const tax = Math.round((r.gross * taxPct) / 100);
        await tx.profitDisbursement.create({
          data: {
            appropriationId: id,
            shareholderId: r.shareholder.id,
            sharePercentage: r.shareholder.sharePercentage,
            grossAmount: r.gross,
            taxWithheldAmount: tax,
            netAmount: r.gross - tax,
            status: 'pending',
          },
        });
      }
      await tx.profitAppropriation.update({
        where: { id },
        data: { status: 'disbursed' },
      });
    });

    return this.prisma.profitDisbursement.findMany({
      where: { appropriationId: id },
    });
  }
}

@Injectable()
export class DisbursementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
  ) {}

  async pay(
    id: string,
    data: {
      paymentMethod: 'cash' | 'bank_transfer' | 'cheque' | 'online';
      paymentDate: Date;
      paymentReference?: string;
      receivedBy: string;
    },
  ) {
    const d = await this.prisma.profitDisbursement.findUnique({
      where: { id },
      include: { shareholder: true },
    });
    if (!d) throw DomainException.notFound('Disbursement not found');
    if (d.status === 'paid') throw DomainException.conflict('Already paid');

    const voucherNumber = await this.numbering.nextCode('voucher');
    const cert = `TC-${voucherNumber}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.create({
        data: {
          voucherNumber,
          voucherType: 'bank_payment',
          voucherDate: data.paymentDate,
          partyType: 'shareholder',
          partyId: d.shareholderId,
          partyName: d.shareholder.name,
          amount: d.netAmount,
          narration: `Dividend disbursement ${cert}`,
          status: 'posted',
          preparedBy: data.receivedBy,
          approvedBy: data.receivedBy,
        },
      });

      return tx.profitDisbursement.update({
        where: { id },
        data: {
          status: 'paid',
          voucherId: voucher.id,
          paymentMethod: data.paymentMethod,
          paymentDate: data.paymentDate,
          paymentReference: data.paymentReference,
          taxCertificateNumber: cert,
        },
      });
    });

    this.events.emit(EventNames.DISBURSEMENT_PAID, { disbursementId: id });
    return result;
  }

  dividendRegister(fiscalYear?: string) {
    return this.prisma.profitDisbursement.findMany({
      where: fiscalYear
        ? { appropriation: { fiscalYear } }
        : undefined,
      include: { shareholder: true, appropriation: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
