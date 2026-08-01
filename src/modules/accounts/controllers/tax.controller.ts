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
import { Roles } from '../../../shared/decorators';
import { TaxService, CreateTaxDto } from '../services/tax.service';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts/taxes')
export class TaxController {
  constructor(private readonly taxes: TaxService) {}

  @Get()
  @Roles('accountant', 'super_admin')
  list() {
    return this.taxes.list();
  }

  @Get('liability')
  @Roles('accountant', 'principal', 'super_admin')
  liability() {
    return this.taxes.liabilitySummary();
  }

  @Get('filing-summary')
  @Roles('accountant')
  filingSummary(@Query('filingPeriod') filingPeriod: string) {
    return this.taxes.filingSummary(filingPeriod);
  }

  @Post('decompose')
  @Roles('accountant')
  decompose(@Body() body: { gross: number; ratePercent: number }) {
    return this.taxes.decomposeInclusive(body.gross, body.ratePercent);
  }

  @Get(':id')
  @Roles('accountant', 'super_admin')
  get(@Param('id') id: string) {
    return this.taxes.findById(id);
  }

  @Post()
  @Roles('accountant', 'super_admin')
  create(@Body() dto: CreateTaxDto) {
    return this.taxes.create({
      ...dto,
      effectiveFrom: new Date(dto.effectiveFrom as unknown as string),
      effectiveTo: dto.effectiveTo
        ? new Date(dto.effectiveTo as unknown as string)
        : undefined,
    });
  }

  @Patch(':id')
  @Roles('accountant', 'super_admin')
  update(@Param('id') id: string, @Body() dto: Partial<CreateTaxDto>) {
    return this.taxes.update(id, dto);
  }
}
