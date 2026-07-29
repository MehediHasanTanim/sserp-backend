import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { TeacherService } from '../services/teacher.service';
import {
  CreateCertificationDto,
  CreateTeacherDto,
  SetTeacherShiftsDto,
  UpdateTeacherDto,
} from '../dto/teacher.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/teachers')
export class TeacherController {
  constructor(private readonly teachers: TeacherService) {}

  @Get()
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('school:read')
  list() {
    return this.teachers.list();
  }

  @Post()
  @Roles('coordinator', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'teacher', action: 'create' })
  create(@Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto);
  }

  @Get(':id')
  @Roles('coordinator', 'principal', 'teacher', 'super_admin')
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.teachers.get(id);
  }

  @Patch(':id')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'teacher', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.teachers.update(id, dto);
  }

  @Put(':id/shifts')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'teacher', action: 'set_shifts' })
  setShifts(@Param('id') id: string, @Body() dto: SetTeacherShiftsDto) {
    return this.teachers.setShifts(id, dto.shiftIds);
  }

  @Get(':id/certifications')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:read')
  listCertifications(@Param('id') id: string) {
    return this.teachers.listCertifications(id);
  }

  @Post(':id/certifications')
  @Roles('coordinator', 'super_admin')
  @Permissions('school:create')
  @Audit({
    module: 'school',
    entity: 'teacher_certification',
    action: 'create',
  })
  addCertification(
    @Param('id') id: string,
    @Body() dto: CreateCertificationDto,
  ) {
    return this.teachers.addCertification(id, dto);
  }
}
