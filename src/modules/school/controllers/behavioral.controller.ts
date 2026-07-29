import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { BehavioralService } from '../services/behavioral.service';
import {
  CreateBehavioralIncidentDto,
  CreateBehaviorSupportPlanDto,
  UpdateBehaviorSupportPlanDto,
} from '../dto/behavioral.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/students/:id')
export class BehavioralController {
  constructor(private readonly behavioral: BehavioralService) {}

  @Get('behavioral-incidents')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:read')
  listIncidents(@Param('id') studentId: string) {
    return this.behavioral.listIncidents(studentId);
  }

  @Post('behavioral-incidents')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'behavioral_incident', action: 'create' })
  addIncident(
    @Param('id') studentId: string,
    @Body() dto: CreateBehavioralIncidentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.behavioral.addIncident(studentId, dto, user.id);
  }

  @Get('behavior-support-plan')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:read')
  getSupportPlan(@Param('id') studentId: string) {
    return this.behavioral.getSupportPlan(studentId);
  }

  @Post('behavior-support-plan')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'behavior_support_plan', action: 'create' })
  createSupportPlan(
    @Param('id') studentId: string,
    @Body() dto: CreateBehaviorSupportPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.behavioral.createSupportPlan(studentId, dto, user.id);
  }

  @Patch('behavior-support-plan')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'behavior_support_plan', action: 'update' })
  updateSupportPlan(
    @Param('id') studentId: string,
    @Body() dto: UpdateBehaviorSupportPlanDto,
  ) {
    return this.behavioral.updateSupportPlan(studentId, dto);
  }

  @Get('behavioral-trend')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:read')
  behavioralTrend(@Param('id') studentId: string) {
    return this.behavioral.behavioralTrend(studentId);
  }
}
