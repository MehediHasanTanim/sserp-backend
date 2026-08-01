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
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/categories')
export class CategoryController {
  constructor(private readonly items: ItemService) {}

  @Get()
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'List item categories' })
  list() {
    return this.items.listCategories();
  }

  @Post()
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'category', action: 'create' })
  create(@Body() dto: CreateCategoryDto) {
    return this.items.createCategory(dto);
  }

  @Patch(':id')
  @Roles('receptionist', 'super_admin', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'category', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.items.updateCategory(id, dto);
  }
}
