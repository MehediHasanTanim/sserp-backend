import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApplicantStage, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { NumberingService } from '../../admin/services/organization.service';
import { BudgetCheckService } from '../../accounts/services/budget-check.service';

const STAGE_ORDER: ApplicantStage[] = [
  'applied',
  'screening',
  'shortlisted',
  'interviewing',
  'offered',
  'accepted',
];

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly events: EventEmitter2,
    private readonly budgetCheck: BudgetCheckService,
  ) {}

  // ---- Requisitions --------------------------------------------------

  listRequisitions(status?: string) {
    return this.prisma.jobRequisition.findMany({
      where: { status: status as never },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRequisition(
    input: {
      title: string;
      department: string;
      designation: string;
      positionsCount: number;
      employmentType: string;
      justification?: string;
      budgetLineId?: string;
      salaryRangeMin?: number;
      salaryRangeMax?: number;
      requiredByDate?: string;
    },
    actorId: string,
  ) {
    const requisitionNumber = await this.numbering.nextCode('job_requisition');
    return this.prisma.jobRequisition.create({
      data: {
        requisitionNumber,
        title: input.title,
        department: input.department,
        designation: input.designation,
        positionsCount: input.positionsCount,
        employmentType: input.employmentType,
        justification: input.justification,
        budgetLineId: input.budgetLineId,
        salaryRangeMin: input.salaryRangeMin,
        salaryRangeMax: input.salaryRangeMax,
        requiredByDate: input.requiredByDate
          ? new Date(input.requiredByDate)
          : undefined,
        raisedBy: actorId,
        status: 'pending_approval',
      },
    });
  }

  async approveRequisition(id: string, actorId: string) {
    const req = await this.prisma.jobRequisition.findUnique({ where: { id } });
    if (!req) throw DomainException.notFound('Requisition not found');
    if (req.status !== 'pending_approval') {
      throw DomainException.conflict('Requisition is not pending approval');
    }
    // Budget check against salary line when budgetLineId present (RC-01)
    if (req.budgetLineId && req.salaryRangeMax) {
      try {
        await this.budgetCheck.checkExpenseLines(
          [
            {
              accountId: req.budgetLineId,
              debitAmount: req.salaryRangeMax * req.positionsCount,
              creditAmount: 0,
              costCenter: 'admin',
            },
          ],
          new Date(),
        );
      } catch (e) {
        if (e instanceof DomainException) throw e;
        throw DomainException.withCode(
          ErrorCode.BUDGET_EXCEEDED,
          422,
          'Requisition exceeds salary budget',
        );
      }
    }
    const updated = await this.prisma.jobRequisition.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: actorId,
        approvedAt: new Date(),
      },
    });
    await this.events.emitAsync(EventNames.REQUISITION_APPROVED, {
      requisitionId: id,
      actorId,
    });
    return updated;
  }

  async rejectRequisition(id: string, reason: string) {
    if (!reason?.trim()) {
      throw DomainException.validation('Rejection reason is mandatory');
    }
    return this.prisma.jobRequisition.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: reason },
    });
  }

  // ---- Job postings --------------------------------------------------

  listPostings() {
    return this.prisma.jobPosting.findMany({
      include: { requisition: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  createPosting(input: {
    requisitionId: string;
    title: string;
    description: string;
    requirements?: string;
    channels?: string[];
    closingDate?: string;
  }) {
    return this.prisma.jobPosting.create({
      data: {
        requisitionId: input.requisitionId,
        title: input.title,
        description: input.description,
        requirements: input.requirements,
        channels: input.channels ?? [],
        closingDate: input.closingDate
          ? new Date(input.closingDate)
          : undefined,
        status: 'draft',
      },
    });
  }

  async updatePosting(id: string, data: Prisma.JobPostingUpdateInput) {
    return this.prisma.jobPosting.update({ where: { id }, data });
  }

  publishPosting(id: string) {
    return this.prisma.jobPosting.update({
      where: { id },
      data: { status: 'published', postedDate: new Date() },
    });
  }

  // ---- Applicants ----------------------------------------------------

  listApplicants(postingId?: string) {
    return this.prisma.applicant.findMany({
      where: { postingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApplicant(input: {
    postingId: string;
    fullName: string;
    email: string;
    phone?: string;
    resumeAttachmentId?: string;
    expectedSalary?: number;
    noticePeriodDays?: number;
    source?: string;
  }) {
    const applicationNumber = await this.numbering.nextCode('applicant');
    return this.prisma.applicant.create({
      data: {
        postingId: input.postingId,
        applicationNumber,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        resumeAttachmentId: input.resumeAttachmentId,
        expectedSalary: input.expectedSalary,
        noticePeriodDays: input.noticePeriodDays,
        source: input.source,
        stage: 'applied',
      },
    });
  }

  async changeStage(id: string, stage: ApplicantStage, reason?: string) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id },
    });
    if (!applicant) throw DomainException.notFound('Applicant not found');

    if (stage === 'rejected' || stage === 'withdrawn') {
      return this.prisma.applicant.update({
        where: { id },
        data: {
          stage,
          stageChangedAt: new Date(),
          rejectionReason: reason,
        },
      });
    }

    const fromIdx = STAGE_ORDER.indexOf(applicant.stage);
    const toIdx = STAGE_ORDER.indexOf(stage);
    if (fromIdx < 0 || toIdx < 0) {
      throw DomainException.withCode(
        ErrorCode.INVALID_STAGE_TRANSITION,
        409,
        'Invalid stage',
      );
    }
    if (toIdx > fromIdx + 1) {
      throw DomainException.withCode(
        ErrorCode.INVALID_STAGE_TRANSITION,
        409,
        'Cannot skip stages forward',
      );
    }
    if (toIdx < fromIdx && !reason?.trim()) {
      throw DomainException.withCode(
        ErrorCode.INVALID_STAGE_TRANSITION,
        409,
        'Moving backward requires a reason',
      );
    }

    return this.prisma.applicant.update({
      where: { id },
      data: {
        stage,
        stageChangedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }

  // ---- Interviews ----------------------------------------------------

  listInterviews(filters?: { applicantId?: string }) {
    return this.prisma.interview.findMany({
      where: { applicantId: filters?.applicantId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  createInterview(input: {
    applicantId: string;
    roundNumber: number;
    interviewType: 'screening' | 'technical' | 'panel' | 'final';
    scheduledAt: string;
    durationMinutes?: number;
    mode: 'in_person' | 'video' | 'phone';
    location?: string;
    panelUserIds?: string[];
  }) {
    return this.prisma.interview.create({
      data: {
        applicantId: input.applicantId,
        roundNumber: input.roundNumber,
        interviewType: input.interviewType,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes ?? 60,
        mode: input.mode,
        location: input.location,
        panelUserIds: input.panelUserIds ?? [],
      },
    });
  }

  async updateInterview(id: string, data: Prisma.InterviewUpdateInput) {
    return this.prisma.interview.update({ where: { id }, data });
  }

  interviewFeedback(
    id: string,
    input: {
      overallRating: number;
      recommendation: 'proceed' | 'hold' | 'reject';
      notes?: string;
    },
  ) {
    return this.submitInterviewFeedback(id, input);
  }

  async submitInterviewFeedback(
    id: string,
    input: {
      overallRating: number;
      recommendation: 'proceed' | 'hold' | 'reject';
      notes?: string;
    },
  ) {
    return this.prisma.interview.update({
      where: { id },
      data: {
        overallRating: input.overallRating,
        recommendation: input.recommendation,
        notes: input.notes,
        status: 'completed',
      },
    });
  }

  // ---- Offers --------------------------------------------------------

  listOffers() {
    return this.prisma.offer.findMany({
      include: { applicant: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOffer(input: {
    applicantId: string;
    offeredDesignation: string;
    offeredDepartment: string;
    offeredSalaryStructure: Record<string, unknown>;
    joiningDate: string;
    validUntil: string;
  }) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: input.applicantId },
      include: { posting: { include: { requisition: true } } },
    });
    if (!applicant) throw DomainException.notFound('Applicant not found');
    const req = applicant.posting.requisition;
    if (req.status !== 'approved') {
      throw DomainException.withCode(
        ErrorCode.NO_OPEN_POSITION,
        422,
        'Offer requires an approved requisition',
      );
    }
    if (req.filledCount >= req.positionsCount) {
      throw DomainException.withCode(
        ErrorCode.NO_OPEN_POSITION,
        422,
        'No open positions remaining',
      );
    }
    return this.prisma.offer.create({
      data: {
        applicantId: input.applicantId,
        offeredDesignation: input.offeredDesignation,
        offeredDepartment: input.offeredDepartment,
        offeredSalaryStructure:
          input.offeredSalaryStructure as Prisma.InputJsonValue,
        joiningDate: new Date(input.joiningDate),
        validUntil: new Date(input.validUntil),
        status: 'draft',
      },
    });
  }

  async sendOffer(id: string, actorId: string) {
    const offer = await this.prisma.offer.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date(), approvedBy: actorId },
    });
    await this.events.emitAsync(EventNames.OFFER_SENT, {
      offerId: id,
      actorId,
    });
    return offer;
  }

  async respondOffer(id: string, accepted: boolean) {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) throw DomainException.notFound('Offer not found');
    if (offer.status !== 'sent') {
      throw DomainException.conflict('Offer is not awaiting response');
    }
    const updated = await this.prisma.offer.update({
      where: { id },
      data: {
        status: accepted ? 'accepted' : 'declined',
        respondedAt: new Date(),
      },
    });
    if (accepted) {
      await this.prisma.applicant.update({
        where: { id: offer.applicantId },
        data: { stage: 'accepted', stageChangedAt: new Date() },
      });
      await this.events.emitAsync(EventNames.OFFER_ACCEPTED, {
        offerId: id,
        applicantId: offer.applicantId,
      });
    }
    return updated;
  }

  /** RC-04: convert accepted offer to employee. */
  async convert(applicantId: string, actorId: string) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      include: {
        offers: { where: { status: 'accepted' }, take: 1 },
        posting: { include: { requisition: true } },
      },
    });
    if (!applicant) throw DomainException.notFound('Applicant not found');
    const offer = applicant.offers[0];
    if (!offer) {
      throw DomainException.withCode(
        ErrorCode.OFFER_NOT_ACCEPTED,
        409,
        'Conversion requires an accepted offer',
      );
    }

    const employeeCode = await this.numbering.nextCode('employee');
    const offeredSalary = offer.offeredSalaryStructure as {
      basicSalary?: number;
      gross?: number;
    };
    const basicSalary = offeredSalary?.basicSalary ?? offeredSalary?.gross ?? 0;
    const dept = (
      ['school', 'therapy', 'administration', 'support'].includes(
        offer.offeredDepartment,
      )
        ? offer.offeredDepartment
        : 'administration'
    ) as 'school' | 'therapy' | 'administration' | 'support';
    const empType = (
      ['permanent', 'contractual', 'part_time'].includes(
        applicant.posting.requisition.employmentType,
      )
        ? applicant.posting.requisition.employmentType
        : 'permanent'
    ) as 'permanent' | 'contractual' | 'part_time';

    const employee = await this.prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          employeeCode,
          fullName: applicant.fullName,
          personalEmail: applicant.email,
          phone: applicant.phone,
          department: dept,
          designation: offer.offeredDesignation,
          employmentType: empType,
          joiningDate: offer.joiningDate,
          basicSalary,
          status: 'active',
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      await tx.applicant.update({
        where: { id: applicantId },
        data: { convertedEmployeeId: emp.id },
      });
      const req = applicant.posting.requisition;
      const filled = req.filledCount + 1;
      await tx.jobRequisition.update({
        where: { id: req.id },
        data: {
          filledCount: filled,
          status: filled >= req.positionsCount ? 'filled' : req.status,
        },
      });
      return emp;
    });

    await this.events.emitAsync(EventNames.APPLICANT_CONVERTED, {
      applicantId,
      employeeId: employee.id,
      actorId,
    });
    return employee;
  }
}
