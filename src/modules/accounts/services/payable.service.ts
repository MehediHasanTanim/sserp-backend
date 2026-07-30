import { Injectable } from '@nestjs/common';
import { ApPartyType, ArLedgerStatus } from '@prisma/client';
import { DomainException } from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { VoucherService } from './voucher.service';

@Injectable()
export class PayableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchers: VoucherService,
  ) {}

  async list(filters?: { partyType?: ApPartyType; status?: ArLedgerStatus }) {
    return this.prisma.apLedger.findMany({
      where: filters,
      orderBy: { dueDate: 'asc' },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.apLedger.findUnique({ where: { id } });
    if (!row) throw DomainException.notFound('Payable not found');
    return row;
  }

  async aging(asOf = new Date()) {
    const open = await this.prisma.apLedger.findMany({
      where: { status: { in: ['open', 'partially_settled'] } },
    });
    const buckets = { current: 0, days31_60: 0, days61_90: 0, over90: 0 };
    for (const row of open) {
      const days = Math.floor((asOf.getTime() - row.dueDate.getTime()) / 86400000);
      const amt = row.outstandingAmount;
      if (days <= 30) buckets.current += amt;
      else if (days <= 60) buckets.days31_60 += amt;
      else if (days <= 90) buckets.days61_90 += amt;
      else buckets.over90 += amt;
    }
    return { asOf, buckets };
  }

  async schedulePayment(id: string, scheduledPayDate: Date) {
    await this.findById(id);
    return this.prisma.apLedger.update({
      where: { id },
      data: { scheduledPayDate },
    });
  }

  /** Creates a draft bank payment voucher for the outstanding amount. */
  async pay(id: string, userId: string, bankAccountId: string, costCenter: string) {
    const row = await this.findById(id);
    if (row.outstandingAmount <= 0) {
      throw DomainException.conflict('Nothing outstanding to pay');
    }
    const voucher = await this.vouchers.createDraft(
      {
        voucherType: 'bank_payment',
        voucherDate: new Date(),
        bankAccountId,
        partyType: row.partyType === 'vendor' ? 'vendor' : 'employee',
        partyId: row.partyId,
        amount: row.outstandingAmount,
        narration: `Payment for ${row.invoiceNumber ?? row.sourceType}`,
        costCenter,
      },
      userId,
    );
    return { payable: row, voucher };
  }
}
