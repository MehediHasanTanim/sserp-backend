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
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { AppraisalService } from '../services/appraisal.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class PerformanceController {
  constructor(private readonly appraisals: AppraisalService) {}

  @Get('review-cycles')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  listCycles() {
    return this.appraisals.listCycles();
  }

  @Post('review-cycles')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:create')
  createCycle(@Body() body: never) {
    return this.appraisals.createCycle(body);
  }

  @Post('review-cycles/:id/open')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  openCycle(@Param('id') id: string) {
    return this.appraisals.openCycle(id);
  }

  @Get('kpis')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  listKpis() {
    return this.appraisals.listKpis();
  }

  @Post('kpis')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:create')
  createKpi(@Body() body: never) {
    return this.appraisals.createKpi(body);
  }

  @Get('appraisals')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  listAppraisals(
    @Query('reviewCycleId') reviewCycleId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.appraisals.listAppraisals({ reviewCycleId, employeeId });
  }

  @Get('appraisals/:id')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  getAppraisal(@Param('id') id: string) {
    return this.appraisals.getAppraisal(id);
  }

  @Patch('appraisals/:id/self')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:update')
  self(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: never,
  ) {
    return this.appraisals.submitSelf(id, body, user.id);
  }

  @Patch('appraisals/:id/manager')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:update')
  manager(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: never,
  ) {
    return this.appraisals.submitManager(id, body, user.id);
  }

  @Post('appraisals/:id/finalise')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'appraisal', action: 'finalise' })
  finalise(@Param('id') id: string, @Body() body: { finalRating?: string }) {
    return this.appraisals.finalise(id, body.finalRating ?? 'meets');
  }

  @Post('appraisals/:id/acknowledge')
  @Roles('hr_officer', 'super_admin', 'principal')
  acknowledge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.appraisals.acknowledge(id, user.id);
  }

  @Post('appraisals/:id/feedback-360')
  @Roles('hr_officer', 'super_admin', 'principal')
  feedback(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: never,
  ) {
    return this.appraisals.addFeedback360(id, user.id, body);
  }

  @Post('appraisals/:id/increment-recommendation')
  @Roles('hr_officer', 'principal', 'super_admin')
  recommend(@Param('id') id: string, @Body() body: never) {
    return this.appraisals.recommendIncrement(id, body);
  }

  @Post('increment-recommendations/:id/approve')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  approveInc(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { applyStructure?: boolean; effectiveFrom?: string },
  ) {
    return this.appraisals.approveIncrement(
      id,
      user.id,
      body.effectiveFrom ?? body.applyStructure,
    );
  }
}
