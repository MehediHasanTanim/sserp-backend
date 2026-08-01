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
import { VendorStatus } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { VendorService } from '../services/vendor.service';
import {
  AddVendorDocumentDto,
  AddVendorRatingDto,
  BlacklistVendorDto,
  CreateVendorDto,
  UpdateVendorDto,
} from '../dto/vendor.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('procurement/vendors')
export class VendorController {
  constructor(private readonly vendors: VendorService) {}

  @Get()
  @Roles('accountant', 'receptionist', 'super_admin', 'principal')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'List vendors' })
  list(
    @Query('status') status?: VendorStatus,
    @Query('search') search?: string,
  ) {
    return this.vendors.list({ status, search });
  }

  @Get('preferred')
  @Roles('accountant', 'receptionist', 'super_admin')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'Preferred vendor list' })
  preferred() {
    return this.vendors.listPreferred();
  }

  @Get(':id')
  @Roles('accountant', 'receptionist', 'super_admin', 'principal')
  @Permissions('procurement:read')
  get(@Param('id') id: string) {
    return this.vendors.findById(id);
  }

  @Post()
  @Roles('accountant', 'receptionist', 'super_admin')
  @Permissions('procurement:create')
  @Audit({ module: 'procurement', entity: 'vendor', action: 'create' })
  create(@Body() body: CreateVendorDto, @CurrentUser() user: AuthUser) {
    return this.vendors.create(body, user.id);
  }

  @Patch(':id')
  @Roles('accountant', 'receptionist', 'super_admin')
  @Permissions('procurement:update')
  @Audit({ module: 'procurement', entity: 'vendor', action: 'update' })
  update(@Param('id') id: string, @Body() body: UpdateVendorDto) {
    return this.vendors.update(id, body);
  }

  @Post(':id/blacklist')
  @Roles('principal', 'super_admin')
  @Permissions('procurement:update')
  @Audit({ module: 'procurement', entity: 'vendor', action: 'blacklist' })
  blacklist(
    @Param('id') id: string,
    @Body() body: BlacklistVendorDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.blacklist(id, body.reason, user.id);
  }

  @Post(':id/reactivate')
  @Roles('principal', 'super_admin')
  @Permissions('procurement:update')
  reactivate(@Param('id') id: string) {
    return this.vendors.reactivate(id);
  }

  @Get(':id/documents')
  @Roles('accountant', 'receptionist', 'super_admin')
  @Permissions('procurement:read')
  listDocuments(@Param('id') id: string) {
    return this.vendors.listDocuments(id);
  }

  @Post(':id/documents')
  @Roles('accountant', 'receptionist', 'super_admin')
  @Permissions('procurement:create')
  addDocument(@Param('id') id: string, @Body() body: AddVendorDocumentDto) {
    return this.vendors.addDocument(id, body);
  }

  @Get(':id/ratings')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('procurement:read')
  listRatings(@Param('id') id: string) {
    return this.vendors.listRatings(id);
  }

  @Post(':id/ratings')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('procurement:create')
  addRating(
    @Param('id') id: string,
    @Body() body: AddVendorRatingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vendors.addRating(id, body, user.id);
  }
}
