import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApproverType, Prisma } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Roles } from '../../../shared/decorators';
import { ApprovalChainService } from '../services/approval-chain.service';
import { ReminderScheduleService } from '../services/reminder-schedule.service';

@ApiTags('admin-approval-chains')
@ApiBearerAuth()
@Controller('admin/approval-chains')
export class ApprovalChainController {
  constructor(private readonly chains: ApprovalChainService) {}

  @Get()
  @Roles('super_admin', 'principal')
  list() {
    return this.chains.listChains();
  }

  @Post()
  @Roles('super_admin', 'principal')
  create(
    @Body()
    body: {
      workflowCode: string;
      name: string;
      description?: string;
      steps: Array<{
        level: number;
        approverType: ApproverType;
        approverRole?: string;
        approverUserId?: string;
        condition?: Prisma.InputJsonValue;
        isMandatory?: boolean;
        escalationAfterHours?: number;
        escalateToRole?: string;
      }>;
    },
  ) {
    return this.chains.createChain(body);
  }

  @Patch(':id')
  @Roles('super_admin', 'principal')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; isActive?: boolean },
  ) {
    return this.chains.updateChain(id, body);
  }

  @Post('resolve/:workflowCode')
  @Roles('super_admin', 'principal')
  resolve(
    @Param('workflowCode') workflowCode: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.chains.resolveChain(workflowCode, payload);
  }
}

@ApiTags('admin-reminder-schedules')
@ApiBearerAuth()
@Controller('admin/reminder-schedules')
export class ReminderScheduleController {
  constructor(private readonly reminders: ReminderScheduleService) {}

  @Get()
  @Roles('super_admin')
  list() {
    return this.reminders.list();
  }

  @Post()
  @Roles('super_admin')
  create(
    @Body()
    body: {
      reminderCode: string;
      name: string;
      targetEvent: string;
      offsetDays: number;
      channels: string[];
    },
  ) {
    return this.reminders.create(body);
  }

  @Patch(':id')
  @Roles('super_admin')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.reminders.update(id, body as never);
  }
}
