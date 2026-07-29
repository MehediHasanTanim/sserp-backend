import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MinioService } from '../services/minio.service';
import { PdfRendererService } from './pdf-renderer.service';

/**
 * Worker-side consumer of the `pdf` queue — Puppeteer/Chromium only ever
 * runs here, never in the API process
 * (docs/plan/backend/03-phase2-school-advanced.md §8, PDF rendering approach).
 */
@Processor('pdf')
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly renderer: PdfRendererService,
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'render-iep':
        return this.renderIep(job.data.iepId as string);
      case 'render-progress-report':
        return this.renderProgressReport(job.data.reportId as string);
      default:
        this.logger.warn(`Unknown pdf job name: ${job.name}`);
    }
  }

  private async renderIep(iepId: string) {
    const plan = await this.prisma.iepPlan.findUnique({
      where: { id: iepId },
      include: { goals: true, student: true },
    });
    if (!plan) {
      this.logger.warn(`render-iep: IEP plan ${iepId} not found`);
      return;
    }

    const { buffer, mimeType } = await this.renderer.renderPdf({
      templateName: 'iep-document',
      data: { plan, goals: plan.goals, student: plan.student },
    });

    const objectKey = `${new Date().toISOString().slice(0, 10)}/iep-${plan.id}-v${plan.version}.pdf`;
    await this.minio.raw.putObject('iep-documents', objectKey, buffer, buffer.length, {
      'Content-Type': mimeType,
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        bucket: 'iep-documents',
        objectKey,
        originalFilename: `iep-v${plan.version}.pdf`,
        mimeType,
        sizeBytes: buffer.length,
        entityType: 'iep_plan',
        entityId: plan.id,
        uploadedBy: plan.approvedBy ?? plan.createdByTeacherId ?? plan.studentId,
        status: 'confirmed',
      },
    });

    await this.prisma.iepPlan.update({
      where: { id: plan.id },
      data: { documentAttachmentId: attachment.id },
    });
  }

  private async renderProgressReport(reportId: string) {
    const report = await this.prisma.progressReport.findUnique({
      where: { id: reportId },
      include: { student: true, template: true, goalLinks: true },
    });
    if (!report) {
      this.logger.warn(`render-progress-report: report ${reportId} not found`);
      return;
    }

    const { buffer, mimeType } = await this.renderer.renderPdf({
      templateName: 'progress-report',
      data: { report, student: report.student },
    });

    const objectKey = `${new Date().toISOString().slice(0, 10)}/progress-report-${report.id}.pdf`;
    await this.minio.raw.putObject('progress-reports', objectKey, buffer, buffer.length, {
      'Content-Type': mimeType,
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        bucket: 'progress-reports',
        objectKey,
        originalFilename: `progress-report-${report.id}.pdf`,
        mimeType,
        sizeBytes: buffer.length,
        entityType: 'progress_report',
        entityId: report.id,
        uploadedBy: report.reviewedBy ?? report.submittedBy ?? report.studentId,
        status: 'confirmed',
      },
    });

    await this.prisma.progressReport.update({
      where: { id: report.id },
      data: { documentAttachmentId: attachment.id },
    });
  }
}
