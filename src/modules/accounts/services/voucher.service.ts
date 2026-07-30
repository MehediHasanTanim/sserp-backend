import { Injectable } from '@nestjs/common';
import { PartyType, VoucherType } from '@prisma/client';
import { NumberingService } from '../../admin/services/organization.service';
import { DomainException, ErrorCode } from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AccountsService } from './accounts.service';

export interface CreateVoucherDto {
  voucherType: VoucherType;
  voucherDate: Date;
  bankAccountId?: string;
  partyType?: PartyType;
  partyId?: string;
  partyName?: string;
  amount: number;
  narration: string;
  costCenter: string;
}

@Injectable()
export class VoucherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly accounts: AccountsService,
  ) {}

  async list(filters?: { status?: string; from?: Date; to?: Date }) {
    return this.prisma.voucher.findMany({
      where: {
        status: filters?.status as any,
        voucherDate: { gte: filters?.from, lte: filters?.to },
      },
      orderBy: { voucherDate: 'desc' },
    });
  }

  async findById(id: string) {
    const v = await this.prisma.voucher.findUnique({
      where: { id },
      include: { journal: true, bankAccount: true },
    });
    if (!v) throw DomainException.notFound('Voucher not found');
    return v;
  }

  async createDraft(dto: CreateVoucherDto, preparedBy: string) {
    const voucherNumber = await this.numbering.nextCode('voucher');
    return this.prisma.voucher.create({
      data: {
        voucherNumber,
        voucherType: dto.voucherType,
        voucherDate: dto.voucherDate,
        bankAccountId: dto.bankAccountId,
        partyType: dto.partyType,
        partyId: dto.partyId,
        partyName: dto.partyName,
        amount: dto.amount,
        narration: dto.narration,
        preparedBy,
        status: 'draft',
      },
    });
  }

  async post(id: string, approverId: string, costCenter: string) {
    const voucher = await this.findById(id);
    if (voucher.status !== 'draft') {
      throw DomainException.conflict(`Voucher is ${voucher.status}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const journal = await this.accounts.postFromRequest(
        {
          referenceType: 'voucher',
          referenceId: voucher.id,
          amount: voucher.amount,
          costCenter,
          description: voucher.narration,
          debitAccountCode: '',
          creditAccountCode: '',
          postingDate: voucher.voucherDate,
          payload: { variant: voucher.voucherType, paymentMethod: voucher.voucherType },
        },
        tx,
      );
      return tx.voucher.update({
        where: { id },
        data: { status: 'posted', journalId: journal.id, approvedBy: approverId },
        include: { journal: true },
      });
    });
  }

  async cancel(id: string) {
    const voucher = await this.findById(id);
    if (voucher.status === 'posted') {
      throw DomainException.withCode(ErrorCode.VOUCHER_POSTED, 409, 'Posted voucher cannot be cancelled');
    }
    if (voucher.status === 'cancelled') throw DomainException.conflict('Already cancelled');
    return this.prisma.voucher.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }
}
