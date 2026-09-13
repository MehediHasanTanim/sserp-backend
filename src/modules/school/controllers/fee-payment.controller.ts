import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { FeePaymentService } from '../services/fee-payment.service';
import {
  RecordPaymentDto,
  ReversePaymentDto,
  WaiveInvoiceDto,
} from '../dto/fee-invoice.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school')
export class FeePaymentController {
  constructor(private readonly payments: FeePaymentService) {}

  @Post('fee-invoices/:id/payments')
  @Roles('accountant', 'receptionist', 'coordinator', 'super_admin')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'fee_payment', action: 'record' })
  pay(
    @Param('id') invoiceId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.pay(invoiceId, dto, user.id);
  }

  @Post('fee-payments/:id/reverse')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'fee_payment', action: 'reverse' })
  reverse(
    @Param('id') paymentId: string,
    @Body() dto: ReversePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.reverse(paymentId, dto, user.id, user.roles);
  }

  @Post('fee-invoices/:id/waive')
  @Roles('principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'fee_invoice', action: 'waive' })
  waive(
    @Param('id') invoiceId: string,
    @Body() dto: WaiveInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.waive(invoiceId, dto, user.id, user.roles);
  }

  @Get('fee-invoices/:id/receipt/:paymentId')
  @Roles(
    'accountant',
    'coordinator',
    'receptionist',
    'principal',
    'super_admin',
    'parent',
  )
  @Permissions('school:read')
  receipt(@Param('paymentId') paymentId: string) {
    return this.payments.receipt(paymentId);
  }
}
