import {
  Body,
  Controller,
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
import { TeacherMappingService } from '../services/teacher-mapping.service';
import { CreateMappingDto, EndMappingDto } from '../dto/mapping.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/mappings')
export class MappingController {
  constructor(private readonly mappings: TeacherMappingService) {}

  @Get()
  @Roles('coordinator', 'principal', 'teacher', 'super_admin')
  @Permissions('school:read')
  list(
    @Query('shiftId') shiftId?: string,
    @Query('teacherEmployeeId') teacherEmployeeId?: string,
    @Query('studentId') studentId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.mappings.list({
      shiftId,
      teacherEmployeeId,
      studentId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('history')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:read')
  history(
    @Query('studentId') studentId?: string,
    @Query('teacherEmployeeId') teacherEmployeeId?: string,
  ) {
    return this.mappings.history({ studentId, teacherEmployeeId });
  }

  @Get('eligibility')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Teachers with free shift capacity' })
  eligibility() {
    return this.mappings.eligibility();
  }

  @Post()
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:create')
  @Audit({
    module: 'school',
    entity: 'student_teacher_mapping',
    action: 'create',
  })
  @ApiOperation({
    summary: 'Create a mapping — enforces the shift cap and fee gate',
  })
  create(@Body() dto: CreateMappingDto, @CurrentUser() user: AuthUser) {
    return this.mappings.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('coordinator', 'principal')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'student_teacher_mapping', action: 'end' })
  end(
    @Param('id') id: string,
    @Body() dto: EndMappingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.mappings.end(id, dto.reason, user.id);
  }
}
