import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../shared/decorators';
import { StatementService } from '../services/statement.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/reports')
export class StatementsController {
  constructor(private readonly statements: StatementService) {}

  @Get('pnl')
  @Roles('accountant', 'principal', 'super_admin')
  pnl(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('costCenter') costCenter?: string,
  ) {
    return this.statements.pnl(new Date(from), new Date(to), costCenter);
  }

  @Get('balance-sheet')
  @Roles('accountant', 'principal', 'super_admin')
  balanceSheet(
    @Query('asOf') asOf: string,
    @Query('costCenter') costCenter?: string,
  ) {
    return this.statements.balanceSheet(new Date(asOf), costCenter);
  }

  @Get('cash-flow')
  @Roles('accountant', 'principal', 'super_admin')
  cashFlow(@Query('from') from: string, @Query('to') to: string) {
    return this.statements.cashFlow(new Date(from), new Date(to));
  }

  @Get('cost-center-profitability')
  @Roles('accountant', 'principal', 'super_admin')
  costCenterProfitability(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.statements.costCenterProfitability(
      new Date(from),
      new Date(to),
    );
  }
}
