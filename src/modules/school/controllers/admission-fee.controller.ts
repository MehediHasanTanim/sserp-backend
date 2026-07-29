import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { AdmissionFeeService } from '../services/admission-fee.service';
import {
  CreateAdmissionFeeSettingDto,
  PayAdmissionFeeDto,
  UpdateAdmissionFeeSettingDto,
  WaiveAdmissionFeeDto,
} from '../dto/admission-fee.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school')
export class AdmissionFeeController {
  constructor(private readonly admissionFees: AdmissionFeeService) {}

  @Get('admission-fee-settings')
  @Roles('super_admin', 'principal')
  @Permissions('school:read')
  listSettings(@Query('academicYearId') academicYearId?: string) {
    return this.admissionFees.listSettings(academicYearId);
  }

  @Post('admission-fee-settings')
  @Roles('super_admin', 'principal')
  @Permissions('school:create')
  @Audit({
    module: 'school',
    entity: 'admission_fee_setting',
    action: 'create',
  })
  createSetting(@Body() dto: CreateAdmissionFeeSettingDto) {
    return this.admissionFees.createSetting(dto);
  }

  @Patch('admission-fee-settings/:id')
  @Roles('super_admin', 'principal')
  @Permissions('school:update')
  @Audit({
    module: 'school',
    entity: 'admission_fee_setting',
    action: 'update',
  })
  updateSetting(
    @Param('id') id: string,
    @Body() dto: UpdateAdmissionFeeSettingDto,
  ) {
    return this.admissionFees.updateSetting(id, dto);
  }

  @Get('students/:id/admission-fee')
  @Roles(
    'coordinator',
    'accountant',
    'receptionist',
    'super_admin',
    'principal',
  )
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.admissionFees.getForStudent(id);
  }

  @Post('students/:id/admission-fee/pay')
  @Roles('coordinator', 'accountant', 'receptionist')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'admission_fee', action: 'pay' })
  @ApiOperation({
    summary: 'Record payment; idempotent; activates the student',
  })
  pay(
    @Param('id') id: string,
    @Body() dto: PayAdmissionFeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admissionFees.pay(id, dto, user.id);
  }

  @Post('students/:id/admission-fee/waive')
  @Roles('principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'admission_fee', action: 'waive' })
  @ApiOperation({
    summary: 'Waive with mandatory reason; activates the student',
  })
  waive(
    @Param('id') id: string,
    @Body() dto: WaiveAdmissionFeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admissionFees.waive(id, {
      reason: dto.reason,
      actorId: user.id,
      actorRoles: user.roles,
    });
  }

  @Get('students/:id/admission-fee/receipt')
  @Roles('coordinator', 'accountant', 'receptionist', 'parent')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Receipt state for the paid admission fee' })
  async receipt(@Param('id') id: string) {
    const fee = await this.admissionFees.getForStudent(id);
    return {
      receiptNumber: fee.receiptNumber,
      amount: fee.paidAmount,
      paidDate: fee.paidDate,
      status: fee.status,
    };
  }
}
