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
import { PurchaseOrderStatus } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { PurchaseOrderService } from '../services/purchase-order.service';
import {
  AmendPurchaseOrderDto,
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from '../dto/purchase-order.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('procurement/purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly pos: PurchaseOrderService) {}

  @Get()
  @Roles('accountant', 'principal', 'receptionist', 'super_admin')
  @Permissions('procurement:read')
  list(
    @Query('status') status?: PurchaseOrderStatus,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.pos.list({ status, vendorId });
  }

  @Post()
  @Roles('accountant', 'receptionist', 'super_admin')
  @Permissions('procurement:create')
  @Audit({ module: 'procurement', entity: 'purchase_order', action: 'create' })
  create(@Body() body: CreatePurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.pos.createFromPrLines(body, user.id);
  }

  @Get(':id')
  @Roles('accountant', 'principal', 'receptionist', 'super_admin')
  @Permissions('procurement:read')
  get(@Param('id') id: string) {
    return this.pos.findById(id);
  }

  @Patch(':id')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:update')
  update(@Param('id') id: string, @Body() body: UpdatePurchaseOrderDto) {
    return this.pos.updateDraft(id, body);
  }

  @Post(':id/approve')
  @Roles('principal', 'super_admin')
  @Permissions('procurement:update')
  @Audit({ module: 'procurement', entity: 'purchase_order', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pos.approve(id, user.id, user.roles);
  }

  @Post(':id/send')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:update')
  send(@Param('id') id: string) {
    return this.pos.send(id);
  }

  @Post(':id/amend')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:update')
  amend(
    @Param('id') id: string,
    @Body() body: AmendPurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pos.amend(id, user.id, body);
  }

  @Post(':id/cancel')
  @Roles('principal', 'accountant', 'super_admin')
  @Permissions('procurement:update')
  cancel(@Param('id') id: string, @Body() body: CancelPurchaseOrderDto) {
    return this.pos.cancel(id, body.reason);
  }

  @Get(':id/document')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'PO document metadata' })
  document(@Param('id') id: string) {
    return this.pos.document(id);
  }

  @Get(':id/tracking')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('procurement:read')
  tracking(@Param('id') id: string) {
    return this.pos.tracking(id);
  }
}
