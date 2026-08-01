import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StockIssueService } from '../services/stock-issue.service';
import {
  CreateIssueRequestDto,
  IssueFromLocationDto,
} from '../dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/issue-requests')
export class StockIssueController {
  constructor(
    private readonly issues: StockIssueService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Permissions('inventory:read')
  list() {
    return this.issues.list();
  }

  @Post()
  @Permissions('inventory:create')
  @Audit({
    module: 'inventory',
    entity: 'stock_issue_request',
    action: 'create',
  })
  async create(
    @Body() dto: CreateIssueRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { user: { id: user.id }, deletedAt: null },
    });
    return this.issues.create({
      requestedBy: user.id,
      department: employee?.department ?? 'admin',
      toLocationId: dto.toLocationId,
      purpose: dto.purpose,
      lines: dto.lines,
    });
  }

  @Post(':id/approve')
  @Roles('department_head', 'receptionist')
  @Permissions('inventory:update')
  @Audit({
    module: 'inventory',
    entity: 'stock_issue_request',
    action: 'approve',
  })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.issues.approve(id, user.id);
  }

  @Post(':id/issue')
  @Roles('receptionist')
  @Permissions('inventory:create')
  @Audit({
    module: 'inventory',
    entity: 'stock_issue_request',
    action: 'issue',
  })
  issue(
    @Param('id') id: string,
    @Body() dto: IssueFromLocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.issue(id, dto.fromLocationId, user.id);
  }
}
