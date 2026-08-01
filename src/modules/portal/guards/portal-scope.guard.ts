import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  DomainException,
  ErrorCode,
} from '../../../shared/errors/domain-exception';
import { AuthUser } from '../../../shared/decorators';
import {
  PortalScope,
  PortalScopeService,
} from '../services/portal-scope.service';

@Injectable()
export class PortalScopeGuard implements CanActivate {
  constructor(private readonly scopes: PortalScopeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: AuthUser & { portalScope?: PortalScope };
      params: Record<string, string>;
    }>();
    const user = req.user;
    if (!user?.roles?.includes('parent')) {
      throw DomainException.withCode(
        ErrorCode.FORBIDDEN,
        403,
        'Parent role required',
      );
    }

    let scope: PortalScope | undefined;
    if (user.scope && typeof user.scope === 'object') {
      scope = user.scope as PortalScope;
    } else {
      const resolved = await this.scopes.resolveForUser(user.id);
      if (!resolved) {
        throw DomainException.withCode(
          ErrorCode.FORBIDDEN,
          403,
          'No guardian profile linked',
        );
      }
      scope = resolved;
    }
    req.user!.portalScope = scope;

    const studentId = req.params.studentId;
    if (studentId) {
      this.scopes.assertStudentAccess(scope, studentId);
    }
    return true;
  }
}
