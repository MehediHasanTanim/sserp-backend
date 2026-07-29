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
import { HrDepartment, LeaveRequestStatus } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { DomainException } from '../../../shared/errors/domain-exception';
import { LeaveRequestService } from '../services/leave-request.service';
import { LeaveApprovalService } from '../services/leave-approval.service';
import {
  ApproveLeaveRequestDto,
  CreateLeaveRequestDto,
  RejectLeaveRequestDto,
} from '../dto/leave-request.dto';

const HR_VISIBILITY_ROLES = ['hr_officer', 'super_admin', 'principal'];
const APPROVER_ROLES = ['hr_officer', 'principal', 'super_admin'];

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/leave-requests')
export class LeaveRequestController {
  constructor(
    private readonly leaveRequests: LeaveRequestService,
    private readonly approvals: LeaveApprovalService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List leave requests; employees see only their own',
  })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: LeaveRequestStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const isPrivileged = user.roles.some((r) =>
      HR_VISIBILITY_ROLES.includes(r),
    );
    const restrictToEmployeeId = isPrivileged
      ? undefined
      : await this.leaveRequests.resolveEmployeeIdForUser(user.id);
    return this.leaveRequests.list(
      {
        employeeId,
        status,
        dateFrom,
        dateTo,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      restrictToEmployeeId,
    );
  }

  @Get('calendar')
  @Roles('hr_officer', 'principal', 'coordinator', 'super_admin')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'Team/department leave calendar' })
  calendar(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('department') department?: HrDepartment,
  ) {
    return this.leaveRequests.calendarView({ dateFrom, dateTo, department });
  }

  @Post()
  @Audit({ module: 'hr', entity: 'hr_leave_request', action: 'create' })
  @ApiOperation({ summary: 'Apply for leave' })
  async create(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const canActForOthers = user.permissions.includes('hr:create');
    const employeeId =
      dto.employeeId && canActForOthers
        ? dto.employeeId
        : await this.leaveRequests.resolveEmployeeIdForUser(user.id);
    if (!employeeId) {
      throw DomainException.validation(
        'No employee record is linked to this account',
      );
    }
    return this.leaveRequests.submit({ ...dto, employeeId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Leave request detail with approval trail' })
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const request = await this.leaveRequests.get(id);
    const isPrivileged = user.roles.some((r) =>
      HR_VISIBILITY_ROLES.includes(r),
    );
    const ownEmployeeId = isPrivileged
      ? undefined
      : await this.leaveRequests.resolveEmployeeIdForUser(user.id);
    this.leaveRequests.assertCanView(request, {
      employeeId: ownEmployeeId ?? undefined,
      isPrivileged,
    });
    return request;
  }

  @Patch(':id/approve')
  @Roles(...APPROVER_ROLES)
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'hr_leave_request', action: 'approve' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveLeaveRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvals.approve(id, user.id, user.roles, dto.comment);
  }

  @Patch(':id/reject')
  @Roles(...APPROVER_ROLES)
  @Permissions('hr:approve')
  @Audit({ module: 'hr', entity: 'hr_leave_request', action: 'reject' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectLeaveRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvals.reject(id, user.id, user.roles, dto.reason);
  }

  @Post(':id/cancel')
  @Audit({ module: 'hr', entity: 'hr_leave_request', action: 'cancel' })
  @ApiOperation({ summary: 'Cancel; restores balance if already approved' })
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const isPrivileged = user.roles.some((r) =>
      ['hr_officer', 'super_admin'].includes(r),
    );
    const employeeId = isPrivileged
      ? undefined
      : await this.leaveRequests.resolveEmployeeIdForUser(user.id);
    return this.leaveRequests.cancel(id, { employeeId, isPrivileged });
  }
}
