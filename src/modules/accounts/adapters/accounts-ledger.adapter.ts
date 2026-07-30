import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TxClient } from '../../../shared/prisma/transaction.helper';
import { LedgerPort, PostingRequest, PostingResult } from '../../../shared/ports/ledger.port';
import { AccountsService } from '../services/accounts.service';

@Injectable()
export class AccountsLedgerAdapter extends LedgerPort {
  constructor(
    private readonly accounts: AccountsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async post(request: PostingRequest, tx?: TxClient): Promise<PostingResult> {
    // Prefer caller's transaction (AC-12). Fallback wraps posting atomically so
    // legacy callers that post after commit still get a consistent journal.
    if (tx) {
      const journal = await this.accounts.postFromRequest(request, tx);
      return { deferred: false, journalId: journal.id };
    }
    return this.prisma.$transaction(async (inner) => {
      const journal = await this.accounts.postFromRequest(request, inner);
      return { deferred: false, journalId: journal.id };
    });
  }
}
