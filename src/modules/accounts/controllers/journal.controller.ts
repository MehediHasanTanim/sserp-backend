import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JournalEntryStatus } from '@prisma/client';
import { Roles, CurrentUser, AuthUser } from '../../../shared/decorators';
import { JournalService, JournalDraftDto } from '../services/journal.service';
import {
  RecurringJournalService,
  RecurringTemplateDto,
} from '../services/recurring-journal.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/journal-entries')
export class JournalController {
  constructor(private readonly journals: JournalService) {}

  @Get()
  @Roles('accountant', 'principal', 'super_admin')
  list(
    @Query('status') status?: JournalEntryStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journals.list({
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get(':id')
  @Roles('accountant', 'principal', 'super_admin')
  get(@Param('id') id: string) {
    return this.journals.findById(id);
  }

  @Post()
  @Roles('accountant')
  create(@Body() dto: JournalDraftDto, @CurrentUser() user: AuthUser) {
    return this.journals.createDraft(
      { ...dto, entryDate: new Date(dto.entryDate as unknown as string) },
      user.id,
    );
  }

  @Patch(':id')
  @Roles('accountant')
  update(@Param('id') id: string, @Body() dto: Partial<JournalDraftDto>) {
    const mapped = dto.entryDate
      ? { ...dto, entryDate: new Date(dto.entryDate as unknown as string) }
      : dto;
    return this.journals.updateDraft(id, mapped);
  }

  @Post(':id/submit')
  @Roles('accountant')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.journals.submit(id, user.id);
  }

  @Patch(':id/approve')
  @Roles('principal', 'super_admin')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.journals.approve(id, user.id);
  }

  @Post(':id/reject')
  @Roles('principal', 'super_admin')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.journals.reject(id, reason, user.id);
  }

  @Post(':id/reverse')
  @Roles('principal', 'super_admin')
  reverse(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.journals.reverse(id, reason, user.id);
  }
}

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/recurring-journals')
export class RecurringJournalController {
  constructor(private readonly recurring: RecurringJournalService) {}

  @Get()
  @Roles('accountant')
  list() {
    return this.recurring.list();
  }

  @Post()
  @Roles('accountant')
  create(@Body() dto: RecurringTemplateDto, @CurrentUser() user: AuthUser) {
    return this.recurring.create(
      { ...dto, nextRunDate: new Date(dto.nextRunDate as unknown as string) },
      user.id,
    );
  }

  @Patch(':id')
  @Roles('accountant')
  update(@Param('id') id: string, @Body() dto: Partial<RecurringTemplateDto>) {
    return this.recurring.update(id, dto);
  }
}
