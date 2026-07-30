import { Injectable } from '@nestjs/common';
import { RecurringFrequency } from '@prisma/client';
import { DomainException } from '../../../shared/errors/domain-exception';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { JournalLineInput } from './accounts.service';
import { JournalService } from './journal.service';

export interface RecurringTemplateDto {
  name: string;
  frequency: RecurringFrequency;
  nextRunDate: Date;
  lines: JournalLineInput[];
  description?: string;
}

@Injectable()
export class RecurringJournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
  ) {}

  async list() {
    return this.prisma.recurringJournalTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const t = await this.prisma.recurringJournalTemplate.findUnique({ where: { id } });
    if (!t) throw DomainException.notFound('Recurring template not found');
    return t;
  }

  async create(dto: RecurringTemplateDto, userId: string) {
    return this.prisma.recurringJournalTemplate.create({
      data: {
        name: dto.name,
        frequency: dto.frequency,
        nextRunDate: dto.nextRunDate,
        lines: dto.lines as object,
        description: dto.description,
        createdBy: userId,
      },
    });
  }

  async update(id: string, dto: Partial<RecurringTemplateDto>) {
    await this.findById(id);
    return this.prisma.recurringJournalTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        frequency: dto.frequency,
        nextRunDate: dto.nextRunDate,
        lines: dto.lines ? (dto.lines as object) : undefined,
        description: dto.description,
      },
    });
  }

  async deactivate(id: string) {
    await this.findById(id);
    return this.prisma.recurringJournalTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Generate draft journals for templates due on or before today. */
  async generateDue() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const due = await this.prisma.recurringJournalTemplate.findMany({
      where: { isActive: true, nextRunDate: { lte: today } },
    });
    const results = [];
    for (const template of due) {
      const lines = template.lines as unknown as JournalLineInput[];
      const costCenter = lines.find((l) => l.costCenter)?.costCenter;
      const draft = await this.journals.createDraft(
        {
          entryDate: template.nextRunDate,
          description: template.description ?? template.name,
          costCenter,
          lines,
        },
        template.createdBy,
      );
      const nextRunDate = this.advanceDate(template.nextRunDate, template.frequency);
      await this.prisma.recurringJournalTemplate.update({
        where: { id: template.id },
        data: { nextRunDate, lastGeneratedJournalId: draft.id },
      });
      results.push({ templateId: template.id, journalId: draft.id });
    }
    return { generated: results.length, results };
  }

  private advanceDate(date: Date, frequency: RecurringFrequency): Date {
    const d = new Date(date);
    if (frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (frequency === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d;
  }
}
