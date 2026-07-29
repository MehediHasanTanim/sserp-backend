import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { StudentLeaveService } from '../services/student-leave.service';

class RejectLeaveDto {
  @IsString() reviewNote!: string;
}

@ApiTags('school-leave')
@ApiBearerAuth()
@Controller('school/student-leave-requests')
export class StudentLeaveController {
  constructor(private readonly leaves: StudentLeaveService) {}

  @Get()
  @Roles('super_admin', 'coordinator', 'principal')
  @Permissions('school:read')
  list(
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.leaves.list({ status, studentId });
  }

  @Get(':id')
  @Roles('super_admin', 'coordinator', 'principal')
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.leaves.get(id);
  }

  @Post(':id/approve')
  @Roles('super_admin', 'coordinator', 'principal')
  @Permissions('school:approve')
  @Audit({ module: 'school', entity: 'student_leave', action: 'approve' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.leaves.approve(id, user.id);
  }

  @Post(':id/reject')
  @Roles('super_admin', 'coordinator', 'principal')
  @Permissions('school:approve')
  @Audit({ module: 'school', entity: 'student_leave', action: 'reject' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectLeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaves.reject(id, user.id, dto.reviewNote);
  }
}
