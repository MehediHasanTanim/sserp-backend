import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { MinioService } from '../../files/services/minio.service';

/**
 * Presigned download URLs for Phase 2 PDF attachments (IEP, progress reports, invoices).
 * Returns 404 until the pdf queue has written `documentAttachmentId`.
 */
@Injectable()
export class SchoolDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  async downloadByAttachmentId(attachmentId: string | null | undefined) {
    if (!attachmentId) {
      throw DomainException.notFound('Document not yet available');
    }
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null, status: 'confirmed' },
    });
    if (!att) {
      throw DomainException.notFound('Document not yet available');
    }
    const url = await this.minio.presignDownload(att.bucket, att.objectKey);
    return {
      url,
      expiresInSeconds: 900,
      filename: att.originalFilename,
      mimeType: att.mimeType,
      attachmentId: att.id,
    };
  }

  async iepDocument(iepId: string) {
    const plan = await this.prisma.iepPlan.findUnique({ where: { id: iepId } });
    if (!plan) throw DomainException.notFound('IEP plan not found');
    return this.downloadByAttachmentId(plan.documentAttachmentId);
  }

  async progressReportDocument(reportId: string) {
    const report = await this.prisma.progressReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw DomainException.notFound('Progress report not found');
    return this.downloadByAttachmentId(report.documentAttachmentId);
  }

  async invoiceDocument(invoiceId: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw DomainException.notFound('Invoice not found');
    return this.downloadByAttachmentId(invoice.documentAttachmentId);
  }
}
