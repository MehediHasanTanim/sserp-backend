import { Injectable } from '@nestjs/common';
import { ChequeDirection, ChequeStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainException, ErrorCode } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const TRANSITIONS: Record<ChequeStatus, ChequeStatus[]> = {
  pending: ['presented', 'cancelled'],
  presented: ['cleared', 'bounced', 'cancelled'],
  cleared: [],
  bounced: [],
  cancelled: [],
};

export interface CreateChequeDto {
  chequeNumber: string;
  bankAccountId: string;
  direction: ChequeDirection;
  partyName: string;
  amount: number;
  chequeDate: Date;
  voucherId?: string;
}

@Injectable()
export class ChequeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(filters?: { status?: ChequeStatus; bankAccountId?: string }) {
    return this.prisma.cheque.findMany({
      where: { status: filters?.status, bankAccountId: filters?.bankAccountId },
      orderBy: { chequeDate: 'desc' },
    });
  }

  async findById(id: string) {
    const c = await this.prisma.cheque.findUnique({ where: { id } });
    if (!c) throw DomainException.notFound('Cheque not found');
    return c;
  }

  async create(dto: CreateChequeDto) {
    return this.prisma.cheque.create({ data: dto });
  }

  async transitionStatus(id: string, newStatus: ChequeStatus, options?: { reason?: string; clearedDate?: Date }) {
    const cheque = await this.findById(id);
    const allowed = TRANSITIONS[cheque.status];
    if (!allowed.includes(newStatus)) {
      throw DomainException.withCode(
        ErrorCode.INVALID_CHEQUE_TRANSITION,
        409,
        `Cannot transition from ${cheque.status} to ${newStatus}`,
      );
    }
    if (newStatus === 'bounced' && !options?.reason?.trim()) {
      throw DomainException.validation('Bounce reason is required');
    }
    const updated = await this.prisma.cheque.update({
      where: { id },
      data: {
        status: newStatus,
        bounceReason: newStatus === 'bounced' ? options!.reason : undefined,
        clearedDate: newStatus === 'cleared' ? (options?.clearedDate ?? new Date()) : undefined,
      },
    });
    if (newStatus === 'bounced') {
      this.events.emit(EventNames.CHEQUE_BOUNCED, {
        chequeId: id,
        reason: options!.reason,
        amount: cheque.amount,
      });
    }
    return updated;
  }
}
