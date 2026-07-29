import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === 'isPublic') return false;
      if (key === 'roles') return ['super_admin', 'principal'];
      return undefined;
    },
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  const ctx = (roles: string[]) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as unknown as ExecutionContext;

  it('matches any-of-many roles', () => {
    expect(guard.canActivate(ctx(['principal']))).toBe(true);
  });

  it('denies missing role', () => {
    expect(() => guard.canActivate(ctx(['teacher']))).toThrow();
  });
});
