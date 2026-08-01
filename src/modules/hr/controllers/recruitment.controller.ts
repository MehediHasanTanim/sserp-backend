import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApplicantStage } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { RecruitmentService } from '../services/recruitment.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Get('requisitions')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  listReq() {
    return this.recruitment.listRequisitions();
  }

  @Post('requisitions')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'job_requisition', action: 'create' })
  createReq(@Body() body: never, @CurrentUser() user: AuthUser) {
    return this.recruitment.createRequisition(body, user.id);
  }

  @Post('requisitions/:id/approve')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  approveReq(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.recruitment.approveRequisition(id, user.id);
  }

  @Post('requisitions/:id/reject')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  rejectReq(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.recruitment.rejectRequisition(id, body.reason);
  }

  @Get('job-postings')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  listPostings() {
    return this.recruitment.listPostings();
  }

  @Post('job-postings')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  createPosting(@Body() body: never) {
    return this.recruitment.createPosting(body);
  }

  @Post('job-postings/:id/publish')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  publish(@Param('id') id: string) {
    return this.recruitment.publishPosting(id);
  }

  @Get('applicants')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  listApplicants() {
    return this.recruitment.listApplicants();
  }

  @Post('applicants')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  createApplicant(@Body() body: never) {
    return this.recruitment.createApplicant(body);
  }

  @Patch('applicants/:id/stage')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  stage(
    @Param('id') id: string,
    @Body() body: { stage: ApplicantStage; reason?: string },
  ) {
    return this.recruitment.changeStage(id, body.stage, body.reason);
  }

  @Post('interviews')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  interview(@Body() body: never) {
    return this.recruitment.createInterview(body);
  }

  @Post('interviews/:id/feedback')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:update')
  feedback(@Param('id') id: string, @Body() body: never) {
    return this.recruitment.interviewFeedback(id, body);
  }

  @Post('offers')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  offer(@Body() body: never) {
    return this.recruitment.createOffer(body);
  }

  @Post('offers/:id/send')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:approve')
  send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.recruitment.sendOffer(id, user.id);
  }

  @Post('offers/:id/respond')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  respond(@Param('id') id: string, @Body() body: { accept: boolean }) {
    return this.recruitment.respondOffer(id, body.accept);
  }

  @Post('applicants/:id/convert')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'employee', action: 'convert' })
  convert(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.recruitment.convert(id, user.id);
  }
}
