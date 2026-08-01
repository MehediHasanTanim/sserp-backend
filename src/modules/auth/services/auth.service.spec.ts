import { AuthService } from './auth.service';

describe('AuthService password expiry', () => {
  function build(opts: {
    passwordChangedAt: Date;
    passwordMaxAgeDays: number | null;
    mustChangePassword?: boolean;
  }) {
    const user = {
      id: 'u1',
      username: 'alice',
      email: 'a@x.com',
      passwordHash: 'hash',
      isActive: true,
      lockedUntil: null,
      mustChangePassword: opts.mustChangePassword ?? false,
      passwordChangedAt: opts.passwordChangedAt,
      guardianId: null,
      failedLoginAttempts: 0,
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...user,
          roles: [{ role: { name: 'teacher', permissions: [] } }],
        }),
        update: jest.fn().mockResolvedValue(user),
      },
      organizationSettings: {
        findFirst: jest.fn().mockResolvedValue({
          passwordMaxAgeDays: opts.passwordMaxAgeDays,
        }),
      },
      loginActivity: { create: jest.fn() },
      studentGuardian: { findMany: jest.fn() },
    };
    const passwords = {
      verify: jest.fn().mockResolvedValue(true),
    };
    const lockout = {
      assertNotLocked: jest.fn(),
      recordFailure: jest.fn(),
      reset: jest.fn(),
    };
    const tokens = {
      signAccess: jest.fn().mockResolvedValue({ token: 'a' }),
      issueRefresh: jest
        .fn()
        .mockResolvedValue({ raw: 'r', expiresAt: new Date() }),
    };
    const events = { emitAsync: jest.fn() };
    const cache = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
    const service = new AuthService(
      prisma as any,
      passwords as any,
      lockout as any,
      tokens as any,
      events as any,
      cache as any,
    );
    // loadUserAuth uses findFirst with include — stub second call path via spy
    (service as any).loadUserAuth = jest.fn().mockResolvedValue({
      user,
      roles: ['teacher'],
      permissions: [],
    });
    return { service, tokens, prisma };
  }

  it('forces mustChangePassword when passwordChangedAt exceeds max age', async () => {
    const aged = new Date();
    aged.setUTCDate(aged.getUTCDate() - 100);
    const { service, tokens, prisma } = build({
      passwordChangedAt: aged,
      passwordMaxAgeDays: 90,
    });
    const result = await service.login('alice', 'pw', {});
    expect(result.user.mustChangePassword).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mustChangePassword: true }),
      }),
    );
    expect(tokens.signAccess).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: true }),
    );
  });

  it('does not force change when max age is null', async () => {
    const aged = new Date();
    aged.setUTCDate(aged.getUTCDate() - 400);
    const { service } = build({
      passwordChangedAt: aged,
      passwordMaxAgeDays: null,
    });
    const result = await service.login('alice', 'pw', {});
    expect(result.user.mustChangePassword).toBe(false);
  });
});
