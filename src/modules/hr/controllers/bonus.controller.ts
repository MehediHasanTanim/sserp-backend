import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { BonusService } from '../services/bonus.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/bonuses')
export class BonusController {
  constructor(private readonly bonuses: BonusService) {}

  @Get()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  list(
    @Query('year') year?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.bonuses.list({
      year: year ? Number(year) : undefined,
      employeeId,
      status,
    });
  }

  @Post()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'bonus', action: 'create' })
  create(@Body() body: never) {
    return this.bonuses.create(body);
  }

  @Post(':id/approve')
  @Roles('principal', 'super_admin')
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'bonus', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.bonuses.approve(id, user.id);
  }
}
