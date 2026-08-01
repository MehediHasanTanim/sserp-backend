import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { EncashmentService } from '../services/encashment.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/leave-encashments')
export class EncashmentController {
  constructor(private readonly encashment: EncashmentService) {}

  @Get()
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  list(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.encashment.list({ employeeId, status });
  }

  @Get('eligibility')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  eligibility(
    @Query('employeeId') employeeId: string,
    @Query('year') year?: string,
  ) {
    return this.encashment.eligibility(
      employeeId,
      year ? Number(year) : undefined,
    );
  }

  @Post()
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'encashment_request', action: 'create' })
  request(@Body() body: never) {
    return this.encashment.request(body);
  }

  @Post(':id/approve')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'encashment_request', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.encashment.approve(id, user.id, user.roles ?? []);
  }

  @Post(':id/reject')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:approve')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { reason: string },
  ) {
    return this.encashment.reject(id, user.id, body.reason);
  }

  @Post(':id/process')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  process(@Param('id') id: string, @Body() body: { payrollRunId: string }) {
    return this.encashment.process(id, body.payrollRunId);
  }
}
