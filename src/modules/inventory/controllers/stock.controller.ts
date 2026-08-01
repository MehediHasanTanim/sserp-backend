import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { StockLevelService } from '../services/stock-level.service';
import { StockMovementService } from '../services/stock-movement.service';
import { TransferStockDto } from '../dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class StockController {
  constructor(
    private readonly levels: StockLevelService,
    private readonly movements: StockMovementService,
  ) {}

  @Get('stock-levels')
  @Permissions('inventory:read')
  listLevels(
    @Query('itemId') itemId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.levels.list({ itemId, locationId });
  }

  @Get('stock-levels/low')
  @Roles('receptionist', 'accountant', 'principal')
  @Permissions('inventory:read')
  lowStock() {
    return this.levels.lowStock();
  }

  @Get('items/:id/movements')
  @Roles('receptionist', 'accountant', 'principal')
  @Permissions('inventory:read')
  itemMovements(@Param('id') id: string) {
    return this.movements.listForItem(id);
  }

  @Get('stock-valuation')
  @Roles('accountant', 'principal')
  @Permissions('inventory:read')
  valuation() {
    return this.levels.valuation();
  }

  @Get('expiring')
  @Roles('receptionist', 'accountant')
  @Permissions('inventory:read')
  expiring(@Query('withinDays') withinDays?: string) {
    return this.levels.expiring(withinDays ? parseInt(withinDays, 10) : 30);
  }

  @Post('transfers')
  @Roles('receptionist')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'stock_transfer', action: 'create' })
  transfer(@Body() dto: TransferStockDto, @CurrentUser() user: AuthUser) {
    return this.movements.transfer(
      dto.itemId,
      dto.fromLocationId,
      dto.toLocationId,
      dto.quantity,
      user.id,
      dto.remarks,
    );
  }
}
