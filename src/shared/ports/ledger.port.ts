export interface PostingRequest {
  referenceType: string;
  referenceId: string;
  amount: number;
  costCenter: string;
  description: string;
  debitAccountCode: string;
  creditAccountCode: string;
  postingDate: Date;
  payload?: Record<string, unknown>;
}

export interface PostingResult {
  deferred: boolean;
  pendingId?: string;
  journalId?: string;
}

export abstract class LedgerPort {
  abstract post(request: PostingRequest): Promise<PostingResult>;
}
