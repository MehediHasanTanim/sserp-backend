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
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { OrgStructureService } from '../services/org-structure.service';
import {
  CreateDepartmentDto,
  CreateDesignationDto,
  UpdateDepartmentDto,
  UpdateDesignationDto,
} from '../dto/org.dto';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/departments')
export class DepartmentController {
  constructor(private readonly org: OrgStructureService) {}

  @Get()
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List departments' })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.org.listDepartments(includeInactive === 'true');
  }

  @Get(':id')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  get(@Param('id') id: string) {
    return this.org.getDepartment(id);
  }

  @Post()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'department', action: 'create' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.org.createDepartment(dto);
  }

  @Patch(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'department', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.org.updateDepartment(id, dto);
  }

  @Delete(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:delete')
  @Audit({ module: 'hr', entity: 'department', action: 'delete' })
  remove(@Param('id') id: string) {
    return this.org.deleteDepartment(id);
  }
}

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/designations')
export class DesignationController {
  constructor(private readonly org: OrgStructureService) {}

  @Get()
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List designations' })
  list(
    @Query('departmentId') departmentId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.org.listDesignations({
      departmentId,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get(':id')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  get(@Param('id') id: string) {
    return this.org.getDesignation(id);
  }

  @Post()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'designation', action: 'create' })
  create(@Body() dto: CreateDesignationDto) {
    return this.org.createDesignation(dto);
  }

  @Patch(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'designation', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateDesignationDto) {
    return this.org.updateDesignation(id, dto);
  }

  @Delete(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:delete')
  @Audit({ module: 'hr', entity: 'designation', action: 'delete' })
  remove(@Param('id') id: string) {
    return this.org.deleteDesignation(id);
  }
}
