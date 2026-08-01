import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { SalaryStructureService } from '../services/salary-structure.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/salary-components')
export class SalaryComponentController {
  constructor(private readonly salaries: SalaryStructureService) {}

  @Get()
  @Roles('hr_officer', 'super_admin', 'accountant')
  @Permissions('hr:read')
  list() {
    return this.salaries.listComponents();
  }

  @Post()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'salary_component', action: 'create' })
  create(@Body() body: Record<string, unknown>) {
    return this.salaries.createComponent(body as never);
  }

  @Patch(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'salary_component', action: 'update' })
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.salaries.updateComponent(id, body as never);
  }
}
