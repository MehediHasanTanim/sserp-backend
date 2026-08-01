import {
  Injectable,
  NestMiddleware,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../../../shared/cache/redis.module';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { AuthUser } from '../../../shared/decorators';
import { ORG_SETTINGS_ID } from '../../notifications/constants';

const IDLE_KEY = (userId: string) => `session:last_activity:${userId}`;

@Injectable()
export class IdleTimeoutService {
  constructor(
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
  ) {}

  async touch(userId: string) {
    const org = await this.prisma.organizationSettings.findUnique({
      where: { id: ORG_SETTINGS_ID },
    });
    const minutes = org?.sessionIdleTimeoutMinutes ?? 30;
    await this.cache.client.set(
      IDLE_KEY(userId),
      Date.now().toString(),
      'EX',
      minutes * 60,
    );
  }

  async assertNotIdle(userId: string) {
    const org = await this.prisma.organizationSettings.findUnique({
      where: { id: ORG_SETTINGS_ID },
    });
    const minutes = org?.sessionIdleTimeoutMinutes ?? 30;
    const raw = await this.cache.client.get(IDLE_KEY(userId));
    if (raw) {
      const last = Number(raw);
      if (Date.now() - last > minutes * 60 * 1000) {
        await this.cache.client.del(IDLE_KEY(userId));
        throw new DomainException(
          ErrorCode.SESSION_IDLE_TIMEOUT,
          401,
          'Session idle timeout exceeded',
        );
      }
    }
    await this.touch(userId);
  }
}

@Injectable()
export class IdleTimeoutGuard implements CanActivate {
  constructor(private readonly idle: IdleTimeoutService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (req.user?.id) {
      await this.idle.assertNotIdle(req.user.id);
    }
    return true;
  }
}

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      // Issue CSRF cookie for subsequent mutating requests
      if (!req.cookies?.['csrf_token']) {
        const token = Buffer.from(cryptoRandom()).toString('base64url');
        res.cookie('csrf_token', token, {
          httpOnly: false,
          sameSite: 'strict',
          secure: process.env.COOKIE_SECURE === 'true',
          path: '/',
        });
      }
      return next();
    }
    const cookie = req.cookies?.['csrf_token'];
    const header = req.headers['x-csrf-token'];
    if (!cookie || !header || cookie !== header) {
      return res.status(403).json({
        success: false,
        error: { code: 'CSRF_REJECTED', message: 'Invalid CSRF token' },
      });
    }
    return next();
  }
}

function cryptoRandom() {
  const { randomBytes } = require('crypto') as typeof import('crypto');
  return randomBytes(32);
}

@Injectable()
export class SuperAdminIpAllowlistGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();
    if (!req.user?.roles?.includes('super_admin')) return true;
    const org = await this.prisma.organizationSettings.findUnique({
      where: { id: ORG_SETTINGS_ID },
    });
    const list = org?.superAdminIpAllowlist;
    if (!list || !Array.isArray(list) || list.length === 0) return true;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      '';
    if (!list.map(String).includes(ip)) {
      throw DomainException.forbidden('IP not allowlisted for super_admin');
    }
    return true;
  }
}
