import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ArLedgerStatus, ArSourceType, PartyType } from '@prisma/client';
import { NumberingService } from '../../admin/services/organization.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface CreateFromInvoiceInput {
  partyType: PartyType;
  partyId: string;
  sourceType: ArSourceType;
  sourceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  grossAmount: number;
  costCenter: string;
}

@Injectable()
export class ReceivableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
  ) {}

  async list(filters?: {
    partyType?: PartyType;
    partyId?: string;
    status?: ArLedgerStatus;
  }) {
    return this.prisma.arLedger.findMany({
      where: filters,
      orderBy: { dueDate: 'asc' },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.arLedger.findUnique({
      where: { id },
      include: { followUps: { orderBy: { followUpDate: 'desc' } } },
    });
    if (!row) throw DomainException.notFound('Receivable not found');
    return row;
  }

  async createFromInvoice(input: CreateFromInvoiceInput) {
    return this.prisma.arLedger.create({
      data: {
        ...input,
        settledAmount: 0,
        outstandingAmount: input.grossAmount,
        status: 'open',
      },
    });
  }

  async aging(asOf = new Date()) {
    const open = await this.prisma.arLedger.findMany({
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
    return { asOf, buckets, count: open.length };
  }

  async settle(partyType: PartyType, partyId: string, amount: number, targetInvoiceId?: string) {
    return this.prisma.$transaction(async (tx) => {
      let remaining = amount;
      const rows = targetInvoiceId
        ? [await tx.arLedger.findUniqueOrThrow({ where: { id: targetInvoiceId } })]
        : await tx.arLedger.findMany({
            where: {
              partyType,
              partyId,
              status: { in: ['open', 'partially_settled'] },
            },
            orderBy: { dueDate: 'asc' },
          });
      const settled: string[] = [];
      for (const row of rows) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, row.outstandingAmount);
        const newSettled = row.settledAmount + apply;
        const newOutstanding = row.grossAmount - newSettled;
        const status: ArLedgerStatus =
          newOutstanding === 0 ? 'settled' : 'partially_settled';
        await tx.arLedger.update({
          where: { id: row.id },
          data: { settledAmount: newSettled, outstandingAmount: newOutstanding, status },
        });
        remaining -= apply;
        settled.push(row.id);
      }
      return { settled, unapplied: remaining };
    });
  }

  async writeOff(id: string, reason: string, approverId: string) {
    const row = await this.findById(id);
    if (row.status === 'settled' || row.status === 'written_off') {
      throw DomainException.conflict('Cannot write off this receivable');
    }
    const noteNumber = await this.numbering.nextCode('credit_note');
    const result = await this.prisma.$transaction(async (tx) => {
      const note = await tx.creditDebitNote.create({
        data: {
          noteNumber,
          partyType: row.partyType,
          partyId: row.partyId,
          arLedgerId: id,
          amount: row.outstandingAmount,
          reason,
          noteType: 'write_off',
          approvedBy: approverId,
          status: 'posted',
        },
      });
      await tx.arLedger.update({
        where: { id },
        data: { status: 'written_off', outstandingAmount: 0, settledAmount: row.grossAmount },
      });
      return note;
    });
    this.events.emit(EventNames.RECEIVABLE_WRITTEN_OFF, { arLedgerId: id, noteId: result.id });
    return result;
  }

  async addFollowUp(
    arLedgerId: string,
    data: {
      followUpDate: Date;
      channel: 'call' | 'sms' | 'email' | 'meeting';
      outcome: string;
      promisedPaymentDate?: Date;
      notes?: string;
    },
    recordedBy: string,
  ) {
    await this.findById(arLedgerId);
    return this.prisma.collectionFollowUp.create({
      data: { arLedgerId, ...data, recordedBy },
    });
  }
}
