import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerPort, PostingRequest, PostingResult } from './ledger.port';

@Injectable()
export class OutboxLedgerAdapter extends LedgerPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async post(request: PostingRequest, _tx?: unknown): Promise<PostingResult> {
    const row = await this.prisma.pendingLedgerPosting.create({
      data: {
        referenceType: request.referenceType,
        referenceId: request.referenceId,
        amount: request.amount,
        costCenter: request.costCenter,
        description: request.description,
        debitAccountCode: request.debitAccountCode,
        creditAccountCode: request.creditAccountCode,
        postingDate: request.postingDate,
        payload: (request.payload as object | undefined) ?? undefined,
        status: 'pending',
      },
    });
    return { deferred: true, pendingId: row.id };
  }
}
