import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import {
  ShareholderService,
  ReserveService,
  ProfitAppropriationService,
  DisbursementService,
} from '../services/shareholder.service';

@Controller('finance/shareholders')
@Roles('principal', 'accountant', 'super_admin')
export class ShareholderController {
  constructor(private readonly shareholders: ShareholderService) {}

  @Get()
  list() {
    return this.shareholders.list();
  }

  @Get(':id')
  find(@Param('id') id: string) {
    return this.shareholders.findById(id);
  }

  @Post()
  @Roles('principal', 'super_admin')
  create(@Body() body: any) {
    return this.shareholders.create({
      ...body,
      joinedDate: new Date(body.joinedDate),
    });
  }

  @Put(':id')
  @Roles('principal', 'super_admin')
  update(@Param('id') id: string, @Body() body: any) {
    return this.shareholders.update(id, body);
  }

  @Post('transfers')
  @Roles('principal', 'super_admin')
  transfer(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.shareholders.transfer({
      ...body,
      transferDate: new Date(body.transferDate),
      approvedBy: user.id,
    });
  }
}

@Controller('finance/reserve-funds')
@Roles('principal', 'accountant', 'super_admin')
export class ReserveController {
  constructor(private readonly reserves: ReserveService) {}

  @Get()
  list() {
    return this.reserves.list();
  }

  @Post()
  create(@Body() body: any) {
    return this.reserves.create(body);
  }
}

@Controller('finance/appropriations')
@Roles('principal', 'accountant', 'super_admin')
export class AppropriationController {
  constructor(private readonly appropriations: ProfitAppropriationService) {}

  @Post()
  @Roles('accountant', 'super_admin')
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.appropriations.create({ ...body, createdBy: user.id });
  }

  @Post(':id/approve')
  @Roles('principal', 'super_admin')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.appropriations.approve(id, user.id);
  }

  @Post(':id/disburse')
  @Roles('principal', 'super_admin')
  disburse(@Param('id') id: string) {
    return this.appropriations.disburse(id);
  }
}

@Controller('finance')
@Roles('principal', 'accountant', 'super_admin')
export class DisbursementController {
  constructor(private readonly disbursements: DisbursementService) {}

  @Post('disbursements/:id/pay')
  @Roles('accountant', 'super_admin')
  pay(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.disbursements.pay(id, {
      ...body,
      paymentDate: new Date(body.paymentDate),
      receivedBy: user.id,
    });
  }

  @Get('dividend-register')
  register(@Query('fiscalYear') fiscalYear?: string) {
    return this.disbursements.dividendRegister(fiscalYear);
  }
}
