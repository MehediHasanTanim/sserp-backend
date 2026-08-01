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
import { PurchaseRequestStatus } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { PurchaseRequestService } from '../services/purchase-request.service';
import { PrApprovalService } from '../services/pr-approval.service';
import {
  ApprovePurchaseRequestDto,
  CreatePurchaseRequestDto,
  DeptReviewDto,
  RejectPurchaseRequestDto,
  UpdatePurchaseRequestDto,
} from '../dto/purchase-request.dto';

const PR_VIEW_ROLES = ['principal', 'coordinator', 'accountant', 'super_admin'];

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('procurement/purchase-requests')
export class PurchaseRequestController {
  constructor(
    private readonly prs: PurchaseRequestService,
    private readonly approvals: PrApprovalService,
  ) {}

  @Get()
  @Roles(...PR_VIEW_ROLES, 'teacher', 'therapist', 'hr_officer', 'receptionist')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'List purchase requests' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: PurchaseRequestStatus,
    @Query('department') department?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const isPrivileged = user.roles.some((r) => PR_VIEW_ROLES.includes(r));
    return this.prs.list(
      {
        status,
        department,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      isPrivileged ? undefined : user.id,
    );
  }

  @Post()
  @Permissions('procurement:create')
  @Audit({
    module: 'procurement',
    entity: 'purchase_request',
    action: 'create',
  })
  create(
    @Body() body: CreatePurchaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prs.create(body, user.id);
  }

  @Get(':id')
  @Roles(...PR_VIEW_ROLES, 'teacher', 'therapist', 'hr_officer', 'receptionist')
  @Permissions('procurement:read')
  get(@Param('id') id: string) {
    return this.prs.findById(id);
  }

  @Patch(':id')
  @Permissions('procurement:update')
  update(
    @Param('id') id: string,
    @Body() body: UpdatePurchaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prs.updateDraft(id, user.id, body);
  }

  @Post(':id/submit')
  @Permissions('procurement:update')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.prs.submit(id, user.id);
  }

  @Post(':id/dept-review')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('procurement:update')
  deptReview(
    @Param('id') id: string,
    @Body() body: DeptReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvals.deptReview(id, user.id, user.roles, {
      approved: body.approved ?? true,
      comment: body.comment,
      reason: body.reason,
    });
  }

  @Post(':id/approve')
  @Roles('principal', 'super_admin')
  @Permissions('procurement:update')
  @Audit({
    module: 'procurement',
    entity: 'purchase_request',
    action: 'approve',
  })
  approve(
    @Param('id') id: string,
    @Body() body: ApprovePurchaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvals.approve(id, user.id, user.roles, body);
  }

  @Post(':id/reject')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('procurement:update')
  reject(
    @Param('id') id: string,
    @Body() body: RejectPurchaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.approvals.reject(id, user.id, user.roles, body.reason);
  }

  @Post(':id/cancel')
  @Permissions('procurement:update')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.prs.cancel(id, user.id, user.roles);
  }

  @Get(':id/budget-check')
  @Roles('coordinator', 'principal', 'super_admin')
  @Permissions('procurement:read')
  budgetCheck(@Param('id') id: string) {
    return this.approvals.dryRunBudgetCheck(id);
  }
}
