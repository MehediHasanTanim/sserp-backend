import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators';
import { DomainException, ErrorCode } from '../errors/domain-exception';
import { CacheService, CacheKeys } from '../cache/redis.module';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const activated = (await super.canActivate(context)) as boolean;
    if (!activated) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    const blacklisted = await this.cache.get(CacheKeys.jtiBlacklist(user.jti));
    if (blacklisted) {
      throw DomainException.forbidden(
        'Session revoked',
        ErrorCode.UNAUTHENTICATED,
      );
    }

    const path: string = request.route?.path ?? request.url ?? '';
    const allowedWhileMustChange = [
      '/auth/me',
      '/auth/change-password',
      '/auth/logout',
    ];
    const isAllowed = allowedWhileMustChange.some((p) => path.includes(p));
    if (user.mustChangePassword && !isAllowed) {
      throw DomainException.forbidden(
        'Password change required',
        ErrorCode.PASSWORD_CHANGE_REQUIRED,
      );
    }
    return true;
  }
}
