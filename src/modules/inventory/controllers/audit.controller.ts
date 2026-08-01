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
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { InventoryAuditService } from '../services/inventory-audit.service';
import {
  CreateAuditDto,
  CreateCorrectiveActionDto,
  PatchAuditLinesDto,
  UpdateCorrectiveActionDto,
} from '../dto/inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory/audits')
export class AuditController {
  constructor(private readonly audits: InventoryAuditService) {}

  @Get()
  @Roles('principal', 'accountant', 'coordinator')
  @Permissions('inventory:read')
  list(@Query('status') status?: string) {
    return this.audits.list(status ? { status: status as never } : undefined);
  }

  @Get('history')
  @Roles('principal', 'accountant', 'coordinator')
  @Permissions('inventory:read')
  history() {
    return this.audits.history();
  }

  @Get(':id')
  @Roles('principal', 'accountant', 'coordinator')
  @Permissions('inventory:read')
  get(@Param('id') id: string) {
    return this.audits.get(id);
  }

  @Post()
  @Roles('principal', 'accountant', 'coordinator')
  @Permissions('inventory:create')
  @Audit({ module: 'inventory', entity: 'inventory_audit', action: 'create' })
  create(@Body() dto: CreateAuditDto) {
    return this.audits.create(dto);
  }

  @Post(':id/start')
  @Roles('coordinator', 'accountant')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'inventory_audit', action: 'start' })
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.audits.start(id, user.id);
  }

  @Get(':id/checklist')
  @Roles('receptionist', 'coordinator', 'accountant')
  @Permissions('inventory:read')
  checklist(@Param('id') id: string) {
    return this.audits.checklist(id);
  }

  @Patch(':id/lines')
  @Roles('receptionist', 'coordinator', 'accountant')
  @Permissions('inventory:update')
  @Audit({
    module: 'inventory',
    entity: 'inventory_audit_line',
    action: 'patch',
  })
  patchLines(
    @Param('id') id: string,
    @Body() dto: PatchAuditLinesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.audits.patchLines(id, dto.lines, user.id);
  }

  @Post(':id/submit')
  @Roles('coordinator')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'inventory_audit', action: 'submit' })
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.audits.submit(id, user.id);
  }

  @Get(':id/discrepancies')
  @Roles('principal', 'accountant', 'coordinator')
  @Permissions('inventory:read')
  discrepancies(@Param('id') id: string) {
    return this.audits.discrepancies(id);
  }

  @Post(':id/create-adjustments')
  @Roles('accountant')
  @Permissions('inventory:create')
  @Audit({
    module: 'inventory',
    entity: 'inventory_audit',
    action: 'create_adjustments',
  })
  createAdjustments(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.audits.createAdjustments(id, user.id);
  }

  @Post(':id/sign-off')
  @Roles('principal')
  @Permissions('inventory:update')
  @Audit({ module: 'inventory', entity: 'inventory_audit', action: 'sign_off' })
  signOff(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.audits.signOff(id, user.id);
  }

  @Get(':id/corrective-actions')
  @Roles('coordinator', 'principal')
  @Permissions('inventory:read')
  listCorrectiveActions(@Param('id') id: string) {
    return this.audits.listCorrectiveActions(id);
  }

  @Post(':id/corrective-actions')
  @Roles('coordinator', 'principal')
  @Permissions('inventory:create')
  createCorrectiveAction(
    @Param('id') id: string,
    @Body() dto: CreateCorrectiveActionDto,
  ) {
    return this.audits.createCorrectiveAction(id, dto);
  }

  @Patch(':id/corrective-actions/:actionId')
  @Roles('coordinator', 'principal')
  @Permissions('inventory:update')
  updateCorrectiveAction(
    @Param('actionId') actionId: string,
    @Body() dto: UpdateCorrectiveActionDto,
  ) {
    return this.audits.updateCorrectiveAction(actionId, dto);
  }
}
