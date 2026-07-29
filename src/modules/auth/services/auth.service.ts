import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DomainException } from '../../../shared/errors/domain-exception';
import { EventNames } from '../../../shared/events/event-names';
import { CacheService, CacheKeys } from '../../../shared/cache/redis.module';
import { PasswordService } from './password.service';
import { LockoutService } from './lockout.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly lockout: LockoutService,
    private readonly tokens: TokenService,
    private readonly events: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  private async loadUserAuth(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
      },
    });
    if (!user) throw DomainException.notFound('User not found');
    const roles = user.roles.map((r) => r.role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap((r) =>
          r.role.permissions.map((p) => `${p.module}:${p.action}`),
        ),
      ),
    ];
    return { user, roles, permissions };
  }

  async login(
    identifier: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.lockout.assertNotLocked(identifier);

    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { username: { equals: identifier, mode: 'insensitive' } },
          { email: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });

    const fail = async (reason: string) => {
      await this.lockout.recordFailure(identifier);
      await this.prisma.loginActivity.create({
        data: {
          userId: user?.id,
          usernameAttempted: identifier,
          outcome: user?.isActive === false ? 'inactive' : 'bad_credentials',
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      await this.events.emitAsync(EventNames.AUTH_LOGIN_FAILED, {
        usernameAttempted: identifier,
        ip: meta.ip,
        reason,
      });
      throw DomainException.invalidCredentials();
    };

    if (!user) await fail('unknown');
    if (!user!.isActive) {
      await this.prisma.loginActivity.create({
        data: {
          userId: user!.id,
          usernameAttempted: identifier,
          outcome: 'inactive',
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      throw DomainException.invalidCredentials();
    }
    if (user!.lockedUntil && user!.lockedUntil > new Date()) {
      throw DomainException.locked();
    }

    const ok = await this.passwords.verify(password, user!.passwordHash);
    if (!ok) await fail('bad_password');

    await this.lockout.reset(identifier);
    const auth = await this.loadUserAuth(user!.id);

    let scope: { studentIds: string[]; guardianProfileId: string } | undefined;
    if (user!.guardianId && auth.roles.includes('parent')) {
      const links = await this.prisma.studentGuardian.findMany({
        where: {
          guardianProfileId: user!.guardianId,
          portalAccessEnabled: true,
          student: {
            deletedAt: null,
            status: { not: 'pending_admission_fee' },
          },
        },
        select: { studentId: true },
      });
      scope = {
        guardianProfileId: user!.guardianId,
        studentIds: [...new Set(links.map((l) => l.studentId))],
      };
    }

    const access = await this.tokens.signAccess({
      sub: user!.id,
      username: user!.username,
      email: user!.email,
      roles: auth.roles,
      permissions: auth.permissions,
      mustChangePassword: user!.mustChangePassword,
      scope,
    });
    const refresh = await this.tokens.issueRefresh({
      userId: user!.id,
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
    });

    await this.prisma.user.update({
      where: { id: user!.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0 },
    });
    await this.prisma.loginActivity.create({
      data: {
        userId: user!.id,
        usernameAttempted: identifier,
        outcome: 'success',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    await this.events.emitAsync(EventNames.AUTH_LOGIN_SUCCEEDED, {
      userId: user!.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.raw,
      expiresAt: refresh.expiresAt,
      user: {
        id: user!.id,
        username: user!.username,
        email: user!.email,
        roles: auth.roles,
        permissions: auth.permissions,
        mustChangePassword: user!.mustChangePassword,
      },
    };
  }

  async refresh(raw: string, meta: { ip?: string; userAgent?: string }) {
    const rotated = await this.tokens.rotateRefresh(raw, meta);
    const auth = await this.loadUserAuth(rotated.userId);
    const access = await this.tokens.signAccess({
      sub: auth.user.id,
      username: auth.user.username,
      email: auth.user.email,
      roles: auth.roles,
      permissions: auth.permissions,
      mustChangePassword: auth.user.mustChangePassword,
    });
    return {
      accessToken: access.token,
      refreshToken: rotated.raw,
      user: {
        id: auth.user.id,
        username: auth.user.username,
        email: auth.user.email,
        roles: auth.roles,
        permissions: auth.permissions,
        mustChangePassword: auth.user.mustChangePassword,
      },
    };
  }

  async logout(rawRefresh: string | undefined, jti?: string) {
    if (rawRefresh) await this.tokens.revokeRaw(rawRefresh);
    if (jti) await this.tokens.blacklistJti(jti, 15 * 60);
  }

  async logoutAll(userId: string, jti?: string) {
    await this.tokens.revokeAllForUser(userId);
    if (jti) await this.tokens.blacklistJti(jti, 15 * 60);
  }

  async me(userId: string) {
    const auth = await this.loadUserAuth(userId);
    return {
      id: auth.user.id,
      username: auth.user.username,
      email: auth.user.email,
      roles: auth.roles,
      permissions: auth.permissions,
      mustChangePassword: auth.user.mustChangePassword,
      lastLoginAt: auth.user.lastLoginAt,
    };
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const ok = await this.passwords.verify(current, user.passwordHash);
    if (!ok)
      throw DomainException.invalidCredentials('Current password is incorrect');
    await this.passwords.assertNotInHistoryAsync(next, user.passwordHistory);
    const hash = await this.passwords.hash(next);
    const history = [...user.passwordHistory, user.passwordHash].slice(-3);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        passwordHistory: history,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await this.tokens.revokeAllForUser(userId);
  }

  async forgotPassword(identifier: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { username: { equals: identifier, mode: 'insensitive' } },
          { email: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });
    if (!user) return;
    const token = randomUUID();
    await this.cache.set(CacheKeys.passwordReset(token), user.id, 3600);
    // Phase 0: no email send beyond console log
    // eslint-disable-next-line no-console
    console.log(`[password-reset] token for ${user.email}: ${token}`);
  }

  async resetPassword(token: string, newPassword: string) {
    const userId = await this.cache.get(CacheKeys.passwordReset(token));
    if (!userId)
      throw DomainException.unprocessable('Invalid or expired reset token');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await this.passwords.assertNotInHistoryAsync(
      newPassword,
      user.passwordHistory,
    );
    const hash = await this.passwords.hash(newPassword);
    const history = [...user.passwordHistory, user.passwordHash].slice(-3);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        passwordHistory: history,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await this.cache.del(CacheKeys.passwordReset(token));
    await this.tokens.revokeAllForUser(userId);
  }
}
