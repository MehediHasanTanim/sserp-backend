import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { BudgetService, CreateBudgetDto, BudgetLineDto } from '../services/budget.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/budgets')
export class BudgetController {
  constructor(private readonly budgets: BudgetService) {}

  @Get()
  @Roles('accountant', 'principal', 'super_admin')
  list(
    @Query('fiscalYear') fiscalYear?: string,
    @Query('costCenter') costCenter?: string,
  ) {
    return this.budgets.list({ fiscalYear, costCenter });
  }

  @Get('variance')
  @Roles('accountant', 'principal', 'coordinator', 'super_admin')
  variance(
    @Query('costCenter') costCenter?: string,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    return this.budgets.variance(costCenter, fiscalYear);
  }

  @Get('utilization')
  @Roles('accountant', 'principal', 'super_admin')
  utilization(
    @Query('costCenter') costCenter: string,
    @Query('fiscalYear') fiscalYear: string,
  ) {
    return this.budgets.utilization(costCenter, fiscalYear);
  }

  @Get('check')
  @Roles('accountant')
  check(
    @Query('accountId') accountId: string,
    @Query('costCenter') costCenter: string,
    @Query('amount') amount: string,
    @Query('entryDate') entryDate: string,
  ) {
    return this.budgets.dryRun({
      accountId,
      costCenter,
      amount: Number(amount),
      entryDate: new Date(entryDate),
    });
  }

  @Get(':id')
  @Roles('accountant', 'principal', 'super_admin')
  get(@Param('id') id: string) {
    return this.budgets.findById(id);
  }

  @Post()
  @Roles('accountant', 'principal')
  create(@Body() dto: CreateBudgetDto, @CurrentUser() user: AuthUser) {
    return this.budgets.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('accountant')
  update(@Param('id') id: string, @Body() dto: Partial<CreateBudgetDto>) {
    return this.budgets.updateDraft(id, dto);
  }

  @Post(':id/approve')
  @Roles('principal', 'super_admin')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.budgets.approve(id, user.id);
  }

  @Post(':id/revise')
  @Roles('accountant')
  revise(
    @Param('id') id: string,
    @Body() body: { changes: BudgetLineDto[]; reason: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.budgets.revise(id, body.changes, body.reason, user.id);
  }
}

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/budget-revisions')
export class BudgetRevisionController {
  constructor(private readonly budgets: BudgetService) {}

  @Post(':id/approve')
  @Roles('principal', 'super_admin')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.budgets.approveRevision(id, user.id);
  }
}
