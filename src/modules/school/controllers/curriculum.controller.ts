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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { CurriculumService } from '../services/curriculum.service';
import {
  CreateCurriculumDto,
  CreateLearningObjectiveDto,
  CreateSkillDomainDto,
  UpdateCurriculumDto,
  UpdateLearningObjectiveDto,
  UpdateSkillDomainDto,
} from '../dto/curriculum.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school')
export class CurriculumController {
  constructor(private readonly curricula: CurriculumService) {}

  @Get('skill-domains')
  @Permissions('school:read')
  listSkillDomains(@Query('activeOnly') activeOnly?: string) {
    return this.curricula.listSkillDomains(activeOnly === 'true');
  }

  @Post('skill-domains')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'skill_domain', action: 'create' })
  createSkillDomain(@Body() dto: CreateSkillDomainDto) {
    return this.curricula.createSkillDomain(dto);
  }

  @Patch('skill-domains/:id')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'skill_domain', action: 'update' })
  updateSkillDomain(
    @Param('id') id: string,
    @Body() dto: UpdateSkillDomainDto,
  ) {
    return this.curricula.updateSkillDomain(id, dto);
  }

  @Get('curricula')
  @Permissions('school:read')
  listCurricula(
    @Query('academicYearId') academicYearId?: string,
    @Query('disabilityCategory') disabilityCategory?: string,
  ) {
    return this.curricula.listCurricula(academicYearId, disabilityCategory);
  }

  @Get('curricula/:id')
  @Permissions('school:read')
  getCurriculum(@Param('id') id: string) {
    return this.curricula.getCurriculum(id);
  }

  @Post('curricula')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'curriculum', action: 'create' })
  createCurriculum(@Body() dto: CreateCurriculumDto) {
    return this.curricula.createCurriculum(dto);
  }

  @Patch('curricula/:id')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'curriculum', action: 'update' })
  updateCurriculum(@Param('id') id: string, @Body() dto: UpdateCurriculumDto) {
    return this.curricula.updateCurriculum(id, dto);
  }

  @Get('curricula/:id/objectives')
  @Permissions('school:read')
  listObjectives(@Param('id') id: string) {
    return this.curricula.listObjectives(id);
  }

  @Post('curricula/:id/objectives')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'learning_objective', action: 'create' })
  addObjective(
    @Param('id') id: string,
    @Body() dto: CreateLearningObjectiveDto,
  ) {
    return this.curricula.addObjective(id, dto);
  }

  @Patch('curricula/:id/objectives/:objectiveId')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'learning_objective', action: 'update' })
  updateObjective(
    @Param('id') id: string,
    @Param('objectiveId') objectiveId: string,
    @Body() dto: UpdateLearningObjectiveDto,
  ) {
    return this.curricula.updateObjective(id, objectiveId, dto);
  }

  @Delete('curricula/:id/objectives/:objectiveId')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:delete')
  @Audit({ module: 'school', entity: 'learning_objective', action: 'delete' })
  deleteObjective(
    @Param('id') id: string,
    @Param('objectiveId') objectiveId: string,
  ) {
    return this.curricula.deleteObjective(id, objectiveId);
  }
}
