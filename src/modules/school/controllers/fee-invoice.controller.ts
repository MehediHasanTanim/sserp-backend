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
import { SchoolDocumentService } from '../services/school-document.service';
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
    private readonly documents: SchoolDocumentService,
  ) {}

  @Get('fee-invoices/generate-monthly/preview')
  @Roles('accountant', 'coordinator', 'super_admin')
  @Permissions('school:read')
  @ApiOperation({
    summary: 'Dry-run preview of monthly invoice generation for a period',
  })
  previewMonthly(@Query('period') period: string) {
    return this.invoices.previewMonthly(period);
  }

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
    @Query('period') period?: string,
  ) {
    return this.invoices.list({ studentId, status, period });
  }

  @Get('fee-invoices/defaulters')
  @Roles(
    'accountant',
    'coordinator',
    'receptionist',
    'principal',
    'super_admin',
  )
  @Permissions('school:read')
  @ApiOperation({
    summary: 'Overdue invoices with outstanding balance, aged into buckets',
  })
  listDefaulters(@Query('agingBucket') agingBucket?: string) {
    return this.invoices.listDefaulters(agingBucket);
  }

  @Get('fee-invoices/:id')
  @Roles(
    'accountant',
    'coordinator',
    'receptionist',
    'principal',
    'super_admin',
  )
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Get('fee-invoices/:id/document')
  @Roles(
    'accountant',
    'coordinator',
    'receptionist',
    'principal',
    'super_admin',
  )
  @Permissions('school:read')
  @ApiOperation({ summary: 'Presigned URL for the rendered invoice PDF' })
  document(@Param('id') id: string) {
    return this.documents.invoiceDocument(id);
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
