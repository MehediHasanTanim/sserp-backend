import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JournalEntryStatus } from '@prisma/client';
import { NumberingService } from '../../admin/services/organization.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AccountsService, JournalLineInput } from './accounts.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { BudgetCheckService } from './budget-check.service';

export interface JournalDraftDto {
  entryDate: Date;
  description: string;
  costCenter?: string;
  lines: JournalLineInput[];
  budgetOverrideReason?: string;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly fiscalPeriods: FiscalPeriodService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
    @Optional() private readonly budgetCheck?: BudgetCheckService,
  ) {}

  async list(filters?: {
    status?: JournalEntryStatus;
    from?: Date;
    to?: Date;
  }) {
    return this.prisma.journalEntry.findMany({
      where: {
        status: filters?.status,
        entryDate: {
          gte: filters?.from,
          lte: filters?.to,
        },
      },
      orderBy: { entryDate: 'desc' },
      include: { lines: { include: { account: true } } },
    });
  }

  async findById(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: { include: { account: true }, orderBy: { lineNumber: 'asc' } },
      },
    });
    if (!entry) throw DomainException.notFound('Journal entry not found');
    return entry;
  }

  async createDraft(dto: JournalDraftDto, userId: string) {
    this.accounts.validateLines(dto.lines);
    const totalDebit = dto.lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = dto.lines.reduce((s, l) => s + l.creditAmount, 0);
    if (totalDebit !== totalCredit) {
      throw DomainException.withCode(
        ErrorCode.JOURNAL_UNBALANCED,
        422,
        'Journal unbalanced',
      );
    }
    const period = await this.fiscalPeriods.requireOpenForDate(dto.entryDate);
    const entryNumber = await this.numbering.nextCode('journal_entry');
    return this.prisma.journalEntry.create({
      data: {
        entryNumber,
        entryDate: dto.entryDate,
        fiscalPeriodId: period.id,
        entryType: 'manual',
        description: dto.description,
        status: 'draft',
        totalDebit,
        totalCredit,
        costCenter: dto.costCenter,
        budgetOverrideReason: dto.budgetOverrideReason,
        lines: {
          create: dto.lines.map((l, i) => ({
            lineNumber: i + 1,
            accountId: l.accountId,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
            costCenter: l.costCenter ?? dto.costCenter,
            narration: l.narration,
            referenceType: l.referenceType,
            referenceId: l.referenceId,
            taxId: l.taxId,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async updateDraft(id: string, dto: Partial<JournalDraftDto>) {
    const entry = await this.findById(id);
    if (entry.status !== 'draft') {
      throw DomainException.withCode(
        ErrorCode.JOURNAL_IMMUTABLE,
        409,
        'Only draft entries can be edited',
      );
    }
    if (dto.lines) {
      this.accounts.validateLines(dto.lines);
      const totalDebit = dto.lines.reduce((s, l) => s + l.debitAmount, 0);
      const totalCredit = dto.lines.reduce((s, l) => s + l.creditAmount, 0);
      if (totalDebit !== totalCredit) {
        throw DomainException.withCode(
          ErrorCode.JOURNAL_UNBALANCED,
          422,
          'Journal unbalanced',
        );
      }
      await this.prisma.journalLine.deleteMany({ where: { journalId: id } });
      await this.prisma.journalEntry.update({
        where: { id },
        data: {
          entryDate: dto.entryDate,
          description: dto.description,
          costCenter: dto.costCenter,
          totalDebit,
          totalCredit,
          budgetOverrideReason: dto.budgetOverrideReason,
          lines: {
            create: dto.lines.map((l, i) => ({
              lineNumber: i + 1,
              accountId: l.accountId,
              debitAmount: l.debitAmount,
              creditAmount: l.creditAmount,
              costCenter: l.costCenter ?? dto.costCenter ?? entry.costCenter,
              narration: l.narration,
              referenceType: l.referenceType,
              referenceId: l.referenceId,
              taxId: l.taxId,
            })),
          },
        },
      });
    } else {
      await this.prisma.journalEntry.update({
        where: { id },
        data: {
          entryDate: dto.entryDate,
          description: dto.description,
          costCenter: dto.costCenter,
          budgetOverrideReason: dto.budgetOverrideReason,
        },
      });
    }
    return this.findById(id);
  }

  async submit(id: string, userId: string) {
    const entry = await this.findById(id);
    if (entry.status !== 'draft') {
      throw DomainException.conflict(
        `Cannot submit entry in status ${entry.status}`,
      );
    }
    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: 'submitted', submittedBy: userId },
      include: { lines: true },
    });
  }

  async approve(id: string, approverId: string) {
    const entry = await this.findById(id);
    if (entry.status !== 'submitted') {
      throw DomainException.conflict('Only submitted entries can be approved');
    }
    if (entry.submittedBy === approverId) {
      throw DomainException.withCode(
        ErrorCode.SELF_APPROVAL_FORBIDDEN,
        403,
        'Creator cannot approve their own entry',
      );
    }
    const lines: JournalLineInput[] = entry.lines.map((l) => ({
      accountId: l.accountId,
      debitAmount: l.debitAmount,
      creditAmount: l.creditAmount,
      costCenter: l.costCenter ?? entry.costCenter ?? undefined,
      narration: l.narration ?? undefined,
      referenceType: l.referenceType ?? undefined,
      referenceId: l.referenceId ?? undefined,
      taxId: l.taxId ?? undefined,
    }));

    return this.prisma.$transaction(async (tx) => {
      this.accounts.validateLines(lines);
      await this.fiscalPeriods.requireOpenForDate(entry.entryDate, tx);
      if (this.budgetCheck) {
        await this.budgetCheck.checkExpenseLines(lines, entry.entryDate, {
          overrideReason: entry.budgetOverrideReason ?? undefined,
          tx,
        });
      }
      const posted = await tx.journalEntry.update({
        where: { id },
        data: {
          status: 'posted',
          postedAt: new Date(),
          postedBy: approverId,
          approvedBy: approverId,
        },
        include: { lines: true },
      });
      if (this.budgetCheck) {
        await this.budgetCheck.recordConsumption(id, lines, tx);
      }
      this.events.emit(EventNames.JOURNAL_POSTED, {
        journalId: posted.id,
        entryNumber: posted.entryNumber,
        entryType: posted.entryType,
      });
      return posted;
    });
  }

  async reject(id: string, reason: string, userId: string) {
    if (!reason?.trim())
      throw DomainException.validation('Rejection reason is required');
    const entry = await this.findById(id);
    if (entry.status !== 'submitted') {
      throw DomainException.conflict('Only submitted entries can be rejected');
    }
    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: reason, approvedBy: userId },
    });
  }

  async reverse(id: string, reason: string, userId: string) {
    const original = await this.findById(id);
    if (original.status !== 'posted') {
      throw DomainException.conflict('Only posted entries can be reversed');
    }
    if (original.entryType === 'reversal') {
      throw DomainException.withCode(
        ErrorCode.JOURNAL_IMMUTABLE,
        409,
        'Cannot reverse a reversal entry',
      );
    }
    const existingReversal = await this.prisma.journalEntry.findFirst({
      where: { reversesJournalId: id },
    });
    if (existingReversal) {
      throw DomainException.conflict('Reversal already exists');
    }

    const mirroredLines: JournalLineInput[] = original.lines.map((l) => ({
      accountId: l.accountId,
      debitAmount: l.creditAmount,
      creditAmount: l.debitAmount,
      costCenter: l.costCenter ?? original.costCenter ?? undefined,
      narration: `Reversal: ${reason}`,
    }));

    return this.prisma.$transaction(async (tx) => {
      const reversal = await this.accounts.createPostedJournal(
        {
          entryDate: new Date(),
          entryType: 'reversal',
          description: `Reversal of ${original.entryNumber}: ${reason}`,
          costCenter: original.costCenter ?? undefined,
          lines: mirroredLines,
          postedBy: userId,
          skipBudgetCheck: true,
        },
        tx,
      );
      await tx.journalEntry.update({
        where: { id: reversal.id },
        data: { reversesJournalId: id },
      });
      await tx.journalEntry.update({
        where: { id },
        data: { status: 'reversed' },
      });
      this.events.emit(EventNames.JOURNAL_REVERSED, {
        originalId: id,
        reversalId: reversal.id,
      });
      return this.findById(reversal.id);
    });
  }
}
