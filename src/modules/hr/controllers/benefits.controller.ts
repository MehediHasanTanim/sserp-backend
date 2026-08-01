import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { BenefitsService } from '../services/benefits.service';
import { TaxCertificateService } from '../services/tax-certificate.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class BenefitsController {
  constructor(
    private readonly benefits: BenefitsService,
    private readonly taxCerts: TaxCertificateService,
  ) {}

  @Get('benefit-plans')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  plans() {
    return this.benefits.listPlans();
  }

  @Post('benefit-plans')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  createPlan(@Body() body: never) {
    return this.benefits.createPlan(body);
  }

  @Get('employees/:id/benefit-enrollments')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  listEnrollments(@Param('id') id: string) {
    return this.benefits.listEnrollments(id);
  }

  @Post('employees/:id/benefit-enrollments')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  enroll(
    @Param('id') id: string,
    @Body() body: { benefitPlanId: string; enrolledFrom: string },
  ) {
    return this.benefits.enroll(id, body.benefitPlanId, body.enrolledFrom);
  }

  @Get('loans')
  @Roles('hr_officer', 'super_admin', 'accountant')
  @Permissions('hr:read')
  loans(@Query('employeeId') employeeId?: string) {
    return this.benefits.listLoans(employeeId);
  }

  @Post('loans')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'employee_loan', action: 'create' })
  requestLoan(@Body() body: never) {
    return this.benefits.requestLoan(body);
  }

  @Post('loans/:id/approve')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  approveLoan(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.benefits.approveLoan(id, user.id);
  }

  @Post('loans/:id/disburse')
  @Roles('accountant', 'super_admin')
  @Audit({ module: 'hr', entity: 'employee_loan', action: 'disburse' })
  disburse(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.benefits.disburseLoan(id, user.id);
  }

  @Get('loans/:id/schedule')
  @Roles('hr_officer', 'accountant', 'super_admin')
  @Permissions('hr:read')
  schedule(@Param('id') id: string) {
    return this.benefits.getLoanSchedule(id);
  }

  @Post('loan-repayments/:id/waive')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  waive(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.benefits.waiveRepayment(id, body.reason);
  }

  @Get('employees/:id/end-of-service-summary')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  eos(@Param('id') id: string) {
    return this.benefits.endOfServiceSummary(id);
  }

  @Post('employees/:id/tax-certificate/:fiscalYear')
  @Roles('hr_officer', 'accountant', 'super_admin')
  @Permissions('hr:create')
  issueTax(
    @Param('id') id: string,
    @Param('fiscalYear') fiscalYear: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.taxCerts.issue(id, fiscalYear, user.id);
  }
}
