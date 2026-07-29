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
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { SchoolAttendanceService } from '../services/school-attendance.service';
import {
  BulkStudentAttendanceDto,
  CreateAttendanceAmendmentDto,
  DecideAttendanceAmendmentDto,
  UpdateAttendanceSettingsDto,
  UpdateStudentAttendanceDto,
} from '../dto/attendance.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school')
export class StudentAttendanceController {
  constructor(private readonly attendance: SchoolAttendanceService) {}

  @Get('attendance-settings')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:read')
  getSettings(@Query('academicYearId') academicYearId: string) {
    return this.attendance.getAttendanceSettings(academicYearId);
  }

  @Patch('attendance-settings')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'attendance_settings', action: 'update' })
  updateSettings(
    @Query('academicYearId') academicYearId: string,
    @Body() dto: UpdateAttendanceSettingsDto,
  ) {
    return this.attendance.upsertAttendanceSettings(academicYearId, dto);
  }

  @Get('attendance')
  @Roles('coordinator', 'teacher', 'super_admin')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Roster for a date + shift with existing marks' })
  roster(@Query('shiftId') shiftId: string, @Query('date') date: string) {
    return this.attendance.roster(shiftId, date);
  }

  @Post('attendance/bulk')
  @Roles('coordinator', 'teacher')
  @Permissions('school:update')
  @Audit({
    module: 'school',
    entity: 'student_attendance',
    action: 'bulk_submit',
  })
  bulkSubmit(
    @Body() dto: BulkStudentAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendance.bulkSubmit(dto, {
      userId: user.id,
      roles: user.roles,
    });
  }

  @Patch('attendance/:id')
  @Roles('coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'student_attendance', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateStudentAttendanceDto) {
    return this.attendance.update(id, dto);
  }

  @Post('attendance/:id/amendment')
  @Roles('teacher', 'coordinator')
  @Permissions('school:update')
  @Audit({
    module: 'school',
    entity: 'attendance_amendment',
    action: 'request',
  })
  requestAmendment(
    @Param('id') id: string,
    @Body() dto: CreateAttendanceAmendmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendance.requestAmendment(id, dto, user.id);
  }

  @Patch('attendance/amendments/:id/decide')
  @Roles('coordinator', 'principal')
  @Permissions('school:approve')
  @Audit({ module: 'school', entity: 'attendance_amendment', action: 'decide' })
  decideAmendment(
    @Param('id') id: string,
    @Body() dto: DecideAttendanceAmendmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendance.decideAmendment(id, dto.approve, user.id);
  }

  @Get('attendance/monthly-summary')
  @Roles('coordinator', 'principal', 'teacher')
  @Permissions('school:read')
  monthlySummary(
    @Query('studentId') studentId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.attendance.monthlySummary(
      studentId,
      Number(year),
      Number(month),
    );
  }

  @Get('attendance/working-days')
  @Permissions('school:read')
  workingDays(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.attendance.workingDaysBetween(dateFrom, dateTo);
  }
}
