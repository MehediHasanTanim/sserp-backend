import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
} from '../../../shared/decorators';
import { PayslipService } from '../services/payslip.service';
import { TaxCertificateService } from '../services/tax-certificate.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class PayslipController {
  constructor(
    private readonly payslips: PayslipService,
    private readonly taxCerts: TaxCertificateService,
  ) {}

  @Get('payroll/slips/:employeeId')
  @Roles('hr_officer', 'accountant', 'super_admin', 'principal')
  @Permissions('hr:read')
  byEmployee(@Param('employeeId') employeeId: string) {
    return this.payslips.listByEmployee(employeeId);
  }

  @Get('payroll/slips/:slipId/document')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  document(@Param('slipId') slipId: string) {
    return this.payslips.getDocument(slipId);
  }

  @Get('employees/:id/tax-certificate/:fiscalYear')
  @Roles('hr_officer', 'accountant', 'super_admin')
  @Permissions('hr:read')
  taxCert(
    @Param('id') id: string,
    @Param('fiscalYear') fiscalYear: string,
    @Query('issue') issue: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (issue === 'true') {
      return this.taxCerts.issue(id, fiscalYear, user.id);
    }
    return this.taxCerts.get(id, fiscalYear);
  }
}
