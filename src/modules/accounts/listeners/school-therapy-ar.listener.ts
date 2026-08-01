import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EventNames } from '../../../shared/events/event-names';
import { ReceivableService } from '../services/receivable.service';

/**
 * Maintains ar_ledger alongside fee/therapy invoice events (AR-01 / AR-05).
 * Journals themselves are posted via LedgerPort inside source transactions.
 */
@Injectable()
export class SchoolTherapyArListener {
  private readonly logger = new Logger(SchoolTherapyArListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly receivables: ReceivableService,
  ) {}

  @OnEvent(EventNames.FEE_INVOICE_GENERATED)
  async onFeeInvoice(payload: {
    invoiceId: string;
    studentId: string;
    invoiceNumber?: string;
    netAmount?: number;
    dueDate?: Date;
    issueDate?: Date;
    isActivity?: boolean;
  }) {
    try {
      const invoice = await this.prisma.feeInvoice.findUnique({
        where: { id: payload.invoiceId },
      });
      if (!invoice) return;
      await this.receivables.createFromInvoice({
        partyType: 'student',
        partyId: invoice.studentId,
        sourceType:
          invoice.invoiceType === 'activity' ? 'activity_fee' : 'tuition_fee',
        sourceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        grossAmount: invoice.netAmount,
        costCenter: 'school',
      });
    } catch (e: any) {
      this.logger.warn(`AR ledger fee invoice: ${e.message}`);
    }
  }

  @OnEvent(EventNames.THERAPY_INVOICE_GENERATED)
  async onTherapyInvoice(payload: {
    invoiceId: string;
    patientId?: string;
    sessionId?: string;
  }) {
    try {
      if (!payload.patientId) return;
      const invoice = await this.prisma.therapyInvoice.findUnique({
        where: { id: payload.invoiceId },
      });
      if (!invoice) return;
      await this.receivables.createFromInvoice({
        partyType: 'patient',
        partyId: invoice.patientId,
        sourceType:
          invoice.sessionMode === 'group'
            ? 'therapy_group'
            : 'therapy_individual',
        sourceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt,
        dueDate: invoice.createdAt,
        grossAmount: invoice.netAmount,
        costCenter: 'therapy',
      });
    } catch (e: any) {
      this.logger.warn(`AR ledger therapy invoice: ${e.message}`);
    }
  }
}
