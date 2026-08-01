import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { FeeInvoiceService } from '../services/fee-invoice.service';
import { FeeReminderService } from '../services/fee-reminder.service';
import {
  CancelInvoiceDto,
  GenerateMonthlyInvoicesDto,
} from '../dto/fee-invoice.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school')
export class FeeInvoiceController {
  constructor(
    private readonly invoices: FeeInvoiceService,
    private readonly reminders: FeeReminderService,
  ) {}

  @Post('fee-invoices/generate-monthly')
  @Roles('accountant', 'super_admin')
  @Permissions('school:create')
  @Audit({
    module: 'school',
    entity: 'fee_invoice',
    action: 'generate_monthly',
  })
  @ApiOperation({ summary: 'Idempotent bulk generation for a month' })
  generateMonthly(
    @Body() dto: GenerateMonthlyInvoicesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.generateMonthly(dto, user.id);
  }

  @Get('fee-invoices')
  @Roles(
    'accountant',
    'coordinator',
    'receptionist',
    'principal',
    'super_admin',
  )
  @Permissions('school:read')
  list(
    @Query('studentId') studentId?: string,
    @Query('status') status?: string,
  ) {
    return this.invoices.list({ studentId, status });
  }

  @Get('fee-invoices/:id')
  @Roles(
    'accountant',
    'coordinator',
    'receptionist',
    'principal',
    'super_admin',
    'parent',
  )
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Post('fee-invoices/:id/cancel')
  @Roles('accountant', 'principal', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'fee_invoice', action: 'cancel' })
  cancel(@Param('id') id: string, @Body() dto: CancelInvoiceDto) {
    return this.invoices.cancel(id, dto);
  }

  @Get('students/:id/fee-summary')
  @Roles(
    'accountant',
    'coordinator',
    'receptionist',
    'principal',
    'super_admin',
    'parent',
  )
  @Permissions('school:read')
  feeSummary(@Param('id') studentId: string) {
    return this.invoices.feeSummary(studentId);
  }

  @Post('fee-invoices/send-reminders')
  @Roles('accountant', 'super_admin')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'fee_invoice', action: 'send_reminders' })
  sendReminders() {
    return this.reminders.sendReminders();
  }
}
