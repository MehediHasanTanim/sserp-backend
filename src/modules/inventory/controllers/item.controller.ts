import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { ItemService } from '../services/item.service';
import { CreateItemDto, UpdateItemDto } from '../dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/items')
export class ItemController {
  constructor(private readonly items: ItemService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'List items' })
  list(
    @Query('categoryId') categoryId?: string,
    @Query('nature') nature?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.items.listItems({
      categoryId,
      nature,
      lowStock: lowStock === 'true',
    });
  }

  @Get(':id')
  @Permissions('inventory:read')
  get(@Param('id') id: string) {
    return this.items.getItem(id);
  }

  @Post()
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'item', action: 'create' })
  create(@Body() dto: CreateItemDto) {
    return this.items.createItem(dto);
  }

  @Patch(':id')
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'item', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.items.updateItem(id, dto);
  }
}
