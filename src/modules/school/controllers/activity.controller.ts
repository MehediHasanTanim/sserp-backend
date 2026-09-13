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
import { IsBoolean, IsOptional, IsString } from 'class-validator';
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
  ActivityMediaService,
} from '../services/activity.service';
import {
  AddActivityMediaDto,
  CreateActivityDto,
  InviteActivityDto,
  MarkActivityAttendanceDto,
} from '../dto/activity.dto';

class RespondEnrollmentDto {
  @IsString() studentId!: string;
  @IsBoolean() accept!: boolean;
  @IsOptional() @IsString() declinedReason?: string;
}

@ApiTags('school-activities')
@ApiBearerAuth()
@Controller('school')
export class ActivityController {
  constructor(
    private readonly activities: ActivityService,
    private readonly enrollments: ActivityEnrollmentService,
    private readonly attendance: ActivityAttendanceService,
    private readonly media: ActivityMediaService,
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

  @Patch('activity-types/:id')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'activity_type', action: 'update' })
  updateType(
    @Param('id') id: string,
    @Body()
    body: Partial<{ name: string; defaultFeeAmount: number; isActive: boolean }>,
  ) {
    return this.activities.updateType(id, body);
  }

  @Get('activities/calendar')
  @Roles(
    'super_admin',
    'coordinator',
    'teacher',
    'receptionist',
    'accountant',
    'principal',
  )
  @Permissions('school:read')
  @ApiOperation({ summary: 'Calendar feed of outdoor activities' })
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.activities.calendar({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
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

  @Post('activities/:id/invite')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'activity_enrollment', action: 'invite' })
  @ApiOperation({ summary: 'Send opt-in invitations to students' })
  invite(
    @Param('id') id: string,
    @Body() dto: InviteActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.enrollments.invite(id, dto.studentIds, user.id);
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
    @Body() dto: MarkActivityAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attendance.bulkMark(id, dto.items, user.id);
  }

  @Get('activities/:id/media')
  @Roles('super_admin', 'coordinator', 'teacher', 'principal')
  @Permissions('school:read')
  @ApiOperation({ summary: 'List activity media' })
  listMedia(@Param('id') id: string) {
    return this.media.list(id);
  }

  @Post('activities/:id/media')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'activity_media', action: 'create' })
  @ApiOperation({ summary: 'Attach uploaded media to an activity' })
  addMedia(@Param('id') id: string, @Body() dto: AddActivityMediaDto) {
    return this.media.add(id, dto);
  }

  @Delete('activities/:id/media/:mediaId')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'activity_media', action: 'delete' })
  @ApiOperation({ summary: 'Remove activity media' })
  removeMedia(@Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.media.remove(id, mediaId);
  }

  @Get('activities/:id/summary')
  @Roles('super_admin', 'coordinator', 'teacher', 'principal')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Get post-activity summary notes' })
  summary(@Param('id') id: string) {
    return this.activities.getSummary(id);
  }

  @Patch('activities/:id/summary')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  summaryPatch(
    @Param('id') id: string,
    @Body() body: { notes?: string; postSummary?: string },
  ) {
    const notes = body.notes ?? body.postSummary ?? '';
    return this.activities.setSummary(id, notes);
  }
}
