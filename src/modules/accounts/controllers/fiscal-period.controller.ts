import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { FiscalPeriodService } from '../services/fiscal-period.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/fiscal-periods')
export class FiscalPeriodController {
  constructor(private readonly periods: FiscalPeriodService) {}

  @Get()
  @Roles('accountant', 'super_admin')
  list() {
    return this.periods.list();
  }

  @Get(':id')
  @Roles('accountant', 'super_admin')
  get(@Param('id') id: string) {
    return this.periods.findById(id);
  }

  @Post()
  @Roles('accountant', 'super_admin')
  create(
    @Body()
    dto: {
      academicOrFiscalYear: string;
      periodMonth: number;
      periodYear: number;
      startDate: string;
      endDate: string;
    },
  ) {
    return this.periods.create({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
    });
  }

  @Post(':id/close')
  @Roles('accountant', 'principal', 'super_admin')
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.periods.close(id, user.id);
  }

  @Post(':id/reopen')
  @Roles('super_admin')
  reopen(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.periods.reopen(id, reason, user.id);
  }
}
