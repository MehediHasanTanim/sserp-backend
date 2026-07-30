import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChequeStatus } from '@prisma/client';
import { Roles } from '../../../shared/decorators';
import { ChequeService, CreateChequeDto } from '../services/cheque.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/cheques')
export class ChequeController {
  constructor(private readonly cheques: ChequeService) {}

  @Get()
  @Roles('accountant')
  list() {
    return this.cheques.list();
  }

  @Get(':id')
  @Roles('accountant')
  get(@Param('id') id: string) {
    return this.cheques.findById(id);
  }

  @Post()
  @Roles('accountant')
  create(@Body() dto: CreateChequeDto) {
    return this.cheques.create({
      ...dto,
      chequeDate: new Date(dto.chequeDate as unknown as string),
    });
  }

  @Patch(':id/status')
  @Roles('accountant')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: ChequeStatus; reason?: string; clearedDate?: string },
  ) {
    return this.cheques.transitionStatus(id, body.status, {
      reason: body.reason,
      clearedDate: body.clearedDate ? new Date(body.clearedDate) : undefined,
    });
  }
}
