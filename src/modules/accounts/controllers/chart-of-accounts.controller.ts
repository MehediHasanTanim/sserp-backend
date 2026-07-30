import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { ChartOfAccountsService, CreateAccountDto } from '../services/chart-of-accounts.service';

const READ_ROLES = ['accountant', 'principal', 'super_admin'] as const;
const WRITE_ROLES = ['accountant', 'super_admin'] as const;

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/chart')
export class ChartOfAccountsController {
  constructor(private readonly coa: ChartOfAccountsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(@Query('flat') flat?: string) {
    return this.coa.list(flat === 'true');
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id') id: string) {
    return this.coa.findById(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateAccountDto) {
    return this.coa.create(dto);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: Partial<CreateAccountDto>) {
    return this.coa.update(id, dto);
  }

  @Post(':id/deactivate')
  @Roles(...WRITE_ROLES)
  deactivate(@Param('id') id: string) {
    return this.coa.deactivate(id);
  }
}
