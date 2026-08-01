import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../shared/decorators';
import { LedgerQueryService } from '../services/ledger-query.service';
import { TrialBalanceService } from '../services/trial-balance.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
export class LedgerController {
  constructor(
    private readonly ledger: LedgerQueryService,
    private readonly trialBalance: TrialBalanceService,
  ) {}

  @Get('ledger/:accountId')
  @Roles('accountant', 'principal', 'super_admin')
  getLedger(
    @Param('accountId') accountId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.ledger.getAccountLedger(
      accountId,
      new Date(from),
      new Date(to),
    );
  }

  @Get('trial-balance')
  @Roles('accountant', 'principal', 'super_admin')
  trialBalanceReport(@Query('asOf') asOf: string) {
    return this.trialBalance.asOf(new Date(asOf));
  }
}
