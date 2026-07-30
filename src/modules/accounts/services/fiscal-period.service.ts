import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { TxClient } from '../../../shared/prisma/transaction.helper';

@Injectable()
export class FiscalPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list() {
    return this.prisma.fiscalPeriod.findMany({
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  async findById(id: string) {
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw DomainException.notFound('Fiscal period not found');
    return period;
  }

  async create(data: {
    academicOrFiscalYear: string;
    periodMonth: number;
    periodYear: number;
    startDate: Date;
    endDate: Date;
  }) {
    return this.prisma.fiscalPeriod.create({ data });
  }

  /** Resolve open period covering a posting date; throw PERIOD_CLOSED if none. */
  async requireOpenForDate(date: Date, tx?: TxClient) {
    const client = tx ?? this.prisma;
    const period = await client.fiscalPeriod.findFirst({
      where: {
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
    if (!period) {
      throw DomainException.withCode(
        ErrorCode.PERIOD_CLOSED,
        409,
        'No fiscal period covers this date',
      );
    }
    if (period.status !== 'open') {
      throw DomainException.withCode(
        ErrorCode.PERIOD_CLOSED,
        409,
        `Fiscal period ${period.periodYear}-${period.periodMonth} is ${period.status}`,
      );
    }
    return period;
  }

  async close(id: string, closedBy: string) {
    const period = await this.findById(id);
    if (period.status !== 'open') {
      throw DomainException.conflict(`Period is already ${period.status}`);
    }
    const updated = await this.prisma.fiscalPeriod.update({
      where: { id },
      data: { status: 'closed', closedBy, closedAt: new Date() },
    });
    this.events.emit(EventNames.PERIOD_CLOSED, { periodId: id, closedBy });
    return updated;
  }

  async reopen(id: string, reason: string, reopenedBy: string) {
    if (!reason || reason.length < 20) {
      throw DomainException.validation('Reopen reason must be at least 20 characters');
    }
    const period = await this.findById(id);
    if (period.status === 'open') throw DomainException.conflict('Period is already open');
    const updated = await this.prisma.fiscalPeriod.update({
      where: { id },
      data: { status: 'open', closedBy: null, closedAt: null },
    });
    this.events.emit(EventNames.PERIOD_REOPENED, { periodId: id, reason, reopenedBy });
    return updated;
  }

  /** Ensure current calendar month period exists (seed helper). */
  async ensureCurrentOpen(fiscalYearLabel: string, month: number, year: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return this.prisma.fiscalPeriod.upsert({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
      create: {
        academicOrFiscalYear: fiscalYearLabel,
        periodMonth: month,
        periodYear: year,
        startDate: start,
        endDate: end,
        status: 'open',
      },
      update: {},
    });
  }
}
