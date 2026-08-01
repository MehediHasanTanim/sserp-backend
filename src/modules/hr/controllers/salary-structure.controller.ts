import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import {
  SalaryStructureService,
  StatutoryDeductionService,
} from '../services/salary-structure.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class SalaryStructureController {
  constructor(
    private readonly salaries: SalaryStructureService,
    private readonly statutory: StatutoryDeductionService,
  ) {}

  @Get('payroll-groups')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  listGroups() {
    return this.salaries.listPayrollGroups();
  }

  @Post('payroll-groups')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'payroll_group', action: 'create' })
  createGroup(
    @Body()
    body: {
      name: string;
      employmentTypes: string[];
      payDayOfMonth: number;
    },
  ) {
    return this.salaries.createPayrollGroup(body);
  }

  @Get('employees/:id/salary-structure')
  @Roles('hr_officer', 'super_admin', 'accountant', 'principal')
  @Permissions('hr:read')
  getStructure(@Param('id') id: string) {
    return this.salaries.getActiveStructure(id);
  }

  @Post('employees/:id/salary-structure')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'salary_structure', action: 'create' })
  createStructure(@Param('id') id: string, @Body() body: never) {
    return this.salaries.createStructure(id, body);
  }

  @Post('salary-structures/:id/approve')
  @Roles('principal', 'hr_officer', 'super_admin')
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'salary_structure', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salaries.approve(id, user.id);
  }

  @Get('statutory-deductions')
  @Roles('hr_officer', 'super_admin', 'accountant')
  @Permissions('hr:read')
  listStatutory() {
    return this.statutory.list();
  }

  @Post('statutory-deductions')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  createStatutory(@Body() body: never) {
    return this.statutory.create(body);
  }

  @Patch('statutory-deductions/:id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  updateStatutory(@Param('id') id: string, @Body() body: never) {
    return this.statutory.update(id, body);
  }
}
