import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { ItemService } from '../services/item.service';
import {
  CreateLocationDto,
  CreateUnitDto,
  UpdateLocationDto,
} from '../dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/units')
export class UnitController {
  constructor(private readonly items: ItemService) {}

  @Get()
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:read')
  list() {
    return this.items.listUnits();
  }

  @Post()
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'unit_of_measure', action: 'create' })
  create(@Body() dto: CreateUnitDto) {
    return this.items.createUnit(dto);
  }
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/locations')
export class LocationController {
  constructor(private readonly items: ItemService) {}

  @Get()
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:read')
  list() {
    return this.items.listLocations();
  }

  @Post()
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'location', action: 'create' })
  create(@Body() dto: CreateLocationDto) {
    return this.items.createLocation(dto);
  }

  @Patch(':id')
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'location', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.items.updateLocation(id, dto);
  }
}
