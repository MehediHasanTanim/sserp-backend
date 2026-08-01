import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser, AuthUser, Roles } from '../../../shared/decorators';
import { GroupService } from '../services/group.service';

@Controller('therapy/groups')
@Roles('admin', 'therapy_coordinator', 'therapist')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @Roles('admin', 'therapy_coordinator')
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.groupService.create(body, user.id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.groupService.findById(id);
  }

  @Post(':id/enroll')
  @Roles('admin', 'therapy_coordinator')
  enroll(
    @Param('id') groupId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.groupService.enroll({ groupId, ...body }, user.id);
  }

  @Put(':id/members/:patientId/exit')
  @Roles('admin', 'therapy_coordinator')
  exitMember(
    @Param('id') groupId: string,
    @Param('patientId') patientId: string,
    @Body() body: { exitReason: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.groupService.exitMember(
      groupId,
      patientId,
      body.exitReason,
      user.id,
    );
  }

  @Post('sessions/:sessionId/attendance')
  markAttendance(
    @Param('sessionId') sessionId: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.groupService.markGroupAttendance(
      { sessionId, attendances: body.attendances },
      user.id,
    );
  }

  @Put(':id/close')
  @Roles('admin', 'therapy_coordinator')
  close(
    @Param('id') groupId: string,
    @Body() body: { closeReason: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.groupService.close(groupId, body.closeReason, user.id);
  }
}
