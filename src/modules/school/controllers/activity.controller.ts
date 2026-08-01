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
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import {
  ActivityService,
  ActivityEnrollmentService,
  ActivityAttendanceService,
} from '../services/activity.service';

class CreateActivityDto {
  @IsString() activityTypeId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() activityDate!: string;
  @IsInt() @Min(1) capacity!: number;
  @IsOptional() @IsInt() feeAmount?: number;
  @IsString() optInDeadline!: string;
  @IsOptional() @IsString() venue?: string;
}

class RespondEnrollmentDto {
  @IsString() studentId!: string;
  @IsBoolean() accept!: boolean;
  @IsOptional() @IsString() declinedReason?: string;
}

class BulkActivityAttendanceDto {
  marks!: Array<{
    studentId: string;
    status: 'present' | 'absent' | 'withdrew_last_minute';
    remarks?: string;
  }>;
}

@ApiTags('school-activities')
@ApiBearerAuth()
@Controller('school')
export class ActivityController {
  constructor(
    private readonly activities: ActivityService,
    private readonly enrollments: ActivityEnrollmentService,
    private readonly attendance: ActivityAttendanceService,
  ) {}

  @Get('activity-types')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:read')
  listTypes() {
    return this.activities.listTypes();
  }

  @Post('activity-types')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'activity_type', action: 'create' })
  createType(@Body() body: { name: string; defaultFeeAmount?: number }) {
    return this.activities.createType(body);
  }

  @Get('activities')
  @Roles(
    'super_admin',
    'coordinator',
    'teacher',
    'receptionist',
    'accountant',
    'principal',
  )
  @Permissions('school:read')
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.activities.list({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post('activities')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'activity', action: 'create' })
  create(@Body() dto: CreateActivityDto) {
    return this.activities.create(dto);
  }

  @Get('activities/:id')
  @Roles('super_admin', 'coordinator', 'teacher', 'principal')
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.activities.get(id);
  }

  @Patch('activities/:id')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  update(@Param('id') id: string, @Body() body: Partial<CreateActivityDto>) {
    return this.activities.update(id, body);
  }

  @Post('activities/:id/cancel')
  @Roles('super_admin', 'coordinator', 'principal')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'activity', action: 'cancel' })
  cancel(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.activities.cancel(id, body.reason);
  }

  @Get('activities/:id/enrollments')
  @Roles('super_admin', 'coordinator', 'accountant')
  @Permissions('school:read')
  listEnrollments(@Param('id') id: string) {
    return this.enrollments.listEnrollments(id);
  }

  @Post('activities/:id/enrollments')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @ApiOperation({ summary: 'Manual consent on behalf of guardian' })
  enroll(
    @Param('id') id: string,
    @Body() dto: RespondEnrollmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.enrollments.respond({
      activityId: id,
      studentId: dto.studentId,
      accept: dto.accept,
      channel: 'coordinator_manual',
      actorUserId: user.id,
      declinedReason: dto.declinedReason,
    });
  }

  @Post('activities/:id/enrollments/:studentId/withdraw')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  withdraw(@Param('id') id: string, @Param('studentId') studentId: string) {
    return this.enrollments.withdraw(id, studentId);
  }

  @Get('activities/:id/attendance')
  @Roles('super_admin', 'coordinator', 'teacher')
  @Permissions('school:read')
  getAttendance(@Param('id') id: string) {
    return this.attendance.list(id);
  }

  @Post('activities/:id/attendance')
  @Roles('super_admin', 'coordinator', 'teacher')
  @Permissions('school:create')
  markAttendance(
    @Param('id') id: string,
    @Body() dto: BulkActivityAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendance.bulkMark(id, dto.marks, user.id);
  }

  @Patch('activities/:id/summary')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  summary(@Param('id') id: string, @Body() body: { postSummary: string }) {
    return this.activities.setSummary(id, body.postSummary);
  }
}
