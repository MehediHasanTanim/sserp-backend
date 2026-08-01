import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { StockAdjustmentService } from '../services/stock-issue.service';
import { CreateAdjustmentDto } from '../dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/adjustments')
export class StockAdjustmentController {
  constructor(private readonly adjustments: StockAdjustmentService) {}

  @Get()
  @Roles('receptionist', 'accountant')
  @Permissions('inventory:read')
  list() {
    return this.adjustments.list();
  }

  @Post()
  @Roles('receptionist', 'accountant')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'stock_adjustment', action: 'create' })
  create(@Body() dto: CreateAdjustmentDto) {
    return this.adjustments.create(dto);
  }

  @Post(':id/approve')
  @Roles('principal', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'stock_adjustment', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.adjustments.approve(id, user.id);
  }
}
