import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { VendorPaymentService } from '../services/vendor-payment.service';
import {
  AdjustVendorAdvanceDto,
  CreateVendorAdvanceDto,
  CreateVendorPaymentDto,
  PayVendorPaymentDto,
} from '../dto/vendor-payment.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('procurement')
export class VendorPaymentController {
  constructor(private readonly payments: VendorPaymentService) {}

  @Get('vendor-payments')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:read')
  listPayments(@Query('vendorId') vendorId?: string) {
    return this.payments.list({ vendorId });
  }

  @Post('vendor-payments')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:create')
  @Audit({ module: 'procurement', entity: 'vendor_payment', action: 'create' })
  createPayment(
    @Body() body: CreateVendorPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.createScheduled(
      body,
      user.id,
      user.roles,
      body.blacklistOverrideReason,
    );
  }

  @Post('vendor-payments/:id/pay')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:update')
  @Audit({ module: 'procurement', entity: 'vendor_payment', action: 'pay' })
  pay(
    @Param('id') id: string,
    @Body() body: PayVendorPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.pay(
      id,
      user.id,
      body.allocations,
      user.roles,
      body.blacklistOverrideReason,
    );
  }

  @Get('vendors/:id/payment-history')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('procurement:read')
  paymentHistory(@Param('id') vendorId: string) {
    return this.payments.paymentHistory(vendorId);
  }

  @Get('vendor-advances')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:read')
  listAdvances(@Query('vendorId') vendorId?: string) {
    return this.payments.listAdvances(vendorId);
  }

  @Post('vendor-advances')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:create')
  createAdvance(@Body() body: CreateVendorAdvanceDto) {
    return this.payments.createAdvance(body);
  }

  @Post('vendor-advances/:id/adjust')
  @Roles('accountant', 'super_admin')
  @Permissions('procurement:update')
  adjustAdvance(@Param('id') id: string, @Body() body: AdjustVendorAdvanceDto) {
    return this.payments.adjustAdvance(id, body.invoiceId, body.amount);
  }
}
