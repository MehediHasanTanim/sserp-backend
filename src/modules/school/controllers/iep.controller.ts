import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { IepService } from '../services/iep.service';
import { IepGoalService } from '../services/iep-goal.service';
import { SchoolDocumentService } from '../services/school-document.service';
import {
  CreateIepGoalDto,
  CreateIepPlanDto,
  RecordGoalProgressDto,
  UpdateIepGoalDto,
  UpdateIepPlanDto,
} from '../dto/iep.dto';

/**
 * Staff IEP routes. Parents use `/portal/...` only — no silent parent access here.
 */
@ApiTags('school')
@ApiBearerAuth()
@Controller('school')
export class IepController {
  constructor(
    private readonly iep: IepService,
    private readonly goals: IepGoalService,
    private readonly documents: SchoolDocumentService,
  ) {}

  @Get('students/:id/iep')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  listForStudent(@Param('id') studentId: string) {
    return this.iep.listForStudent(studentId);
  }

  @Post('students/:id/iep')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'iep_plan', action: 'create' })
  create(@Param('id') studentId: string, @Body() dto: CreateIepPlanDto) {
    return this.iep.createDraft(studentId, dto);
  }

  @Get('iep/:id')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.iep.get(id);
  }

  @Get('iep/:id/document')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Presigned URL for the rendered IEP PDF' })
  document(@Param('id') id: string) {
    return this.documents.iepDocument(id);
  }

  @Patch('iep/:id')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'iep_plan', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateIepPlanDto) {
    return this.iep.update(id, dto);
  }

  @Post('iep/:id/revise')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'iep_plan', action: 'revise' })
  @ApiOperation({ summary: 'Create v(n+1) copying goals from this plan' })
  revise(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.iep.revise(id, user.id);
  }

  @Post('iep/:id/publish')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'iep_plan', action: 'publish' })
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.iep.publish(id, user.id);
  }

  @Post('iep/:id/archive')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'iep_plan', action: 'archive' })
  archive(@Param('id') id: string) {
    return this.iep.archive(id);
  }

  @Delete('iep/:id')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:delete')
  @Audit({ module: 'school', entity: 'iep_plan', action: 'delete' })
  @ApiOperation({ summary: 'Permanently delete a draft IEP plan' })
  deleteDraft(@Param('id') id: string) {
    return this.iep.deleteDraft(id);
  }

  @Get('iep/:id/goals')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  listGoals(@Param('id') iepId: string) {
    return this.goals.list(iepId);
  }

  @Post('iep/:id/goals')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'iep_goal', action: 'create' })
  addGoal(@Param('id') iepId: string, @Body() dto: CreateIepGoalDto) {
    return this.goals.create(iepId, dto);
  }

  @Patch('iep/goals/:goalId')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'iep_goal', action: 'update' })
  updateGoal(@Param('goalId') goalId: string, @Body() dto: UpdateIepGoalDto) {
    return this.goals.update(goalId, dto);
  }

  @Post('iep/goals/:goalId/progress')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'iep_goal', action: 'record_progress' })
  recordProgress(
    @Param('goalId') goalId: string,
    @Body() dto: RecordGoalProgressDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.goals.recordProgress(goalId, dto, {
      id: user.id,
      roles: user.roles,
    });
  }

  @Get('iep/goals/:goalId/progress')
  @Roles('coordinator', 'teacher', 'principal', 'super_admin')
  @Permissions('school:read')
  progressTimeline(@Param('goalId') goalId: string) {
    return this.goals.progressTimeline(goalId);
  }
}
