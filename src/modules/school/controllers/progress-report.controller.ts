import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProgressReportStatus, ProgressReportType } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { ProgressReportService } from '../services/progress-report.service';
import { SchoolDocumentService } from '../services/school-document.service';
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
  constructor(
    private readonly reports: ProgressReportService,
    private readonly documents: SchoolDocumentService,
  ) {}

  @Get('report-templates')
  @Roles('super_admin', 'coordinator', 'teacher', 'principal')
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
  @Roles('coordinator', 'teacher', 'super_admin', 'principal')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'progress_report', action: 'create' })
  create(@Param('id') studentId: string, @Body() dto: CreateProgressReportDto) {
    return this.reports.create(studentId, dto);
  }

  @Get('progress-reports')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Cross-student progress report status board' })
  listBoard(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: ProgressReportStatus,
  ) {
    return this.reports.listBoard({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
    });
  }

  @Get('progress-reports/:id')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.reports.get(id);
  }

  @Get('progress-reports/:id/document')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Presigned URL for the rendered progress report PDF' })
  document(@Param('id') id: string) {
    return this.documents.progressReportDocument(id);
  }

  @Patch('progress-reports/:id')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateProgressReportDto) {
    return this.reports.update(id, dto);
  }

  @Delete('progress-reports/:id')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:delete')
  @Audit({ module: 'school', entity: 'progress_report', action: 'delete' })
  @ApiOperation({ summary: 'Permanently delete a draft progress report' })
  deleteDraft(@Param('id') id: string) {
    return this.reports.deleteDraft(id);
  }

  @Post('progress-reports/:id/submit')
  @Roles('teacher', 'coordinator', 'principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'submit' })
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.submit(id, user.id);
  }

  @Post('progress-reports/:id/approve')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.approve(id, user.id, user.roles);
  }

  @Post('progress-reports/:id/reject')
  @Roles('coordinator', 'principal', 'super_admin')
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
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'progress_report', action: 'publish' })
  publish(@Param('id') id: string) {
    return this.reports.publish(id);
  }

  @Post('progress-reports/:id/evidence')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
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
