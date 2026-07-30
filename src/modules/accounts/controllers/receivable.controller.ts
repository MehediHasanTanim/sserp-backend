import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArLedgerStatus, PartyType } from '@prisma/client';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { ReceivableService } from '../services/receivable.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/receivables')
export class ReceivableController {
  constructor(private readonly receivables: ReceivableService) {}

  @Get()
  @Roles('accountant', 'principal', 'super_admin')
  list(
    @Query('partyType') partyType?: PartyType,
    @Query('partyId') partyId?: string,
    @Query('status') status?: ArLedgerStatus,
  ) {
    return this.receivables.list({ partyType, partyId, status });
  }

  @Get('aging')
  @Roles('accountant', 'principal', 'super_admin')
  aging(@Query('asOf') asOf?: string) {
    return this.receivables.aging(asOf ? new Date(asOf) : undefined);
  }

  @Get(':id')
  @Roles('accountant', 'principal', 'super_admin')
  get(@Param('id') id: string) {
    return this.receivables.findById(id);
  }

  @Post(':id/follow-ups')
  @Roles('accountant')
  addFollowUp(
    @Param('id') id: string,
    @Body()
    body: {
      followUpDate: string;
      channel: 'call' | 'sms' | 'email' | 'meeting';
      outcome: string;
      promisedPaymentDate?: string;
      notes?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.receivables.addFollowUp(
      id,
      {
        ...body,
        followUpDate: new Date(body.followUpDate),
        promisedPaymentDate: body.promisedPaymentDate
          ? new Date(body.promisedPaymentDate)
          : undefined,
      },
      user.id,
    );
  }

  @Post(':id/write-off')
  @Roles('principal', 'super_admin')
  writeOff(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.receivables.writeOff(id, reason, user.id);
  }
}
