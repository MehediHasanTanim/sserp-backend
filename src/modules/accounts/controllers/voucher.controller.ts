import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { VoucherService, CreateVoucherDto } from '../services/voucher.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/vouchers')
export class VoucherController {
  constructor(private readonly vouchers: VoucherService) {}

  @Get()
  @Roles('accountant', 'receptionist', 'super_admin')
  list() {
    return this.vouchers.list();
  }

  @Get(':id')
  @Roles('accountant', 'receptionist', 'super_admin')
  get(@Param('id') id: string) {
    return this.vouchers.findById(id);
  }

  @Post()
  @Roles('accountant', 'receptionist')
  create(@Body() dto: CreateVoucherDto, @CurrentUser() user: AuthUser) {
    return this.vouchers.createDraft(
      { ...dto, voucherDate: new Date(dto.voucherDate as unknown as string) },
      user.id,
    );
  }

  @Post(':id/post')
  @Roles('accountant')
  post(
    @Param('id') id: string,
    @Body('costCenter') costCenter: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vouchers.post(id, user.id, costCenter);
  }

  @Post(':id/cancel')
  @Roles('accountant', 'principal', 'super_admin')
  cancel(@Param('id') id: string) {
    return this.vouchers.cancel(id);
  }
}
