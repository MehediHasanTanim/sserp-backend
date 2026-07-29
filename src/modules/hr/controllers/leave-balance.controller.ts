import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../../shared/decorators';
import { DomainException } from '../../../shared/errors/domain-exception';
import { LeaveBalanceService } from '../services/leave-balance.service';

const PRIVILEGED_ROLES = ['hr_officer', 'super_admin', 'principal'];

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/leave-balances')
export class LeaveBalanceController {
  constructor(private readonly balances: LeaveBalanceService) {}

  @Get(':employeeId')
  @ApiOperation({
    summary: 'Per-type leave balances for a year (owner or HR only)',
  })
  async get(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
  ) {
    const isPrivileged = user.roles.some((r) => PRIVILEGED_ROLES.includes(r));
    if (!isPrivileged) {
      const ownEmployeeId = await this.balances.resolveEmployeeIdForUser(
        user.id,
      );
      if (ownEmployeeId !== employeeId) {
        throw DomainException.forbidden(
          'You may only view your own leave balances',
        );
      }
    }
    return this.balances.listForEmployee(
      employeeId,
      year ? Number(year) : undefined,
    );
  }
}
