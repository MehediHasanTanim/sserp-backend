import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { AcademicYearService } from '../services/academic-year.service';
import {
  CreateAcademicTermDto,
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
} from '../dto/academic-year.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/academic-years')
export class AcademicYearController {
  constructor(private readonly academicYears: AcademicYearService) {}

  @Get()
  @Permissions('school:read')
  list() {
    return this.academicYears.list();
  }

  @Get('current')
  @Permissions('school:read')
  getCurrent() {
    return this.academicYears.getCurrent();
  }

  @Post()
  @Roles('super_admin', 'principal')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'academic_year', action: 'create' })
  @ApiOperation({ summary: 'Create an academic year' })
  create(@Body() dto: CreateAcademicYearDto) {
    return this.academicYears.create(dto);
  }

  @Get(':id')
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.academicYears.get(id);
  }

  @Patch(':id')
  @Roles('super_admin', 'principal')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'academic_year', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateAcademicYearDto) {
    return this.academicYears.update(id, dto);
  }

  @Post(':id/set-current')
  @Roles('super_admin', 'principal')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'academic_year', action: 'set_current' })
  @ApiOperation({ summary: 'Mark exactly one academic year as current' })
  setCurrent(@Param('id') id: string) {
    return this.academicYears.setCurrent(id);
  }

  @Get(':id/terms')
  @Permissions('school:read')
  listTerms(@Param('id') id: string) {
    return this.academicYears.listTerms(id);
  }

  @Post(':id/terms')
  @Roles('super_admin', 'principal')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'academic_term', action: 'create' })
  createTerm(@Param('id') id: string, @Body() dto: CreateAcademicTermDto) {
    return this.academicYears.createTerm(id, dto);
  }
}
