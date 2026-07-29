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
import { ShiftService } from '../services/shift.service';
import { CreateShiftDto, UpdateShiftDto } from '../dto/shift.dto';

@ApiTags('school')
@ApiBearerAuth()
@Controller('school/shifts')
export class ShiftController {
  constructor(private readonly shifts: ShiftService) {}

  @Get()
  @Permissions('school:read')
  list(@Query('activeOnly') activeOnly?: string) {
    return this.shifts.list(activeOnly === 'true');
  }

  @Post()
  @Roles('super_admin', 'coordinator')
  @Permissions('school:create')
  @Audit({ module: 'school', entity: 'shift', action: 'create' })
  create(@Body() dto: CreateShiftDto) {
    return this.shifts.create(dto);
  }

  @Get(':id')
  @Permissions('school:read')
  get(@Param('id') id: string) {
    return this.shifts.get(id);
  }

  @Patch(':id')
  @Roles('super_admin', 'coordinator')
  @Permissions('school:update')
  @Audit({ module: 'school', entity: 'shift', action: 'update' })
  update(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shifts.update(id, dto);
  }

  @Get(':id/schedule')
  @Roles('coordinator', 'teacher', 'super_admin', 'principal')
  @Permissions('school:read')
  @ApiOperation({ summary: 'Shift-wise daily schedule' })
  schedule(@Param('id') id: string) {
    return this.shifts.schedule(id);
  }
}
