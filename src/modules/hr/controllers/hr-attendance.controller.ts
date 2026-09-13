import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HrAttendanceStatus } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { HrAttendanceService } from '../services/hr-attendance.service';
import { BulkAttendanceDto, UpdateAttendanceDto } from '../dto/attendance.dto';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/attendance')
export class HrAttendanceController {
  constructor(private readonly attendance: HrAttendanceService) {}

  @Get()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List HR attendance records' })
  list(
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('department') department?: string,
    @Query('status') status?: HrAttendanceStatus,
    @Query('employeeId') employeeId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.attendance.list({
      date,
      dateFrom,
      dateTo,
      department,
      status,
      employeeId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('monthly-summary')
  @Roles('hr_officer', 'principal', 'super_admin')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'Per-employee monthly attendance rollup' })
  monthlySummary(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('employeeId') employeeId?: string,
    @Query('department') department?: string,
  ) {
    return this.attendance.monthlySummary({
      year: Number(year),
      month: Number(month),
      employeeId,
      department,
    });
  }

  @Get('anomalies')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'Repeated lateness and unexplained absences' })
  anomalies(
    @Query('department') department?: string,
    @Query('lookbackDays') lookbackDays?: string,
  ) {
    return this.attendance.anomalies({
      department,
      lookbackDays: lookbackDays ? Number(lookbackDays) : undefined,
    });
  }

  @Post('bulk')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'hr_attendance', action: 'bulk_submit' })
  @ApiOperation({ summary: 'Batch submit attendance for a date' })
  bulkSubmit(@Body() dto: BulkAttendanceDto, @CurrentUser() user: AuthUser) {
    return this.attendance.bulkSubmit(dto.items, user.id);
  }

  @Patch(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'hr_attendance', action: 'update' })
  @ApiOperation({ summary: 'Correct a single attendance record' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendance.update(id, dto, user.id);
  }
}
