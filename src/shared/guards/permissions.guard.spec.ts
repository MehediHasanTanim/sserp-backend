import { PermissionsGuard } from './permissions.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

function ctx(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === 'isPublic') return false;
      if (key === 'permissions') return ['admin:read'];
      return undefined;
    },
  } as unknown as Reflector;

  const guard = new PermissionsGuard(reflector);

  it('grants on exact match', () => {
    expect(
      guard.canActivate(ctx({ permissions: ['admin:read', 'admin:update'] })),
    ).toBe(true);
  });

  it('denies on missing permission', () => {
    expect(() =>
      guard.canActivate(ctx({ permissions: ['school:read'] })),
    ).toThrow();
  });
});

describe('PermissionsGuard public bypass', () => {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === 'isPublic' ? true : ['admin:read'],
  } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  it('bypasses @Public()', () => {
    expect(guard.canActivate(ctx({ permissions: [] }))).toBe(true);
  });
});
