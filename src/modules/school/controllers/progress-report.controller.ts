import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProgressReportType } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { ProgressReportService } from '../services/progress-report.service';
import {
  AddProgressReportEvidenceDto,
  CreateProgressReportDto,
  CreateReportTemplateDto,
  RejectProgressReportDto,
  UpdateProgressReportDto,
  UpdateReportTemplateDto,
} from '../dto/progress-report.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school')
export class ProgressReportController {
  constructor(private readonly reports: ProgressReportService) {}

  @Get('report-templates')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:read')
  listTemplates(@Query('reportType') reportType?: ProgressReportType) {
    return this.reports.listTemplates(reportType);
  }

  @Post('report-templates')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'report_template', action: 'create' })
  createTemplate(@Body() dto: CreateReportTemplateDto) {
    return this.reports.createTemplate(dto);
  }

  @Patch('report-templates/:id')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'report_template', action: 'update' })
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateReportTemplateDto,
  ) {
    return this.reports.updateTemplate(id, dto);
  }

  @Get('students/:id/progress-reports')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  listForStudent(@Param('id') studentId: string) {
    return this.reports.listForStudent(studentId);
  }

  @Get('students/:id/progress-trend')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  progressTrend(@Param('id') studentId: string) {
    return this.reports.progressTrend(studentId);
  }

  @Post('students/:id/progress-reports')
  @Roles('coordinator', 'teacher')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'progress_report', action: 'create' })
  create(@Param('id') studentId: string, @Body() dto: CreateProgressReportDto) {
    return this.reports.create(studentId, dto);
  }

  @Get('progress-reports/:id')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.reports.get(id);
  }

  @Patch('progress-reports/:id')
  @Roles('coordinator', 'teacher')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateProgressReportDto) {
    return this.reports.update(id, dto);
  }

  @Post('progress-reports/:id/submit')
  @Roles('teacher', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'submit' })
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.submit(id, user.id);
  }

  @Post('progress-reports/:id/approve')
  @Roles('coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.approve(id, user.id);
  }

  @Post('progress-reports/:id/reject')
  @Roles('coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'reject' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectProgressReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.reject(id, user.id, dto.comment);
  }

  @Post('progress-reports/:id/publish')
  @Roles('coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'publish' })
  publish(@Param('id') id: string) {
    return this.reports.publish(id);
  }

  @Post('progress-reports/:id/evidence')
  @Roles('coordinator', 'teacher')
  @Permissions('school:update')
  @Audit({
    module: 'school',
    entity: 'progress_report',
    action: 'add_evidence',
  })
  addEvidence(
    @Param('id') id: string,
    @Body() dto: AddProgressReportEvidenceDto,
  ) {
    return this.reports.addEvidence(id, dto);
  }
}
