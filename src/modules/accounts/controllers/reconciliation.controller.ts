import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { ReconciliationService, CreateReconciliationDto } from '../services/reconciliation.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/reconciliations')
export class ReconciliationController {
  constructor(private readonly reconciliations: ReconciliationService) {}

  @Get()
  @Roles('accountant')
  list(@Query('bankAccountId') bankAccountId?: string) {
    return this.reconciliations.list(bankAccountId);
  }

  @Get(':id')
  @Roles('accountant')
  get(@Param('id') id: string) {
    return this.reconciliations.findById(id);
  }

  @Post()
  @Roles('accountant')
  create(@Body() dto: CreateReconciliationDto) {
    return this.reconciliations.create({
      ...dto,
      periodStart: new Date(dto.periodStart as unknown as string),
      periodEnd: new Date(dto.periodEnd as unknown as string),
    });
  }

  @Post(':id/auto-match')
  @Roles('accountant')
  autoMatch(@Param('id') id: string) {
    return this.reconciliations.autoMatch(id);
  }

  @Post(':id/complete')
  @Roles('accountant')
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reconciliations.complete(id, user.id);
  }

  @Post('lines/:lineId/match')
  @Roles('accountant')
  manualMatch(
    @Param('lineId') lineId: string,
    @Body('journalLineId') journalLineId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reconciliations.manualMatch(lineId, journalLineId, user.id);
  }
}
