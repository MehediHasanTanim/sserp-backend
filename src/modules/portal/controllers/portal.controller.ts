import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  Roles,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { PortalScopeGuard } from '../guards/portal-scope.guard';
import { PortalScope } from '../services/portal-scope.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { IepService } from '../../school/services/iep.service';
import { StudentLeaveService } from '../../school/services/student-leave.service';
import { ActivityEnrollmentService } from '../../school/services/activity.service';
import { SchoolAttendanceService } from '../../school/services/school-attendance.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventNames } from '../../../shared/events/event-names';
import { Prisma } from '@prisma/client';
import { SessionService } from '../../therapy/services/session.service';
import { PatientService } from '../../therapy/services/patient.service';
import { PortalPaymentService } from '../../hardening/services/portal-payment.service';

type PortalUser = AuthUser & { portalScope?: PortalScope };

class LeaveSubmitDto {
  @IsString() leaveType!: 'medical' | 'family' | 'travel' | 'other';
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
}

class ActivityRespondDto {
  @IsBoolean() accept!: boolean;
  @IsOptional() @IsString() declinedReason?: string;
  @IsString() studentId!: string;
}

class AcknowledgeDto {
  @IsString() signatureText!: string;
}

class MessageDto {
  @IsString() subject!: string;
  @IsString() body!: string;
  @IsString() studentId!: string;
}

class FeePayIntentDto {
  @IsString() invoiceId!: string;
  @IsString() returnUrl!: string;
  @IsOptional() @IsInt() @Min(1) amount?: number;
}

@ApiTags('portal')
@ApiBearerAuth()
@UseGuards(PortalScopeGuard)
@Roles('parent')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iep: IepService,
    private readonly leaves: StudentLeaveService,
    private readonly enrollments: ActivityEnrollmentService,
    private readonly attendance: SchoolAttendanceService,
    private readonly events: EventEmitter2,
    private readonly sessionService: SessionService,
    private readonly patientService: PatientService,
    private readonly portalPayments: PortalPaymentService,
  ) {}

  @Get('children')
  async children(@CurrentUser() user: PortalUser) {
    const ids = user.portalScope!.studentIds;
    return this.prisma.student.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        status: true,
        disabilityCategory: true,
        shiftId: true,
      },
    });
  }

  @Get('children/:studentId')
  async child(@Param('studentId') studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      include: {
        medicalRecord: {
          select: { hasAlertFlag: true, alertSummary: true },
        },
        shift: true,
      },
    });
    if (!student) throw DomainException.notFound('Student not found');
    return student;
  }

  @Get('children/:studentId/attendance')
  async childAttendance(
    @Param('studentId') studentId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = Number(year) || new Date().getUTCFullYear();
    const m = Number(month) || new Date().getUTCMonth() + 1;
    return this.attendance.monthlySummary(studentId, y, m);
  }

  @Get('children/:studentId/iep')
  async childIep(@Param('studentId') studentId: string) {
    const plans = await this.iep.listForStudent(studentId);
    return plans.filter(
      (p) => p.status === 'active' || p.status === 'archived',
    );
  }

  @Get('children/:studentId/iep/history')
  async iepHistory(@Param('studentId') studentId: string) {
    const plans = await this.iep.listForStudent(studentId);
    return plans.filter((p) => p.status !== 'draft');
  }

  @Post('iep/:iepId/acknowledge')
  @Audit({ module: 'portal', entity: 'iep', action: 'acknowledge' })
  async acknowledge(
    @Param('iepId') iepId: string,
    @Body() dto: AcknowledgeDto,
    @CurrentUser() user: PortalUser,
    @Req() req: { ip?: string; headers: Record<string, string> },
  ) {
    return this.iep.acknowledge(iepId, user.portalScope!.guardianProfileId, {
      signatureText: dto.signatureText,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('children/:studentId/progress-reports')
  async progressReports(@Param('studentId') studentId: string) {
    return this.prisma.progressReport.findMany({
      where: { studentId, status: 'published' },
      orderBy: { periodStart: 'desc' },
    });
  }

  @Get('children/:studentId/fees')
  async fees(@Param('studentId') studentId: string) {
    return this.prisma.feeInvoice.findMany({
      where: { studentId },
      include: { payments: true },
      orderBy: { issueDate: 'desc' },
    });
  }

  @Post('children/:studentId/fees/pay')
  @Audit({ module: 'portal', entity: 'fee_payment', action: 'intent' })
  payFee(
    @Param('studentId') studentId: string,
    @Body() dto: FeePayIntentDto,
    @CurrentUser() user: PortalUser,
  ) {
    return this.portalPayments.createFeePaymentIntent({
      invoiceId: dto.invoiceId,
      studentId,
      returnUrl: dto.returnUrl,
      userId: user.id,
      amount: dto.amount,
    });
  }

  @Get('children/:studentId/leave-requests')
  leaveHistory(@Param('studentId') studentId: string) {
    return this.leaves.list({ studentId });
  }

  @Post('children/:studentId/leave-requests')
  @Audit({ module: 'portal', entity: 'student_leave', action: 'create' })
  submitLeave(
    @Param('studentId') studentId: string,
    @Body() dto: LeaveSubmitDto,
    @CurrentUser() user: PortalUser,
  ) {
    return this.leaves.submit({
      studentId,
      requestedBy: user.id,
      leaveType: dto.leaveType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
    });
  }

  @Get('children/:studentId/activities')
  async activities(@Param('studentId') studentId: string) {
    const enrollments = await this.prisma.activityEnrollment.findMany({
      where: { studentId },
      include: { activity: true },
    });
    const upcoming = await this.prisma.outdoorActivity.findMany({
      where: { status: 'upcoming' },
      orderBy: { activityDate: 'asc' },
    });
    return { enrollments, upcoming };
  }

  @Post('activities/:activityId/respond')
  @Audit({ module: 'portal', entity: 'activity', action: 'respond' })
  respond(
    @Param('activityId') activityId: string,
    @Body() dto: ActivityRespondDto & { studentId: string },
    @CurrentUser() user: PortalUser,
  ) {
    if (
      !dto.studentId ||
      !user.portalScope!.studentIds.includes(dto.studentId)
    ) {
      throw DomainException.forbidden('Student not in scope');
    }
    return this.enrollments.respond({
      activityId,
      studentId: dto.studentId,
      accept: dto.accept,
      channel: 'portal',
      actorUserId: user.id,
      declinedReason: dto.declinedReason,
    });
  }

  @Get('children/:studentId/therapy-schedule')
  async therapySchedule(
    @Param('studentId') studentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Find the patient record linked to this student
    const patient = await this.prisma.patient
      .findFirst({
        where: { studentId, deletedAt: null },
      })
      .catch(() => null);

    if (!patient) return [];

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 30 * 86400000);

    return this.sessionService.listByPatient(patient.id, fromDate, toDate);
  }

  @Get('messages')
  messages(@CurrentUser() user: PortalUser) {
    return this.prisma.portalMessageThread.findMany({
      where: { studentId: { in: user.portalScope!.studentIds } },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  @Post('messages')
  @Audit({ module: 'portal', entity: 'message', action: 'create' })
  async postMessage(@Body() dto: MessageDto, @CurrentUser() user: PortalUser) {
    if (!user.portalScope!.studentIds.includes(dto.studentId)) {
      throw DomainException.forbidden('Student not in scope');
    }
    const thread = await this.prisma.portalMessageThread.create({
      data: {
        studentId: dto.studentId,
        subject: dto.subject,
        lastMessageAt: new Date(),
        messages: {
          create: {
            studentId: dto.studentId,
            senderUserId: user.id,
            senderType: 'guardian',
            body: dto.body,
          },
        },
      },
      include: { messages: true },
    });
    await this.events.emitAsync(EventNames.PORTAL_MESSAGE_POSTED, {
      threadId: thread.id,
      studentId: dto.studentId,
    });
    return thread;
  }

  @Post('guardian-change-request')
  @Audit({ module: 'portal', entity: 'guardian_change', action: 'create' })
  async changeRequest(
    @Body() body: { requestedChanges: Record<string, unknown> },
    @CurrentUser() user: PortalUser,
  ) {
    const row = await this.prisma.guardianChangeRequest.create({
      data: {
        guardianId: user.portalScope!.guardianProfileId,
        requestedChanges: body.requestedChanges as Prisma.InputJsonValue,
        requestedBy: user.id,
      },
    });
    await this.events.emitAsync(EventNames.GUARDIAN_CHANGE_REQUESTED, {
      requestId: row.id,
    });
    return row;
  }
}
