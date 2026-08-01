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
import { GrnStatus } from '@prisma/client';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { GrnService } from '../services/grn.service';
import { CreateGrnDto, QualityCheckGrnDto, UpdateGrnDto } from '../dto/grn.dto';

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('procurement/grns')
export class GrnController {
  constructor(private readonly grns: GrnService) {}

  @Get()
  @Roles('receptionist', 'accountant', 'super_admin')
  @Permissions('procurement:read')
  list(@Query('status') status?: GrnStatus, @Query('poId') poId?: string) {
    return this.grns.list({ status, poId });
  }

  @Post()
  @Roles('receptionist', 'accountant', 'super_admin')
  @Permissions('procurement:create')
  @Audit({ module: 'procurement', entity: 'grn', action: 'create' })
  create(@Body() body: CreateGrnDto, @CurrentUser() user: AuthUser) {
    return this.grns.create(body, user.id);
  }

  @Get(':id')
  @Roles('receptionist', 'accountant', 'principal', 'super_admin')
  @Permissions('procurement:read')
  get(@Param('id') id: string) {
    return this.grns.findById(id);
  }

  @Patch(':id')
  @Roles('receptionist', 'super_admin')
  @Permissions('procurement:update')
  update(@Param('id') id: string, @Body() body: UpdateGrnDto) {
    return this.grns.updateDraft(id, body);
  }

  @Post(':id/quality-check')
  @Roles('receptionist', 'coordinator', 'super_admin')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Record accepted/rejected quantities' })
  qualityCheck(
    @Param('id') id: string,
    @Body() body: QualityCheckGrnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.grns.qualityCheck(id, user.id, body.lines);
  }

  @Post(':id/post')
  @Roles('receptionist', 'accountant', 'super_admin')
  @Permissions('procurement:update')
  @Audit({ module: 'procurement', entity: 'grn', action: 'post' })
  post(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.grns.post(id, user.id);
  }
}
