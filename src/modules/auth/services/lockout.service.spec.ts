import { LockoutService } from './lockout.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../../shared/cache/redis.module';

describe('LockoutService', () => {
  const store = new Map<string, { value: string; ttl?: number }>();
  const cache = {
    get: async (k: string) => store.get(k)?.value ?? null,
    incr: async (k: string) => {
      const cur = Number(store.get(k)?.value ?? 0) + 1;
      store.set(k, { value: String(cur), ttl: store.get(k)?.ttl });
      return cur;
    },
    expire: async (k: string, ttl: number) => {
      const cur = store.get(k);
      store.set(k, { value: cur?.value ?? '0', ttl });
    },
    del: async (...keys: string[]) => keys.forEach((k) => store.delete(k)),
  } as unknown as CacheService;

  const config = {
    get: (key: string) => {
      if (key === 'lockout.maxAttempts') return 5;
      if (key === 'lockout.durationMinutes') return 15;
      return undefined;
    },
  } as unknown as ConfigService;

  const service = new LockoutService(cache, config);

  beforeEach(() => store.clear());

  it('locks at exactly 5 failures', async () => {
    for (let i = 0; i < 4; i++) {
      await service.recordFailure('alice');
      await service.assertNotLocked('alice');
    }
    await service.recordFailure('alice');
    await expect(service.assertNotLocked('alice')).rejects.toMatchObject({
      statusCode: 423,
    });
  });

  it('resets on unlock', async () => {
    for (let i = 0; i < 5; i++) await service.recordFailure('bob');
    await service.unlock('bob');
    await expect(service.assertNotLocked('bob')).resolves.toBeUndefined();
  });
});
