import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, PermissionAction, PermissionModule } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { PasswordService } from '../../auth/services/password.service';
import { TokenService } from '../../auth/services/token.service';
import { EventNames } from '../../../shared/events/event-names';
import { LockoutService } from '../../auth/services/lockout.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: {
    page?: number;
    pageSize?: number;
    role?: string;
    isActive?: boolean;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.role) {
      where.roles = { some: { role: { name: query.role } } };
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } } },
      }),
    ]);
    return {
      items: items.map((u) => this.toDto(u)),
      page,
      pageSize,
      total,
    };
  }

  async get(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw DomainException.notFound('User not found');
    return this.toDto(user);
  }

  async create(
    input: {
      username: string;
      email: string;
      password: string;
      roleNames: string[];
      employeeId?: string;
      guardianId?: string;
    },
    actorId: string,
  ) {
    if (!input.roleNames?.length) {
      throw DomainException.validation('A user must hold at least one role');
    }
    const roles = await this.prisma.role.findMany({
      where: { name: { in: input.roleNames } },
    });
    if (roles.length !== input.roleNames.length) {
      throw DomainException.validation('One or more roles are invalid');
    }
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash,
        employeeId: input.employeeId,
        guardianId: input.guardianId,
        mustChangePassword: true,
        createdBy: actorId,
        roles: {
          create: roles.map((r) => ({ roleId: r.id })),
        },
      },
      include: { roles: { include: { role: true } } },
    });
    return this.toDto(user);
  }

  async update(
    id: string,
    input: {
      email?: string;
      isActive?: boolean;
      roleNames?: string[];
      employeeId?: string | null;
      guardianId?: string | null;
    },
    actorId: string,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw DomainException.notFound('User not found');

    if (input.roleNames) {
      if (!input.roleNames.length) {
        throw DomainException.validation('A user must hold at least one role');
      }
      const roles = await this.prisma.role.findMany({
        where: { name: { in: input.roleNames } },
      });
      if (roles.length !== input.roleNames.length) {
        throw DomainException.validation('One or more roles are invalid');
      }
      await this.prisma.$transaction([
        this.prisma.userRole.deleteMany({ where: { userId: id } }),
        this.prisma.userRole.createMany({
          data: roles.map((r) => ({ userId: id, roleId: r.id })),
        }),
      ]);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: input.email,
        isActive: input.isActive,
        employeeId:
          input.employeeId === undefined ? undefined : input.employeeId,
        guardianId:
          input.guardianId === undefined ? undefined : input.guardianId,
        updatedBy: actorId,
      },
      include: { roles: { include: { role: true } } },
    });
    return this.toDto(user);
  }

  async deactivate(id: string, byUserId: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false, updatedBy: byUserId },
      include: { roles: { include: { role: true } } },
    });
    await this.tokens.revokeAllForUser(id);
    await this.events.emitAsync(EventNames.USER_DEACTIVATED, {
      userId: id,
      byUserId,
    });
    return this.toDto(user);
  }

  async resetPassword(id: string, newPassword: string) {
    const hash = await this.passwords.hash(newPassword);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: hash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    await this.tokens.revokeAllForUser(id);
  }

  async unlock(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    await this.prisma.user.update({
      where: { id },
      data: { lockedUntil: null, failedLoginAttempts: 0 },
    });
    await this.lockout.unlock(user.username);
  }

  private toDto(user: {
    id: string;
    username: string;
    email: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    mustChangePassword: boolean;
    employeeId: string | null;
    guardianId: string | null;
    roles: { role: { name: string } }[];
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
      employeeId: user.employeeId,
      guardianId: user.guardianId,
      roles: user.roles.map((r) => r.role.name),
    };
  }
}

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      include: {
        _count: { select: { permissions: true, users: true } },
      },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionCount: r._count.permissions,
      userCount: r._count.users,
    }));
  }

  async get(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });
    if (!role) throw DomainException.notFound('Role not found');
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissions: role.permissions.map((p) => ({
        module: p.module,
        action: p.action,
      })),
    };
  }

  async getPermissions(id: string) {
    const role = await this.get(id);
    return {
      id: role.id,
      name: role.name,
      permissions: role.permissions.map((p) => `${p.module}:${p.action}`),
    };
  }

  private normalizeRoleName(name: string): string {
    const normalized = name.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(normalized)) {
      throw DomainException.validation(
        'Role name must start with a letter and contain only lowercase letters, digits, and underscores',
      );
    }
    return normalized;
  }

  async create(input: {
    name: string;
    description?: string;
    permissions?: Array<{
      module: PermissionModule;
      action: PermissionAction;
    }>;
  }) {
    const name = this.normalizeRoleName(input.name);
    const clash = await this.prisma.role.findUnique({ where: { name } });
    if (clash) {
      throw DomainException.conflict(`Role name "${name}" is already in use`);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name,
          description: input.description?.trim() || null,
          isSystem: false,
        },
      });
      if (input.permissions?.length) {
        await tx.rolePermission.createMany({
          data: input.permissions.map((p) => ({
            roleId: role.id,
            module: p.module,
            action: p.action,
          })),
        });
      }
      return role;
    });

    return this.get(created.id);
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string;
      permissions?: Array<{
        module: PermissionModule;
        action: PermissionAction;
      }>;
    },
  ) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw DomainException.notFound('Role not found');

    if (
      input.name === undefined &&
      input.description === undefined &&
      input.permissions === undefined
    ) {
      throw DomainException.validation(
        'Provide at least one of name, description, or permissions',
      );
    }

    let nextName: string | undefined;
    if (input.name !== undefined) {
      nextName = this.normalizeRoleName(input.name);
      if (nextName !== existing.name) {
        const clash = await this.prisma.role.findUnique({
          where: { name: nextName },
        });
        if (clash) {
          throw DomainException.conflict(
            `Role name "${nextName}" is already in use`,
          );
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(nextName !== undefined ? { name: nextName } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        },
      });

      if (input.permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (input.permissions.length) {
          await tx.rolePermission.createMany({
            data: input.permissions.map((p) => ({
              roleId: id,
              module: p.module,
              action: p.action,
            })),
          });
        }
      }
    });

    return this.get(id);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw DomainException.notFound('Role not found');
    if (role._count.users > 0) {
      throw DomainException.conflict(
        `Cannot delete role "${role.name}" while assigned to ${role._count.users} user(s)`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.role.delete({ where: { id } }),
    ]);

    return { deleted: true, id, name: role.name };
  }

  async replacePermissions(
    id: string,
    permissions: Array<{ module: PermissionModule; action: PermissionAction }>,
  ) {
    await this.update(id, { permissions });
    return this.getPermissions(id);
  }
}
