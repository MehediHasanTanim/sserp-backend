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
import { Roles, Permissions, Audit } from '../../../shared/decorators';
import { LeaveTypeService } from '../services/leave-type.service';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from '../dto/leave-type.dto';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr/leave-types')
export class LeaveTypeController {
  constructor(private readonly leaveTypes: LeaveTypeService) {}

  @Get()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List leave types' })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.leaveTypes.list(includeInactive === 'true');
  }

  @Get(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:read')
  get(@Param('id') id: string) {
    return this.leaveTypes.get(id);
  }

  @Post()
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:create')
  @Audit({ module: 'hr', entity: 'leave_type', action: 'create' })
  create(@Body() dto: CreateLeaveTypeDto) {
    return this.leaveTypes.create(dto);
  }

  @Patch(':id')
  @Roles('hr_officer', 'super_admin')
  @Permissions('hr:update')
  @Audit({ module: 'hr', entity: 'leave_type', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leaveTypes.update(id, dto);
  }
}
