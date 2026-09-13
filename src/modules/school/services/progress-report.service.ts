import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProgressReport, ProgressReportStatus, ProgressReportType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import {
  AddProgressReportEvidenceDto,
  CreateProgressReportDto,
  CreateReportTemplateDto,
  UpdateProgressReportDto,
  UpdateReportTemplateDto,
} from '../dto/progress-report.dto';

const REPORT_INCLUDE = {
  goalLinks: true,
  evidence: true,
};

/**
 * Progress report draft → submit → approve/reject → publish workflow.
 * Rules P-01 through P-07 — docs/plan/backend/03-phase2-school-advanced.md §6.
 */
@Injectable()
export class ProgressReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Optional() @InjectQueue('pdf') private readonly pdfQueue?: Queue,
  ) {}

  // ---- Templates ----

  async listTemplates(reportType?: ProgressReportType) {
    return this.prisma.reportTemplate.findMany({
      where: {
        isActive: true,
        ...(reportType ? { reportType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(input: CreateReportTemplateDto) {
    return this.prisma.reportTemplate.create({
      data: {
        name: input.name,
        reportType: input.reportType,
        disabilityCategory: input.disabilityCategory,
        sections: input.sections as object,
        ratingScale: input.ratingScale as object | undefined,
        isActive: true,
      },
    });
  }

  async updateTemplate(id: string, input: UpdateReportTemplateDto) {
    const existing = await this.prisma.reportTemplate.findUnique({
      where: { id },
    });
    if (!existing) throw DomainException.notFound('Report template not found');
    return this.prisma.reportTemplate.update({
      where: { id },
      data: {
        name: input.name,
        sections: input.sections as object | undefined,
        ratingScale: input.ratingScale as object | undefined,
        isActive: input.isActive,
      },
    });
  }

  /** P-06: resolves by disability category first, then the catch-all template. */
  private async resolveTemplate(
    reportType: ProgressReportType,
    disabilityCategory?: string | null,
  ) {
    let template = null;
    if (disabilityCategory) {
      template = await this.prisma.reportTemplate.findFirst({
        where: { reportType, disabilityCategory, isActive: true },
      });
    }
    if (!template) {
      template = await this.prisma.reportTemplate.findFirst({
        where: { reportType, disabilityCategory: null, isActive: true },
      });
    }
    if (!template) {
      throw DomainException.withCode(
        ErrorCode.NO_TEMPLATE,
        422,
        `No ${reportType} report template configured`,
      );
    }
    return template;
  }

  // ---- Reports ----

  async listForStudent(studentId: string, publishedOnly = false) {
    return this.prisma.progressReport.findMany({
      where: {
        studentId,
        status: publishedOnly ? 'published' : undefined,
      },
      include: REPORT_INCLUDE,
      orderBy: { periodStart: 'desc' },
    });
  }

  /** Cross-student status board for coordinators / principals. */
  async listBoard(query: {
    page?: number;
    pageSize?: number;
    status?: ProgressReportStatus;
  }) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 100);
    const where = {
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.progressReport.count({ where }),
      this.prisma.progressReport.findMany({
        where,
        include: {
          ...REPORT_INCLUDE,
          template: { select: { id: true, name: true } },
        },
        orderBy: [{ periodStart: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = rows.map(({ template, ...report }) => ({
      ...report,
      templateName: template.name,
    }));

    return { items, page, pageSize, total };
  }

  async get(id: string) {
    const report = await this.prisma.progressReport.findUnique({
      where: { id },
      include: REPORT_INCLUDE,
    });
    if (!report) throw DomainException.notFound('Progress report not found');
    return report;
  }

  /** P-04, P-06 — P-07 goal links are enforced on submit so drafts can be created first. */
  async create(studentId: string, input: CreateProgressReportDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (!student) throw DomainException.notFound('Student not found');

    const periodStart = new Date(input.periodStart);
    const existing = await this.prisma.progressReport.findUnique({
      where: {
        studentId_reportType_periodStart: {
          studentId,
          reportType: input.reportType,
          periodStart,
        },
      },
    });
    if (existing) {
      throw DomainException.withCode(
        ErrorCode.REPORT_EXISTS,
        409,
        'A report for this student, type, and period already exists',
      );
    }

    const template = await this.resolveTemplate(
      input.reportType,
      student.disabilityCategory,
    );

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.progressReport.create({
        data: {
          studentId,
          templateId: template.id,
          reportType: input.reportType,
          periodStart,
          periodEnd: new Date(input.periodEnd),
          academicYearId: input.academicYearId,
          status: 'draft',
          narrativeSections: input.narrativeSections as object | undefined,
          domainRatings: input.domainRatings as object | undefined,
        },
      });

      for (const link of input.goalLinks ?? []) {
        await tx.progressReportGoalLink.create({
          data: {
            progressReportId: report.id,
            iepGoalId: link.iepGoalId,
            progressNote: link.progressNote,
            rating: link.rating,
          },
        });
      }

      return tx.progressReport.findUnique({
        where: { id: report.id },
        include: REPORT_INCLUDE,
      });
    });
  }

  private assertDraft(report: ProgressReport) {
    if (report.status !== 'draft') {
      throw DomainException.withCode(
        ErrorCode.INVALID_REPORT_TRANSITION,
        409,
        'Only draft reports can be edited',
      );
    }
  }

  async update(id: string, input: UpdateProgressReportDto) {
    const report = await this.get(id);
    this.assertDraft(report);
    return this.prisma.progressReport.update({
      where: { id },
      data: {
        narrativeSections: input.narrativeSections as object | undefined,
        domainRatings: input.domainRatings as object | undefined,
      },
      include: REPORT_INCLUDE,
    });
  }

  /** Permanently removes a draft report. Submitted/approved/published cannot be deleted. */
  async deleteDraft(id: string) {
    const report = await this.get(id);
    if (report.status !== 'draft') {
      throw DomainException.withCode(
        ErrorCode.INVALID_REPORT_TRANSITION,
        409,
        'Only draft progress reports can be deleted',
      );
    }
    await this.prisma.progressReport.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** P-07: monthly reports require ≥1 IEP goal link when the student has an active IEP. */
  private async assertGoalLinksIfRequired(report: {
    studentId: string;
    reportType: ProgressReportType;
    goalLinks?: unknown[];
  }) {
    if (report.reportType !== 'monthly_progress') return;
    const activeIep = await this.prisma.iepPlan.findFirst({
      where: { studentId: report.studentId, status: 'active' },
    });
    if (activeIep && !(report.goalLinks?.length ?? 0)) {
      throw DomainException.withCode(
        ErrorCode.GOAL_LINK_REQUIRED,
        422,
        'A monthly report must link at least one IEP goal when the student has an active IEP',
      );
    }
  }

  /** P-01/P-02/P-07: draft → submitted; only the original author may (re)submit. */
  async submit(id: string, actorId: string) {
    const report = await this.get(id);
    if (report.status !== 'draft') {
      throw DomainException.withCode(
        ErrorCode.INVALID_REPORT_TRANSITION,
        409,
        `Cannot submit a report in status ${report.status}`,
      );
    }
    if (report.submittedBy && report.submittedBy !== actorId) {
      throw DomainException.forbidden(
        'Only the authoring teacher may submit this report',
      );
    }
    await this.assertGoalLinksIfRequired(report);

    const updated = await this.prisma.progressReport.update({
      where: { id },
      data: {
        status: 'submitted',
        submittedBy: actorId,
        submittedAt: new Date(),
      },
      include: REPORT_INCLUDE,
    });

    await this.events.emitAsync(EventNames.PROGRESS_REPORT_SUBMITTED, {
      reportId: id,
      studentId: report.studentId,
      submittedBy: actorId,
    });

    return updated;
  }

  /** P-01/P-02: submitted → approved; teachers may never approve their own report. */
  async approve(id: string, actorId: string, actorRoles: string[] = []) {
    const report = await this.get(id);
    if (report.status !== 'submitted') {
      throw DomainException.withCode(
        ErrorCode.INVALID_REPORT_TRANSITION,
        409,
        `Cannot approve a report in status ${report.status}`,
      );
    }
    const isElevatedReviewer = actorRoles.some((role) =>
      ['coordinator', 'principal', 'super_admin'].includes(role),
    );
    if (report.submittedBy === actorId && !isElevatedReviewer) {
      throw DomainException.forbidden(
        'A teacher cannot approve their own report',
      );
    }

    const updated = await this.prisma.progressReport.update({
      where: { id },
      data: { status: 'approved', reviewedBy: actorId, reviewedAt: new Date() },
      include: REPORT_INCLUDE,
    });

    await this.events.emitAsync(EventNames.PROGRESS_REPORT_APPROVED, {
      reportId: id,
      studentId: report.studentId,
      approvedBy: actorId,
    });

    return updated;
  }

  /** P-01/P-03: submitted → draft (reopened for edits), comment mandatory. */
  async reject(id: string, actorId: string, comment: string) {
    const report = await this.get(id);
    if (report.status !== 'submitted') {
      throw DomainException.withCode(
        ErrorCode.INVALID_REPORT_TRANSITION,
        409,
        `Cannot reject a report in status ${report.status}`,
      );
    }
    if (!comment || !comment.trim()) {
      throw DomainException.validation('A rejection comment is required');
    }

    return this.prisma.progressReport.update({
      where: { id },
      data: {
        status: 'draft',
        reviewedBy: actorId,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
      include: REPORT_INCLUDE,
    });
  }

  /** P-01/P-05: approved → published; queues PDF render before parent notification. */
  async publish(id: string) {
    const report = await this.get(id);
    if (report.status !== 'approved') {
      throw DomainException.withCode(
        ErrorCode.INVALID_REPORT_TRANSITION,
        409,
        `Cannot publish a report in status ${report.status}`,
      );
    }

    const updated = await this.prisma.progressReport.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
      include: REPORT_INCLUDE,
    });

    if (this.pdfQueue) {
      await this.pdfQueue
        .add('render-progress-report', { reportId: id })
        .catch(() => undefined);
    }

    await this.events.emitAsync(EventNames.PROGRESS_REPORT_PUBLISHED, {
      reportId: id,
      studentId: report.studentId,
    });

    return updated;
  }

  async addEvidence(id: string, input: AddProgressReportEvidenceDto) {
    await this.get(id);
    return this.prisma.progressReportEvidence.create({
      data: {
        progressReportId: id,
        attachmentId: input.attachmentId,
        caption: input.caption,
      },
    });
  }

  async progressTrend(studentId: string) {
    const activeIep = await this.prisma.iepPlan.findFirst({
      where: { studentId, status: 'active' },
      include: { goals: true },
    });
    if (!activeIep) return { studentId, goals: [] };

    const goals = await Promise.all(
      activeIep.goals.map(async (goal) => ({
        goalId: goal.id,
        description: goal.description,
        currentStatus: goal.status,
        currentPercentage: goal.progressPercentage,
        history: await this.prisma.iepGoalProgressEntry.findMany({
          where: { goalId: goal.id },
          orderBy: { entryDate: 'asc' },
        }),
      })),
    );

    return { studentId, iepId: activeIep.id, goals };
  }
}
