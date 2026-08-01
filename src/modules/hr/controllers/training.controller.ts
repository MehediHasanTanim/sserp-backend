import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { TrainingService } from '../services/training.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get('training-programs')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  list() {
    return this.training.listPrograms();
  }

  @Post('training-programs')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'training_program', action: 'create' })
  create(@Body() body: never) {
    return this.training.createProgram(body);
  }

  @Post('training-programs/:id/enroll')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  enroll(
    @Param('id') id: string,
    @Body() body: { employeeIds: string[] },
    @CurrentUser() user: AuthUser,
  ) {
    return this.training.enroll(id, body.employeeIds, user.id);
  }

  @Get('training-programs/:id/sessions')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  listSessions(@Param('id') id: string) {
    return this.training.listSessions(id);
  }

  @Post('training-programs/:id/sessions')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  session(@Param('id') id: string, @Body() body: never) {
    return this.training.createSession(id, body);
  }

  @Post('training-sessions/:id/attendance')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  attendance(
    @Param('id') id: string,
    @Body()
    body: {
      rows: { employeeId: string; status: 'present' | 'absent' | 'late' }[];
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.training.markAttendance(id, body.rows, user.id);
  }

  @Post('training-enrollments/:id/certificate')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  cert(@Param('id') id: string, @Body() body: { attachmentId: string }) {
    return this.training.uploadCertificate(id, body.attachmentId);
  }

  @Get('training-programs/:id/costs')
  @Roles('hr_officer', 'accountant', 'super_admin')
  @Permissions('hr:read')
  listCosts(@Param('id') id: string) {
    return this.training.listCosts(id);
  }

  @Post('training-programs/:id/costs')
  @Roles('hr_officer', 'accountant', 'super_admin')
  @Permissions('hr:create')
  costs(@Param('id') id: string, @Body() body: never) {
    return this.training.addCost(id, body);
  }

  @Get('employees/:id/training-history')
  @Roles('hr_officer', 'super_admin', 'principal')
  @Permissions('hr:read')
  history(@Param('id') id: string) {
    return this.training.employeeHistory(id);
  }
}
