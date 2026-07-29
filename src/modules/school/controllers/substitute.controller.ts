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
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { SubstituteService } from '../services/substitute.service';
import {
  AssignSubstituteDto,
  CancelSubstituteAssignmentDto,
  UpdateSubstituteAssignmentDto,
} from '../dto/substitute.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/substitutes')
export class SubstituteController {
  constructor(private readonly substitutes: SubstituteService) {}

  @Get()
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:read')
  list(
    @Query('status') status?: string,
    @Query('substituteTeacherId') substituteTeacherId?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.substitutes.list({ status, substituteTeacherId, studentId });
  }

  @Get('pending')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Absences/leaves with no substitute yet' })
  pending() {
    return this.substitutes.listPending();
  }

  @Post()
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:create')
  @Audit({
    module: 'school',
    entity: 'substitute_assignment',
    action: 'assign',
  })
  assign(@Body() dto: AssignSubstituteDto, @CurrentUser() user: AuthUser) {
    return this.substitutes.assign(
      dto.substituteAssignmentId,
      dto.substituteTeacherId,
      user.id,
    );
  }

  @Patch(':id')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:update')
  @Audit({
    module: 'school',
    entity: 'substitute_assignment',
    action: 'update',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubstituteAssignmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.substitutes.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:delete')
  @Audit({
    module: 'school',
    entity: 'substitute_assignment',
    action: 'cancel',
  })
  cancel(@Param('id') id: string, @Body() dto: CancelSubstituteAssignmentDto) {
    return this.substitutes.cancel(id, dto.reason);
  }
}
