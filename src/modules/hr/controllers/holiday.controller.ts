import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HolidayType } from '@prisma/client';
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { HolidayService } from '../services/holiday.service';
import {
  BulkImportHolidayDto,
  CreateHolidayDto,
  UpdateHolidayDto,
} from '../dto/holiday.dto';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/holidays')
export class HolidayController {
  constructor(private readonly holidays: HolidayService) {}

  @Get()
  @ApiOperation({
    summary: 'List holidays, filterable by year/type/department',
  })
  list(
    @Query('year') year?: string,
    @Query('type') type?: HolidayType,
    @Query('department') department?: string,
  ) {
    return this.holidays.list({
      year: year ? Number(year) : undefined,
      type,
      department,
    });
  }

  @Post()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'holiday', action: 'create' })
  create(@Body() dto: CreateHolidayDto) {
    return this.holidays.create(dto);
  }

  @Post('bulk-import')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'holiday', action: 'bulk_import' })
  @ApiOperation({ summary: 'Bulk create holidays from a year calendar' })
  bulkImport(@Body() dto: BulkImportHolidayDto) {
    return this.holidays.bulkImport(dto.holidays);
  }

  @Patch(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'holiday', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateHolidayDto) {
    return this.holidays.update(id, dto);
  }

  @Delete(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:delete')
  @Audit({ module: 'hr', entity: 'holiday', action: 'delete' })
  remove(@Param('id') id: string) {
    return this.holidays.remove(id);
  }
}
