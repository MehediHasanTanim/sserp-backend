import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { PayrollRunService } from '../services/payroll-run.service';
import { PayrollAdjustmentService } from '../services/payslip.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/payroll')
export class PayrollController {
  constructor(
    private readonly runs: PayrollRunService,
    private readonly adjustments: PayrollAdjustmentService,
  ) {}

  @Get('runs')
  @Roles('hr_officer', 'accountant', 'principal', 'super_admin')
  @Permissions('hr:read')
  list(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    return this.runs.listRuns({
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      status,
    });
  }

  @Post('run')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'payroll_run', action: 'create' })
  create(
    @Body()
    body: {
      payrollGroupId: string;
      periodMonth: number;
      periodYear: number;
      notes?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.runs.createRun(body, user.id);
  }

  @Get('runs/:id')
  @Roles('hr_officer', 'accountant', 'principal', 'super_admin')
  @Permissions('hr:read')
  get(@Param('id') id: string) {
    return this.runs.getRun(id);
  }

  @Post('runs/:id/recalculate')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  recalculate(@Param('id') id: string) {
    return this.runs.recalculate(id);
  }

  @Post('runs/:id/approve')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'payroll_run', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.runs.approve(id, user.id);
  }

  @Post('runs/:id/lock')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'payroll_run', action: 'lock' })
  lock(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.runs.lock(id, user.id);
  }

  @Post('runs/:id/cancel')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  cancel(@Param('id') id: string) {
    return this.runs.cancel(id);
  }

  @Post('runs/:id/mark-paid')
  @Roles('accountant', 'super_admin')
  markPaid(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { method?: 'bank_transfer' | 'cash' },
  ) {
    return this.runs.markPaid(id, user.id, body.method ?? 'bank_transfer');
  }

  @Get('runs/:id/bank-file')
  @Roles('accountant', 'hr_officer', 'super_admin')
  @Permissions('hr:read')
  bankFile(@Param('id') id: string) {
    return this.runs.bankFile(id);
  }

  @Get('runs/:id/slips')
  @Roles('hr_officer', 'accountant', 'super_admin')
  @Permissions('hr:read')
  slips(@Param('id') id: string) {
    return this.runs.getRun(id).then((r) => r.slips);
  }

  @Get('adjustments')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  listAdj(
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.adjustments.list({
      employeeId,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  @Post('adjustments')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  createAdj(@Body() body: never) {
    return this.adjustments.create(body);
  }
}
