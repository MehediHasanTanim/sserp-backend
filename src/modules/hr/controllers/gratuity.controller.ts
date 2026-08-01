import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { GratuityProvisionService } from '../services/gratuity-provision.service';
import { GratuitySettlementService } from '../services/gratuity-settlement.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/gratuity')
export class GratuityController {
  constructor(
    private readonly provisions: GratuityProvisionService,
    private readonly settlements: GratuitySettlementService,
  ) {}

  @Get('employees/:id')
  @Roles('hr_officer', 'accountant', 'principal', 'super_admin')
  @Permissions('hr:read')
  employeeView(@Param('id') id: string) {
    return this.provisions.getEmployeeSummary(id);
  }

  @Post('employees/:id/recalculate')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  recalculate(@Param('id') id: string) {
    return this.provisions.recalculateEntitlement(id);
  }

  @Get('provisions')
  @Roles('hr_officer', 'accountant', 'super_admin')
  @Permissions('hr:read')
  listProvisions(@Query('year') year?: string, @Query('month') month?: string) {
    return this.provisions.list({
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  @Post('provisions/run')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'gratuity_provision', action: 'run' })
  runProvisions(@Body() body: { year: number; month: number }) {
    return this.provisions.runMonthly(body.year, body.month);
  }

  @Post('employees/:id/adjust')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:approve')
  adjust(
    @Param('id') id: string,
    @Body() body: { amount: number; reason: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.provisions.adjust(id, body, user.id);
  }

  @Post('employees/:id/settle')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'gratuity_payment', action: 'settle' })
  settle(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.settlements.settle(id, user.id);
  }

  @Post('payments/:id/pay')
  @Roles('accountant', 'super_admin')
  @Audit({ module: 'hr', entity: 'gratuity_payment', action: 'pay' })
  pay(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { method?: 'cash' | 'bank_transfer' },
  ) {
    return this.settlements.pay(id, user.id, body.method ?? 'bank_transfer');
  }

  @Get('payments/:id/settlement-letter')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  letter(@Param('id') id: string) {
    return this.settlements.settlementLetter(id);
  }

  @Get('liability')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('hr:read')
  liability(@Query('asOf') asOf?: string) {
    return this.provisions.liabilityAsOf(asOf ? new Date(asOf) : new Date());
  }
}
