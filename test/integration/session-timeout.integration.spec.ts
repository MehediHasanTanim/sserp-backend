/**
 * Lightweight session-timeout suite (H-05).
 */
import { IdleTimeoutService } from '../../src/modules/hardening/middleware/security.middleware';
import {
  ErrorCode,
  DomainException,
} from '../../src/shared/errors/domain-exception';

describe('Session timeout (H-05)', () => {
  it('rejects after idle window', async () => {
    const cache = {
      client: {
        get: jest.fn().mockResolvedValue(String(Date.now() - 60 * 60 * 1000)),
        set: jest.fn(),
        del: jest.fn(),
      },
    };
    const prisma = {
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({
          sessionIdleTimeoutMinutes: 30,
        }),
      },
    };
    const svc = new IdleTimeoutService(cache as never, prisma as never);
    await expect(svc.assertNotIdle('u1')).rejects.toMatchObject({
      code: ErrorCode.SESSION_IDLE_TIMEOUT,
    });
  });

  it('refreshes activity within window', async () => {
    const cache = {
      client: {
        get: jest.fn().mockResolvedValue(String(Date.now() - 60_000)),
        set: jest.fn(),
        del: jest.fn(),
      },
    };
    const prisma = {
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({
          sessionIdleTimeoutMinutes: 30,
        }),
      },
    };
    const svc = new IdleTimeoutService(cache as never, prisma as never);
    await expect(svc.assertNotIdle('u1')).resolves.toBeUndefined();
    expect(cache.client.set).toHaveBeenCalled();
  });
});
