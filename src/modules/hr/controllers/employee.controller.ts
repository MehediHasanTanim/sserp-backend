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
import { EmployeeStatus, EmploymentType } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { EmployeeService } from '../services/employee.service';
import { EmployeeLifecycleService } from '../services/employee-lifecycle.service';
import {
  ConfirmProbationDto,
  CreateEmployeeDto,
  ExitEmployeeDto,
  TransferEmployeeDto,
  UpdateEmployeeDto,
} from '../dto/employee.dto';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/employees')
export class EmployeeController {
  constructor(
    private readonly employees: EmployeeService,
    private readonly lifecycle: EmployeeLifecycleService,
  ) {}

  @Get()
  @Roles('hr_officer', 'super_admin', 'principal', 'accountant')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List employees' })
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('department') department?: string,
    @Query('departmentId') departmentId?: string,
    @Query('employmentType') employmentType?: EmploymentType,
    @Query('status') status?: EmployeeStatus,
    @Query('reportingManagerId') reportingManagerId?: string,
    @Query('search') search?: string,
  ) {
    return this.employees.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      department,
      departmentId,
      employmentType,
      status,
      reportingManagerId,
      search,
    });
  }

  @Post()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'employee', action: 'create' })
  @ApiOperation({ summary: 'Onboard an employee; generates the employee code' })
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employees.create(dto, user.id);
  }

  @Get(':id')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  @Patch(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'employee', action: 'update' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employees.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('super_admin')
  @Permissions('hr:delete')
  @Audit({ module: 'hr', entity: 'employee', action: 'delete' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.employees.softDelete(id, user.id);
  }

  @Post(':id/confirm-probation')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'employee', action: 'confirm_probation' })
  confirmProbation(
    @Param('id') id: string,
    @Body() dto: ConfirmProbationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.confirmProbation(id, user.id, dto.confirmationDate);
  }

  @Post(':id/transfer')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'employee', action: 'transfer' })
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.transfer(id, dto, user.id);
  }

  @Post(':id/exit')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'employee', action: 'exit' })
  exit(
    @Param('id') id: string,
    @Body() dto: ExitEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lifecycle.exit(id, dto, user.id);
  }

  @Get(':id/history')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  history(@Param('id') id: string) {
    return this.lifecycle.history(id);
  }
}
