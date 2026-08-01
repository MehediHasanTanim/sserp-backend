import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { VendorInvoiceService } from '../services/vendor-invoice.service';
import {
  ApproveVendorInvoiceDto,
  CreateVendorInvoiceDto,
  RejectVendorInvoiceDto,
} from '../dto/vendor-invoice.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('procurement/vendor-invoices')
export class VendorInvoiceController {
  constructor(private readonly invoices: VendorInvoiceService) {}

  @Get()
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:read')
  list() {
    return this.invoices.list();
  }

  @Post()
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:create')
  @Audit({ module: 'procurement', entity: 'vendor_invoice', action: 'create' })
  create(@Body() body: CreateVendorInvoiceDto) {
    return this.invoices.create(body);
  }

  @Get(':id')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('procurement:read')
  get(@Param('id') id: string) {
    return this.invoices.findById(id);
  }

  @Get(':id/match')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'Three-way match result' })
  match(@Param('id') id: string) {
    return this.invoices.runMatch(id);
  }

  @Post(':id/approve')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('procurement:update')
  @Audit({ module: 'procurement', entity: 'vendor_invoice', action: 'approve' })
  approve(
    @Param('id') id: string,
    @Body() body: ApproveVendorInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.approve(id, user.id, body);
  }

  @Post(':id/reject')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:update')
  reject(
    @Param('id') id: string,
    @Body() body: RejectVendorInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.reject(id, user.id, body.reason);
  }
}
