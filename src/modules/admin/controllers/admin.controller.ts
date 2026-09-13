import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { NumberingResetPeriod, PermissionAction, PermissionModule } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Roles,
  Permissions,
  CurrentUser,
  AuthUser,
  Audit,
} from '../../../shared/decorators';
import { UserService, RoleService } from '../services/user.service';
import {
  OrganizationService,
  NumberingService,
  AuditQueryService,
} from '../services/organization.service';

class CreateUserDto {
  @IsString() username!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(10) password!: string;
  @IsArray() roleNames!: string[];
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsString() guardianId?: string;
}

class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() roleNames?: string[];
  @IsOptional() employeeId?: string | null;
  @IsOptional() guardianId?: string | null;
}

class PermissionItemDto {
  @IsEnum(PermissionModule) module!: PermissionModule;
  @IsEnum(PermissionAction) action!: PermissionAction;
}

class ReplacePermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionItemDto)
  permissions!: PermissionItemDto[];
}

class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionItemDto)
  permissions?: PermissionItemDto[];
}

class CreateRoleDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionItemDto)
  permissions?: PermissionItemDto[];
}

class UpdateNumberingSchemeDto {
  @ApiProperty({ required: false, example: 'APPL-' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  prefix?: string;

  @ApiProperty({ required: false, example: 5, minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  padding?: number;

  @ApiProperty({
    required: false,
    enum: NumberingResetPeriod,
    example: NumberingResetPeriod.yearly,
    description: 'Allowed values: never | yearly | monthly',
  })
  @IsOptional()
  @IsEnum(NumberingResetPeriod)
  resetPeriod?: NumberingResetPeriod;
}

class AdminResetPasswordDto {
  @IsString() @MinLength(10) newPassword!: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UserService,
    private readonly roles: RoleService,
    private readonly org: OrganizationService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditQueryService,
  ) {}

  @Get('users')
  @Roles('super_admin')
  @Permissions('admin:read')
  @ApiOperation({ summary: 'List users' })
  listUsers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.users.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      role,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Post('users')
  @Roles('super_admin')
  @Permissions('admin:create')
  @Audit({ module: 'admin', entity: 'user', action: 'create' })
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(dto, user.id);
  }

  @Get('users/:id')
  @Roles('super_admin')
  @Permissions('admin:read')
  getUser(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Patch('users/:id')
  @Roles('super_admin')
  @Permissions('admin:update')
  @Audit({ module: 'admin', entity: 'user', action: 'update' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.update(id, dto, user.id);
  }

  @Post('users/:id/deactivate')
  @Roles('super_admin')
  @Permissions('admin:update')
  @Audit({ module: 'admin', entity: 'user', action: 'deactivate' })
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.deactivate(id, user.id);
  }

  @Post('users/:id/reset-password')
  @Roles('super_admin')
  @Permissions('admin:update')
  @Audit({ module: 'admin', entity: 'user', action: 'reset_password' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    await this.users.resetPassword(id, dto.newPassword);
    return { ok: true };
  }

  @Post('users/:id/unlock')
  @Roles('super_admin')
  @Permissions('admin:update')
  @Audit({ module: 'admin', entity: 'user', action: 'unlock' })
  async unlock(@Param('id') id: string) {
    await this.users.unlock(id);
    return { ok: true };
  }

  @Get('roles')
  @Roles('super_admin')
  @Permissions('admin:read')
  listRoles() {
    return this.roles.list();
  }

  @Post('roles')
  @Roles('super_admin')
  @Permissions('admin:create')
  @Audit({ module: 'admin', entity: 'role', action: 'create' })
  @ApiOperation({ summary: 'Create a custom role with optional permissions' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Get('roles/:id')
  @Roles('super_admin')
  @Permissions('admin:read')
  getRole(@Param('id') id: string) {
    return this.roles.get(id);
  }

  @Patch('roles/:id')
  @Roles('super_admin')
  @Permissions('admin:update')
  @Audit({ module: 'admin', entity: 'role', action: 'update' })
  @ApiOperation({ summary: 'Update role name, description, and/or permissions' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete('roles/:id')
  @Roles('super_admin')
  @Permissions('admin:delete')
  @Audit({ module: 'admin', entity: 'role', action: 'delete' })
  @ApiOperation({
    summary: 'Delete a role (fails if any users are still assigned)',
  })
  deleteRole(@Param('id') id: string) {
    return this.roles.remove(id);
  }

  @Get('roles/:id/permissions')
  @Roles('super_admin')
  @Permissions('admin:read')
  rolePermissions(@Param('id') id: string) {
    return this.roles.getPermissions(id);
  }

  @Put('roles/:id/permissions')
  @Roles('super_admin')
  @Permissions('admin:update')
  @Audit({ module: 'admin', entity: 'role', action: 'replace_permissions' })
  replacePermissions(
    @Param('id') id: string,
    @Body() dto: ReplacePermissionsDto,
  ) {
    return this.roles.replacePermissions(id, dto.permissions);
  }

  @Get('login-activity')
  @Roles('super_admin')
  @Permissions('admin:read')
  loginActivity(
    @Query('username') username?: string,
    @Query('outcome') outcome?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.loginActivity({
      username,
      outcome,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('organization')
  @ApiOperation({ summary: 'Public-safe organization profile' })
  getOrg() {
    return this.org.getPublic();
  }

  @Patch('organization')
  @Roles('super_admin')
  @Permissions('admin:update')
  @Audit({ module: 'admin', entity: 'organization', action: 'update' })
  updateOrg(@Body() body: Record<string, unknown>) {
    return this.org.update(body as never);
  }

  @Get('numbering-schemes')
  @Roles('super_admin')
  @Permissions('admin:read')
  listSchemes() {
    return this.numbering.list();
  }

  @Patch('numbering-schemes/:entityType')
  @Roles('super_admin')
  @Permissions('admin:update')
  @Audit({ module: 'admin', entity: 'numbering_scheme', action: 'update' })
  @ApiOperation({
    summary: 'Update a numbering scheme',
    description:
      'resetPeriod must be one of: never, yearly, monthly (not "year").',
  })
  updateScheme(
    @Param('entityType') entityType: string,
    @Body() body: UpdateNumberingSchemeDto,
  ) {
    return this.numbering.update(entityType, body);
  }

  @Get('audit-logs')
  @Roles('super_admin')
  @Permissions('admin:read')
  auditLogs(
    @Query('userId') userId?: string,
    @Query('module') module?: string,
    @Query('entityName') entityName?: string,
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.list({
      userId,
      module,
      entityName,
      action,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('audit-logs/:entityType/:entityId')
  @Roles('super_admin', 'principal')
  entityAudit(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.audit.forEntity(entityType, entityId);
  }
}
