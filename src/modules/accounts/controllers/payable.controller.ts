import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApPartyType, ArLedgerStatus } from '@prisma/client';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { PayableService } from '../services/payable.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/payables')
export class PayableController {
  constructor(private readonly payables: PayableService) {}

  @Get()
  @Roles('accountant', 'principal', 'super_admin')
  list(
    @Query('partyType') partyType?: ApPartyType,
    @Query('status') status?: ArLedgerStatus,
  ) {
    return this.payables.list({ partyType, status });
  }

  @Get('aging')
  @Roles('accountant', 'principal', 'super_admin')
  aging(@Query('asOf') asOf?: string) {
    return this.payables.aging(asOf ? new Date(asOf) : undefined);
  }

  @Get(':id')
  @Roles('accountant', 'principal', 'super_admin')
  get(@Param('id') id: string) {
    return this.payables.findById(id);
  }

  @Post(':id/schedule-payment')
  @Roles('accountant')
  schedulePayment(
    @Param('id') id: string,
    @Body('scheduledPayDate') scheduledPayDate: string,
  ) {
    return this.payables.schedulePayment(id, new Date(scheduledPayDate));
  }

  @Post(':id/pay')
  @Roles('accountant')
  pay(
    @Param('id') id: string,
    @Body() body: { bankAccountId: string; costCenter: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.payables.pay(id, user.id, body.bankAccountId, body.costCenter);
  }
}
