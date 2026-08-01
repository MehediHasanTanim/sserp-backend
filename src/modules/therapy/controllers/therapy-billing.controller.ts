import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { TherapyBillingService } from '../services/therapy-billing.service';
import { WaitingListService } from '../services/waiting-list.service';

@Controller('therapy/billing')
@Roles('admin', 'therapy_coordinator', 'finance')
export class TherapyBillingController {
  constructor(
    private readonly billingService: TherapyBillingService,
    private readonly waitingListService: WaitingListService,
  ) {}

  @Post('sessions/:sessionId/invoice')
  generateSessionInvoice(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billingService.generatePerSessionInvoice(sessionId, user.id);
  }

  @Post('patients/:patientId/monthly-invoice')
  generateMonthlyInvoice(
    @Param('patientId') patientId: string,
    @Body() body: { month: number; year: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.billingService.generateMonthlyConsolidated(
      patientId,
      body.month,
      body.year,
      user.id,
    );
  }

  @Post('invoices/:invoiceId/payments')
  recordPayment(
    @Param('invoiceId') invoiceId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billingService.recordPayment(
      { invoiceId, ...body, receivedBy: user.id },
      user.id,
    );
  }

  @Post('payments/:paymentId/reverse')
  reversePayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billingService.reversePayment(paymentId, user.id);
  }

  @Post('discounts')
  applyDiscount(@Body() body: any) {
    return this.billingService.applyDiscount(body);
  }
}

@Controller('therapy/waiting-list')
@Roles('admin', 'therapy_coordinator')
export class WaitingListController {
  constructor(private readonly waitingListService: WaitingListService) {}

  @Post()
  add(@Body() body: any) {
    return this.waitingListService.add(body);
  }

  @Get()
  list(@Query('therapyType') therapyType?: any) {
    return this.waitingListService.listActive(therapyType);
  }

  @Post(':id/offer')
  sendOffer(@Param('id') id: string) {
    return this.waitingListService.sendOffer(id);
  }

  @Post(':id/convert')
  convert(@Param('id') id: string) {
    return this.waitingListService.convertToScheduled(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.waitingListService.cancel(id);
  }
}
