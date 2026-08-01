import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { AssetService } from '../services/asset.service';
import {
  AssignAssetDto,
  AssetConditionDto,
  CreateAssetDto,
  DisposeAssetDto,
  ReturnAssetDto,
  RunDepreciationDto,
  UpdateAssetDto,
} from '../dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/assets')
export class AssetController {
  constructor(private readonly assets: AssetService) {}

  @Get()
  @Roles('receptionist', 'accountant', 'super_admin')
  @Permissions('inventory:read')
  list() {
    return this.assets.list();
  }

  @Post('depreciation/run')
  @Roles('accountant')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'asset_depreciation', action: 'run' })
  runDepreciation(@Body() dto: RunDepreciationDto) {
    const now = new Date();
    const year = dto.year ?? now.getUTCFullYear();
    const month = dto.month ?? now.getUTCMonth() + 1;
    return this.assets.runDepreciation(year, month);
  }

  @Get(':id')
  @Permissions('inventory:read')
  get(@Param('id') id: string) {
    return this.assets.get(id);
  }

  @Post()
  @Roles('receptionist', 'accountant', 'super_admin')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'asset', action: 'create' })
  create(@Body() dto: CreateAssetDto) {
    return this.assets.create(dto);
  }

  @Patch(':id')
  @Roles('receptionist', 'accountant', 'super_admin')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'asset', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(id, dto);
  }

  @Post(':id/assign')
  @Roles('receptionist', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'asset', action: 'assign' })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assets.assign(id, dto, user.id);
  }

  @Post(':id/return')
  @Roles('receptionist', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'asset', action: 'return' })
  returnAsset(
    @Param('id') id: string,
    @Body() dto: ReturnAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assets.returnAsset(id, dto, user.id);
  }

  @Post(':id/condition')
  @Roles('receptionist', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'asset', action: 'condition' })
  condition(
    @Param('id') id: string,
    @Body() dto: AssetConditionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assets.logCondition(id, dto, user.id);
  }

  @Get(':id/depreciation')
  @Roles('accountant', 'principal')
  @Permissions('inventory:read')
  depreciation(@Param('id') id: string) {
    return this.assets.listDepreciation(id);
  }

  @Post(':id/dispose')
  @Roles('principal', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'asset', action: 'dispose' })
  dispose(
    @Param('id') id: string,
    @Body() dto: DisposeAssetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assets.dispose(id, dto, user.id);
  }
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/asset-register')
export class AssetRegisterController {
  constructor(private readonly assets: AssetService) {}

  @Get()
  @Roles('accountant', 'principal')
  @Permissions('inventory:read')
  register() {
    return this.assets.assetRegister();
  }
}
